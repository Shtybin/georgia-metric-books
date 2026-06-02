#!/usr/bin/env python3
"""
1) Add 4 churches present in the official archival catalog but missing from
   the map (German Lutheran kirche, 14/15/16 Caucasian Grenadier regiments).
2) Re-link archiveRows on every existing point so all 145 catalog rows are
   referenced (fixes merge-script gaps for marriage/death rows of Armenian
   merged points and for homonyms like #9 / #55 St. Nicholas).

Run:  python3 scripts/fix-tbilisi-missing.py
"""
import json, re, urllib.request
from collections import defaultdict
from pathlib import Path

JSON_PATH = Path("public/data/tbilisi-churches.json")
ARCHIVE_URL = "https://archival-services.gov.ge/saeklesio/regions/location/55"

TYPE_KA = {"დაბადება": "birth", "ჯვრისწერა": "marriage", "გარდაცვალება": "death"}
TYPE_RE = re.compile(r"\s*\(([^)]+)\)\s*$")


def base_ka(name: str) -> str:
    return TYPE_RE.sub("", name).strip().lower()


def parse_years(s):
    nums = re.findall(r"\d{4}", s or "")
    if not nums:
        return None, None
    a = int(nums[0])
    b = int(nums[1]) if len(nums) > 1 else a
    return a, b


def fetch_catalog():
    req = urllib.request.Request(ARCHIVE_URL, headers={"User-Agent": "Mozilla/5.0"})
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    out = []
    for r in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S | re.I):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", r, re.S | re.I)
        if len(cells) < 4:
            continue
        c = [re.sub(r"<[^>]+>", "", x).replace("&nbsp;", " ").strip() for x in cells]
        if not c[0].isdigit():
            continue
        m = TYPE_RE.search(c[2])
        rt = TYPE_KA.get(m.group(1).strip()) if m else None
        out.append({"n": int(c[0]), "name": c[2], "base": base_ka(c[2]), "type": rt, "years": c[3]})
    return out


# ---------- new entries ----------
# Coordinates: approximate, historically anchored locations.
# Confidence flagged low_approx so users see they're not surveyed.
NEW_ENTRIES = [
    {
        "id": 8,
        "name": {
            "ka": "ევანგელისტურ-ლუთერანული (გერმანული კირხე)",
            "ru": "Евангелическо-лютеранская (немецкая кирха)",
            "en": "Evangelical Lutheran (German Kirche)",
        },
        "confession": "lutheran",
        "confessionRaw": "Lutheran",
        "address": "ул. Марджанишвили (бывшая Михайловская)",
        "district": "Чугурети / Марджанишвили",
        # Marjanishvili Square — site of the German Kirche (destroyed 1946).
        "lat": 41.7165,
        "lon": 44.7950,
        "preserved": "no",
        "active": "no",
        "recordYears": "1873-1921",
        "startYear": 1873,
        "endYear": 1921,
        "missingYears": "",
        "note": "Главный лютеранский храм немецкой общины Тифлиса; снесён в 1946 г.",
        "confidence": "low_approx",
        "historicalNote": "Построена немецкими колонистами в 1894–1897 гг. на Михайловском проспекте.",
    },
    {
        "id": 43,
        "name": {
            "ka": "კავკასიის არმიის გრენადერთა მე-14 ქართული პოლკის",
            "ru": "Полковая церковь 14-го гренадерского Грузинского полка Кавказской армии",
            "en": "Regimental church of the 14th Georgian Grenadier Regiment (Caucasian Army)",
        },
        "confession": "orthodox_military",
        "confessionRaw": "Russian Orthodox (Military)",
        "address": "Военный городок (Навтлуги/Авлабар)",
        "district": "Навтлуги",
        "lat": 41.6850,
        "lon": 44.8340,
        "preserved": "uncertain",
        "active": "no",
        "recordYears": "1871-1906",
        "startYear": 1871,
        "endYear": 1906,
        "missingYears": "",
        "note": "Полковой храм; точное местоположение требует уточнения.",
        "confidence": "low_approx",
        "historicalNote": "14-й гренадерский Грузинский полк квартировал в Тифлисе во второй половине XIX в.",
    },
    {
        "id": 44,
        "name": {
            "ka": "კავკასიის არმიის გრენადერთა მე-15 ქართული პოლკის",
            "ru": "Полковая церковь 15-го гренадерского Тифлисского полка Кавказской армии",
            "en": "Regimental church of the 15th Tiflis Grenadier Regiment (Caucasian Army)",
        },
        "confession": "orthodox_military",
        "confessionRaw": "Russian Orthodox (Military)",
        "address": "Военный городок (Навтлуги/Авлабар)",
        "district": "Навтлуги",
        "lat": 41.6855,
        "lon": 44.8360,
        "preserved": "uncertain",
        "active": "no",
        "recordYears": "1862-1910",
        "startYear": 1862,
        "endYear": 1910,
        "missingYears": "",
        "note": "Полковой храм; точное местоположение требует уточнения.",
        "confidence": "low_approx",
        "historicalNote": "15-й гренадерский Тифлисский полк квартировал в Тифлисе.",
    },
    {
        "id": 45,
        "name": {
            "ka": "კავკასიის არმიის გრენადერთა მე-16 ქართული პოლკის",
            "ru": "Полковая церковь 16-го гренадерского Мингрельского полка Кавказской армии",
            "en": "Regimental church of the 16th Mingrelian Grenadier Regiment (Caucasian Army)",
        },
        "confession": "orthodox_military",
        "confessionRaw": "Russian Orthodox (Military)",
        "address": "Военный городок (Навтлуги/Авлабар)",
        "district": "Навтлуги",
        "lat": 41.6860,
        "lon": 44.8380,
        "preserved": "uncertain",
        "active": "no",
        "recordYears": "1866-1912",
        "startYear": 1866,
        "endYear": 1912,
        "missingYears": "",
        "note": "Полковой храм; точное местоположение требует уточнения.",
        "confidence": "low_approx",
        "historicalNote": "16-й гренадерский Мингрельский полк квартировал в Тифлисе.",
    },
]


def main():
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    by_id = {c["id"]: c for c in data}
    catalog = fetch_catalog()

    # 1) Add missing entries (skip if already present).
    added = 0
    for e in NEW_ENTRIES:
        if e["id"] in by_id:
            continue
        data.append(e)
        by_id[e["id"]] = e
        added += 1
    print(f"Added {added} new church point(s).")

    # Index catalog by base name.
    cat_by_base = defaultdict(list)
    for r in catalog:
        cat_by_base[r["base"]].append(r)

    cat_by_n = {r["n"]: r for r in catalog}

    # 2) Re-link archiveRows on every entry.
    linked_n = set()
    for c in data:
        b = base_ka(c["name"]["ka"])
        candidates = cat_by_base.get(b, [])

        # If the KA name is truncated (ends with "...") or no base match,
        # but the entry id equals a catalog row number, trust the id link
        # and restore the full KA name from the catalog.
        if not candidates and c["id"] in cat_by_n:
            full = cat_by_n[c["id"]]
            c["name"]["ka"] = TYPE_RE.sub("", full["name"]).strip()
            b = base_ka(c["name"]["ka"])
            candidates = cat_by_base.get(b, [])

        if not candidates:
            continue

        siblings = [x for x in data if base_ka(x["name"]["ka"]) == b]
        if len(siblings) > 1:
            # Homonym group (e.g. two "Св. Николая"): pick the catalog row
            # whose number equals this entry's id, if it exists.
            picked = [r for r in candidates if r["n"] == c["id"]]
        else:
            # Unique base name → attach ALL catalog rows for this base.
            picked = list(candidates)

        if not picked:
            continue

        rows = sorted(
            [{"n": r["n"], "type": r["type"], "years": r["years"]} for r in picked],
            key=lambda x: x["n"],
        )
        c["archiveUrl"] = ARCHIVE_URL
        c["archiveRows"] = rows
        for r in rows:
            linked_n.add(r["n"])

        # Recompute recordsByType union when multiple types are linked.
        rbt = {}
        for r in picked:
            if r["type"] and r["years"]:
                rbt.setdefault(r["type"], r["years"])
        if rbt:
            ordered = {}
            for k in ("birth", "marriage", "death"):
                if k in rbt:
                    ordered[k] = rbt[k]
            c["recordsByType"] = ordered
            mins, maxs = [], []
            for ys in rbt.values():
                a, b2 = parse_years(ys)
                if a is not None:
                    mins.append(a)
                if b2 is not None:
                    maxs.append(b2)
            if mins and maxs:
                c["startYear"] = min(mins)
                c["endYear"] = max(maxs)
                c["recordYears"] = f"{min(mins)}-{max(maxs)}"

    data.sort(key=lambda c: c["id"])
    JSON_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"\nTotal entries: {len(data)}")
    print(f"Catalog rows linked: {len(linked_n)} / {len(catalog)}")
    unlinked = sorted(r["n"] for r in catalog if r["n"] not in linked_n)
    if unlinked:
        print(f"Still unlinked: {unlinked}")
        for r in catalog:
            if r["n"] in unlinked:
                print(f"  #{r['n']:>3}  {r['name']}")


if __name__ == "__main__":
    main()
