#!/usr/bin/env python3
"""Scrape https://archival-services.gov.ge/saeklesio/ location pages and match
their rows against features in public/data/parishes.geojson. Emit SQL INSERTs
for the external_sources table.

The NIAG (National Archives of Georgia) site organizes parish registers by
modern raions (IDs 1-56, 84, 85) AND historical mazras/uezds (IDs 57-80).
A given church often appears on BOTH pages (raion + mazra), so a feature can
get multiple links.
"""
import json
import re
import sys
import time
import unicodedata
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX_URL = "https://archival-services.gov.ge/saeklesio/"
LOC_URL = "https://archival-services.gov.ge/saeklesio/regions/location/{id}"

# Hand-curated from the landing page (Georgian raions + mazras)
RAIONS = {
    1: "აბაშა", 2: "ამბროლაური", 3: "ასპინძა", 4: "ახალქალაქი", 5: "ახალციხე",
    6: "ახმეტა", 7: "ბაღდათი", 8: "ბოლნისი", 9: "ბორჯომი", 10: "გარეუბანი",
    11: "გორი", 12: "გურჯაანი", 13: "დედოფლისწყარო", 14: "დმანისი",
    15: "დუშეთი", 16: "ვანი", 17: "ზესტაფონი", 18: "ზუგდიდი",
    19: "თეთრიწყარო", 20: "თელავი", 21: "თერჯოლა", 22: "თიანეთი",
    23: "კასპი", 24: "ლაგოდეხი", 25: "ლანჩხუთი", 26: "ლენტეხი",
    27: "მარნეული", 28: "მარტვილი", 29: "მესტია", 30: "მცხეთა",
    31: "ოზურგეთი", 32: "ონი", 33: "საგარეჯო", 34: "სამტრედია",
    35: "საჩხერე", 36: "სენაკი", 37: "სიღნაღი", 38: "სტეფანწმინდა",
    39: "ტყიბული", 40: "ფოთი", 41: "ქარელი", 42: "ქუთაისი", 43: "ყვარელი",
    44: "ჩოხატაური", 45: "ჩხოროწყუ", 46: "ცაგერი", 47: "წალენჯიხა",
    48: "წალკა", 49: "წყალტუბო", 50: "ჭიათურა", 51: "ხარაგაული",
    52: "ხაშური", 53: "ხობი", 54: "ხონი", 55: "თბილისი", 56: "ადიგენი",
    84: "ნინოწმინდა", 85: "გარდაბანი",
}
MAZRAS = {
    57: "თბილისის მაზრა", 58: "გორის მაზრა", 59: "სიღნაღის მაზრა",
    60: "თელავის მაზრა", 61: "დუშეთის მაზრა", 62: "ქუთაისის მაზრა",
    63: "რაჭის მაზრა", 64: "ვაკის მაზრა", 65: "შორაპნის მაზრა",
    66: "ახალციხის მაზრა", 69: "იმერეთი", 70: "თიანეთი", 71: "სენაკი",
    72: "ლეჩხუმი", 75: "ზუგდიდი", 79: "ოზურგეთი", 80: "ზაქათალას ოლქი",
}
ALL_LOCS = {**RAIONS, **MAZRAS}


class RowParser(HTMLParser):
    """Pull table rows out of the location page."""
    def __init__(self):
        super().__init__()
        self.in_tr = False
        self.in_td = False
        self.current_row: list[str] = []
        self.current_cell: list[str] = []
        self.rows: list[list[str]] = []

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.in_tr = True
            self.current_row = []
        elif tag == "td" and self.in_tr:
            self.in_td = True
            self.current_cell = []

    def handle_endtag(self, tag):
        if tag == "td" and self.in_td:
            self.current_row.append("".join(self.current_cell).strip())
            self.in_td = False
        elif tag == "tr" and self.in_tr:
            if len(self.current_row) >= 4:  # skip header / spacers
                self.rows.append(self.current_row)
            self.in_tr = False

    def handle_data(self, data):
        if self.in_td:
            self.current_cell.append(data)


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "metrics.datatells.info/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")


def norm(s: str) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKC", s).lower()
    # Strip common Georgian punctuation, parens, abbreviation dots
    s = re.sub(r"[.\,\;\:\(\)\[\]\"'`«»\-—–]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    # Drop common qualifier words that float around
    for noise in [" წმ ", " წმინდა ", " ეკლესია ", " ტაძარი ", " ტაძარის ", " ეკლესიის "]:
        s = (" " + s + " ").replace(noise, " ").strip()
    return re.sub(r"\s+", " ", s).strip()


def keys(name: str) -> set[str]:
    """Generate matchable keys from a name (full normalized + first 2 words)."""
    n = norm(name)
    if not n:
        return set()
    out = {n}
    parts = n.split()
    if len(parts) >= 2:
        out.add(" ".join(parts[:2]))
    if len(parts) >= 1:
        out.add(parts[0])
    return out


def scrape_all() -> list[dict]:
    """Returns list of {loc_id, loc_name, settlement, church, years, missing, note}."""
    rows = []
    for loc_id, loc_name in sorted(ALL_LOCS.items()):
        url = LOC_URL.format(id=loc_id)
        sys.stderr.write(f"fetching {loc_id} {loc_name}…\n")
        try:
            html = fetch(url)
        except Exception as e:
            sys.stderr.write(f"  ERR {e}\n")
            continue
        p = RowParser()
        p.feed(html)
        for r in p.rows:
            # Expected: [N, settlement, church, years, missing, note]
            if len(r) < 4:
                continue
            try:
                int(r[0])
            except ValueError:
                continue
            settlement = r[1]
            church = r[2]
            years = r[3] if len(r) > 3 else ""
            missing = r[4] if len(r) > 4 else ""
            note = r[5] if len(r) > 5 else ""
            rows.append({
                "loc_id": loc_id, "loc_name": loc_name,
                "settlement": settlement, "church": church,
                "years": years, "missing": missing, "note": note,
            })
        time.sleep(0.2)
    return rows


def match_features(geojson_path: Path, archive_rows: list[dict]) -> list[dict]:
    fc = json.loads(geojson_path.read_text())
    features = fc["features"]

    # Build settlement → list of archive rows (with their loc_id) index
    settle_index: dict[str, list[dict]] = {}
    for ar in archive_rows:
        for k in keys(ar["settlement"]):
            settle_index.setdefault(k, []).append(ar)

    out = []
    for feat in features:
        p = feat["properties"]
        fid = feat["id"]
        s_ka = (p.get("settlement") or {}).get("ka") or ""
        c_ka = (p.get("church") or {}).get("ka") or ""
        if not s_ka or s_ka == "-":
            # Some features have settlement="-" but church is set; try matching by
            # church only — useful for monastic / house churches.
            candidate_rows: list[dict] = []
        else:
            seen_ids = set()
            candidate_rows = []
            for k in keys(s_ka):
                for ar in settle_index.get(k, []):
                    key = (ar["loc_id"], ar["settlement"], ar["church"])
                    if key in seen_ids:
                        continue
                    seen_ids.add(key)
                    candidate_rows.append(ar)

        if not candidate_rows:
            continue

        # Score candidates: prefer those whose church name also matches the
        # feature's church, then collapse to one row per loc_id (best score).
        feat_church_keys = keys(c_ka) if c_ka else set()
        # Also try matching by year range to disambiguate
        s_year = p.get("startYear")
        e_year = p.get("endYear")

        best_per_loc: dict[int, tuple[int, dict]] = {}
        for ar in candidate_rows:
            score = 0
            ar_ck = keys(ar["church"])
            if feat_church_keys and (feat_church_keys & ar_ck):
                score += 10
            # Bonus: a token of the church name appears anywhere
            if c_ka and norm(c_ka) and any(tok and tok in norm(ar["church"]) for tok in norm(c_ka).split()):
                score += 2
            # Year overlap
            try:
                ar_years = re.findall(r"\d{4}", ar["years"])
                if ar_years and s_year and e_year:
                    ay1, ay2 = int(ar_years[0]), int(ar_years[-1])
                    if not (e_year < ay1 or s_year > ay2):
                        score += 1
            except Exception:
                pass
            prev = best_per_loc.get(ar["loc_id"])
            if prev is None or score > prev[0]:
                best_per_loc[ar["loc_id"]] = (score, ar)

        for loc_id, (score, ar) in best_per_loc.items():
            out.append({
                "feature_id": fid,
                "loc_id": loc_id,
                "loc_name": ar["loc_name"],
                "settlement": ar["settlement"],
                "church": ar["church"],
                "years": ar["years"],
                "score": score,
            })
    return out


def sql_escape(s: str) -> str:
    return (s or "").replace("'", "''")


def emit_sql(matches: list[dict], out_path: Path):
    lines = [
        "-- Auto-generated by scripts/niag_match.py",
        "-- NIAG (National Archives of Georgia) parish-register links per feature.",
        "BEGIN;",
        "DELETE FROM public.external_sources WHERE provider = 'niag';",
    ]
    # Batch INSERT
    values = []
    for m in matches:
        url = LOC_URL.format(id=m["loc_id"])
        title = f"НИАГ · {m['loc_name']}"
        desc_parts = []
        if m["church"]:
            desc_parts.append(m["church"])
        if m["years"]:
            desc_parts.append(m["years"])
        description = " · ".join(desc_parts)
        values.append(
            "('niag','feature',{fid},NULL,NULL,'{url}','{title}','{desc}',NULL,false)".format(
                fid=m["feature_id"],
                url=sql_escape(url),
                title=sql_escape(title),
                desc=sql_escape(description),
            )
        )
    # Chunk to avoid huge single statements
    CHUNK = 500
    for i in range(0, len(values), CHUNK):
        chunk = values[i:i + CHUNK]
        lines.append(
            "INSERT INTO public.external_sources "
            "(provider, scope, feature_id, uezd_ru, uezd_en, url, title, description, place_query, requires_auth) VALUES\n  "
            + ",\n  ".join(chunk) + ";"
        )
    lines.append("COMMIT;")
    out_path.write_text("\n".join(lines) + "\n")


def main():
    cache_path = ROOT / "scripts" / ".niag_cache.json"
    if cache_path.exists() and "--refresh" not in sys.argv:
        archive_rows = json.loads(cache_path.read_text())
        sys.stderr.write(f"loaded {len(archive_rows)} rows from cache\n")
    else:
        archive_rows = scrape_all()
        cache_path.write_text(json.dumps(archive_rows, ensure_ascii=False))
        sys.stderr.write(f"scraped {len(archive_rows)} rows → cache\n")

    matches = match_features(ROOT / "public/data/parishes.geojson", archive_rows)
    sys.stderr.write(f"{len(matches)} matches across {len({m['feature_id'] for m in matches})} features\n")

    out = ROOT / "scripts" / "niag_inserts.sql"
    emit_sql(matches, out)
    sys.stderr.write(f"wrote {out}\n")


if __name__ == "__main__":
    main()
