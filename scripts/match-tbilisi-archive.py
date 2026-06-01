#!/usr/bin/env python3
"""Match public/data/tbilisi-churches.json entries against the archival
catalog at archival-services.gov.ge and tag each JSON row with `inArchive`.

Strategy: normalize Georgian church names (strip punctuation, parenthetical
record-type markers, common nouns like "ეკლესია"), then compute token-set
Jaccard similarity. A JSON row is `inArchive: true` if it best-matches some
catalog row above THRESHOLD; otherwise false. Writes a report + new JSON.
"""
import json, re, sys, urllib.request
from pathlib import Path

JSON_PATH = Path("public/data/tbilisi-churches.json")
REPORT_PATH = Path("/mnt/documents/tbilisi-archive-match.json")
URL = "https://archival-services.gov.ge/saeklesio/regions/location/55"
THRESHOLD = 0.5

# Words that don't help discriminate names — drop during normalization.
STOP_TOKENS = {
    "ეკლესია", "ეკლესიის",
    "ტაძარი", "ტაძრის",
    "სამლოცველო", "სამლოცველოს",
    "თემი", "თემის",
    "კირხე",
    "წმ", "წმინდა",  # "saint" abbrev/full
    "და",            # "and"
    "I", "II", "III",
}

PAREN_RE = re.compile(r"\([^)]*\)")
PUNCT_RE = re.compile(r"[.,;:!?\"'`«»“”‘’\-—–/\\]")
SPACES_RE = re.compile(r"\s+")
LATIN_DIGIT_RE = re.compile(r"[a-zA-Z0-9]+")


def normalize(s: str) -> list[str]:
    if not s:
        return []
    s = PAREN_RE.sub(" ", s)
    s = PUNCT_RE.sub(" ", s)
    s = SPACES_RE.sub(" ", s).strip().lower()
    toks = [t for t in s.split() if t and t not in STOP_TOKENS and not LATIN_DIGIT_RE.fullmatch(t)]
    # Strip common Georgian genitive ending "-ის" to make e.g.
    # "მარინეს" and "მარინე" comparable. Keep tokens of length <= 3 intact.
    def stem(t: str) -> str:
        for suf in ("ისა", "ის", "ს", "ი"):
            if len(t) > len(suf) + 2 and t.endswith(suf):
                return t[: -len(suf)]
        return t
    return sorted({stem(t) for t in toks})


def jaccard(a: list[str], b: list[str]) -> float:
    if not a or not b:
        return 0.0
    sa, sb = set(a), set(b)
    inter = len(sa & sb)
    union = len(sa | sb)
    return inter / union if union else 0.0


def fetch_catalog() -> list[str]:
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        html = r.read().decode("utf-8", errors="replace")
    # Parse rows of the table: <tr>...<td>N</td><td>settlement</td><td>NAME</td>...
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S | re.I)
    names: list[str] = []
    for row in rows:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S | re.I)
        if len(cells) < 3:
            continue
        # The N cell must look like a number to be a data row.
        n = re.sub(r"<[^>]+>", "", cells[0]).strip()
        if not n.isdigit():
            continue
        raw = re.sub(r"<[^>]+>", "", cells[2])
        raw = raw.replace("&nbsp;", " ").strip()
        if raw:
            names.append(raw)
    return names


def main():
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    catalog = fetch_catalog()
    print(f"catalog rows: {len(catalog)}  json rows: {len(data)}")

    cat_norm = [(name, normalize(name)) for name in catalog]

    matched, unmatched, low = [], [], []
    for c in data:
        ka = c.get("name", {}).get("ka", "")
        j_tokens = normalize(ka)
        best_score, best_name = 0.0, ""
        for cname, ctoks in cat_norm:
            s = jaccard(j_tokens, ctoks)
            if s > best_score:
                best_score, best_name = s, cname
        entry = {
            "id": c["id"],
            "ka": ka,
            "en": c.get("name", {}).get("en", ""),
            "best_match": best_name,
            "score": round(best_score, 3),
        }
        in_archive = best_score >= THRESHOLD
        c["inArchive"] = in_archive
        if in_archive:
            matched.append(entry)
            if best_score < 0.75:
                low.append(entry)
        else:
            unmatched.append(entry)

    JSON_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps({
        "threshold": THRESHOLD,
        "catalog_count": len(catalog),
        "json_count": len(data),
        "matched_count": len(matched),
        "unmatched_count": len(unmatched),
        "low_confidence_count": len(low),
        "unmatched": unmatched,
        "low_confidence": low,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"matched: {len(matched)}  unmatched: {len(unmatched)}  low-conf: {len(low)}")
    print(f"report  → {REPORT_PATH}")
    print(f"updated → {JSON_PATH}")
    if unmatched:
        print("\nUnmatched samples:")
        for e in unmatched[:20]:
            print(f"  id={e['id']:>3}  {e['ka']!r}  best={e['best_match']!r} score={e['score']}")


if __name__ == "__main__":
    sys.exit(main())
