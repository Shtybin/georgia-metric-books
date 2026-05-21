#!/usr/bin/env python3
import csv, json, re, sys

SRC = "/tmp/tc.txt"
DST = "public/data/tbilisi-churches.json"

CONFESSION_MAP = [
    ("Orthodox (Georgian Exarchate)", "orthodox_georgian"),
    ("Orthodox (Georgian)", "orthodox_georgian"),
    ("Orthodox (Georgian/Military)", "orthodox_military"),
    ("Orthodox (Russian/Georgian)", "orthodox_russian"),
    ("Orthodox (Russian)", "orthodox_russian"),
    ("Russian Orthodox (Military)", "orthodox_military"),
    ("Armenian Apostolic", "armenian_apostolic"),
    ("Greek Orthodox", "greek_orthodox"),
    ("Roman Catholic", "roman_catholic"),
    ("Lutheran", "lutheran"),
    ("Jewish", "jewish"),
    ("Molokan (Spiritual Christian)", "molokan"),
    ("Baptist", "baptist"),
]
ASSYRIAN_HINT = re.compile(r"assyrian|aysor|აისორ", re.I)

def map_confession(raw):
    s = raw.strip()
    if ASSYRIAN_HINT.search(s):
        return "assyrian"
    for k, v in CONFESSION_MAP:
        if s == k: return v
    # Heuristic: row 5 has bad data — confession="Kukia/Vera area"
    if "kukia" in s.lower() or "vera" in s.lower():
        return "assyrian"
    return "other"

def map_confidence(raw):
    s = (raw or "").strip().lower()
    if s == "high": return "high"
    if s == "medium": return "medium"
    if "approx" in s: return "low_approx"
    if "district" in s: return "low_district"
    if s == "low": return "low"
    return "unknown"

def parse_years(s):
    s = (s or "").strip()
    m = re.match(r"^(\d{4})(?:-(\d{4}))?$", s)
    if not m: 
        # try first 4-digit pair
        nums = re.findall(r"\d{4}", s)
        if not nums: return None, None
        a = int(nums[0]); b = int(nums[1]) if len(nums) > 1 else a
        return a, b
    a = int(m.group(1)); b = int(m.group(2)) if m.group(2) else a
    return a, b

def yesno(s):
    s = (s or "").strip().lower()
    if s == "yes": return "yes"
    if s == "no": return "no"
    return "uncertain"

def split_row(line):
    parts = line.rstrip("\n").split(";")
    def is_float(x):
        try: float(x); return True
        except: return False
    # Row 5: address+district collapsed → 15 fields, lat at [6], lon at [7]
    if len(parts) == 15 and is_float(parts[6]) and is_float(parts[7]):
        parts = parts[:6] + [""] + parts[6:]
    if len(parts) < 16:
        return None
    if not is_float(parts[7]):
        return None
    head = parts[:13]
    hist = parts[-1]
    conf = parts[-2]
    note_parts = parts[13:-2]
    note = "; ".join(p for p in note_parts if p.strip())
    return head + [note, conf, hist]

def main():
    rows = []
    with open(SRC, encoding="utf-8") as f:
        f.readline()  # header
        for line in f:
            if not line.strip(): continue
            r = split_row(line)
            if not r:
                print("SKIP:", line[:80], file=sys.stderr)
                continue
            id_, name_ge, name_ru, name_en, confession, address, district, lat, lon, preserved, active, record_years, missing_years, note, confidence_raw, hist_note = r
            try:
                lat_f = float(lat); lon_f = float(lon)
            except ValueError:
                print("BAD COORDS:", id_, file=sys.stderr); continue
            sy, ey = parse_years(record_years)
            rows.append({
                "id": int(id_),
                "name": {"ka": name_ge.strip(), "ru": name_ru.strip(), "en": name_en.strip()},
                "confession": map_confession(confession),
                "confessionRaw": confession.strip(),
                "address": address.strip(),
                "district": district.strip(),
                "lat": lat_f,
                "lon": lon_f,
                "preserved": yesno(preserved),
                "active": yesno(active),
                "recordYears": record_years.strip(),
                "startYear": sy,
                "endYear": ey,
                "missingYears": missing_years.strip(),
                "note": note.strip(),
                "confidence": map_confidence(confidence_raw),
                "historicalNote": hist_note.strip(),
            })
    rows.sort(key=lambda r: r["id"])
    with open(DST, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    print(f"Wrote {len(rows)} rows to {DST}")
    # quick summary
    from collections import Counter
    print("Confessions:", Counter(r["confession"] for r in rows))
    print("Confidence :", Counter(r["confidence"] for r in rows))

main()
