#!/usr/bin/env python3
"""
Merge Tbilisi church entries that share an identical base Georgian name
but differ only by record-type marker (დაბადება / ჯვრისწერა / გარდაცვალება ==
рождение / венчание / смерть).

Also:
- Attach an archival catalog URL + matched row numbers per record type, so
  the UI can deep-link to the official catalog.
- Strip "(рождение)/(венчание)/(смерть)" suffix from the displayed name.
- Compute summary stats for churches whose records start ≤ 1898 (i.e. would
  show on the 1898 historical map layer).

Run:
    python3 scripts/merge-tbilisi-by-record-type.py
"""
import json, re, urllib.request
from collections import defaultdict, OrderedDict
from pathlib import Path

JSON_PATH = Path("public/data/tbilisi-churches.json")
ARCHIVE_URL = "https://archival-services.gov.ge/saeklesio/regions/location/55"

TYPE_KA = {
    "დაბადება": "birth",
    "ჯვრისწერა": "marriage",
    "გარდაცვალება": "death",
}
TYPE_NAME_SUFFIX_RE = re.compile(
    r"\s*\(\s*(?:"
    r"დაბადება|ჯვრისწერა|გარდაცვალება|"
    r"рождение|венчание|смерть|"
    r"birth|marriage|death"
    r")\s*\)\s*$",
    re.I,
)


def strip_type(name: str) -> str:
    if not name:
        return name
    return TYPE_NAME_SUFFIX_RE.sub("", name).strip()


def parse_years_str(s: str):
    if not s:
        return None, None
    nums = re.findall(r"\d{4}", s)
    if not nums:
        return None, None
    a = int(nums[0])
    b = int(nums[1]) if len(nums) > 1 else a
    return a, b


def fetch_catalog():
    req = urllib.request.Request(ARCHIVE_URL, headers={"User-Agent": "Mozilla/5.0"})
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", errors="replace")
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S | re.I)
    out = []
    for r in rows:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", r, re.S | re.I)
        if len(cells) < 4:
            continue
        c = [re.sub(r"<[^>]+>", "", x).replace("&nbsp;", " ").strip() for x in cells]
        if not c[0].isdigit():
            continue
        out.append({"n": int(c[0]), "name": c[2], "years": c[3]})
    return out


def base_ka(name: str) -> str:
    return TYPE_NAME_SUFFIX_RE.sub("", name).strip().lower()


def main():
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    catalog = fetch_catalog()
    print(f"catalog rows: {len(catalog)}  json rows: {len(data)}")

    # Group catalog rows by base KA name + record type
    cat_by_base = defaultdict(list)  # base_ka -> list of (type|None, n, years)
    for r in catalog:
        m = re.search(r"\(([^)]+)\)\s*$", r["name"])
        rec = TYPE_KA.get(m.group(1).strip()) if m else None
        cat_by_base[base_ka(r["name"])].append((rec, r["n"], r["years"]))

    # Group JSON entries by base KA
    groups = defaultdict(list)
    for c in data:
        groups[base_ka(c["name"]["ka"])].append(c)

    merged_out = []
    removed_ids = []
    for base, entries in groups.items():
        # Sort by id so the lowest-id entry is the "primary"
        entries.sort(key=lambda c: c["id"])
        primary = entries[0]

        # Determine record type for each JSON entry (from its KA name suffix)
        def rec_of(c):
            m = re.search(r"\(([^)]+)\)\s*$", c["name"]["ka"])
            return TYPE_KA.get(m.group(1).strip()) if m else None

        # Build recordsByType from JSON entries themselves
        rbt = {}
        for c in entries:
            rt = rec_of(c)
            if rt and c.get("recordYears"):
                rbt.setdefault(rt, c["recordYears"])

        # ALSO pull missing types from archive catalog (so e.g. a JSON entry
        # that only has "рождение" still gets venchanie/smert' periods listed
        # when the archive records them).
        for rec_t, n, years in cat_by_base.get(base, []):
            if rec_t and rec_t not in rbt and years:
                rbt[rec_t] = years

        # Build archive row references (always include if present)
        arch_rows = [
            {"n": n, "type": rt, "years": years}
            for (rt, n, years) in cat_by_base.get(base, [])
        ]
        arch_rows.sort(key=lambda x: x["n"])

        # Build the merged entry: copy primary, strip name suffixes, attach
        # recordsByType and archive refs. Keep its existing recordYears as
        # the "headline" range; UI will show the per-type breakdown below.
        m_entry = dict(primary)
        m_entry["name"] = {
            "ka": strip_type(primary["name"].get("ka", "")),
            "ru": strip_type(primary["name"].get("ru", "")),
            "en": strip_type(primary["name"].get("en", "")),
        }
        if rbt:
            # Stable ordering: birth, marriage, death
            ordered = OrderedDict()
            for k in ("birth", "marriage", "death"):
                if k in rbt:
                    ordered[k] = rbt[k]
            m_entry["recordsByType"] = ordered

            # Recompute startYear/endYear/recordYears from the union of all
            # per-type ranges so the timeline filter reflects the merged
            # church accurately.
            mins, maxs = [], []
            for ys in rbt.values():
                a, b = parse_years_str(ys)
                if a is not None:
                    mins.append(a)
                if b is not None:
                    maxs.append(b)
            if mins and maxs:
                sy, ey = min(mins), max(maxs)
                m_entry["startYear"] = sy
                m_entry["endYear"] = ey
                m_entry["recordYears"] = f"{sy}-{ey}"

        if arch_rows:
            m_entry["archiveUrl"] = ARCHIVE_URL
            m_entry["archiveRows"] = arch_rows

        merged_out.append(m_entry)
        if len(entries) > 1:
            removed_ids.extend(c["id"] for c in entries[1:])
            print(
                f"merged base='{base}' kept id={primary['id']} dropped="
                + ",".join(str(c['id']) for c in entries[1:])
            )

    merged_out.sort(key=lambda c: c["id"])
    JSON_PATH.write_text(
        json.dumps(merged_out, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    print(f"\nwrote {len(merged_out)} rows  (was {len(data)}, removed {len(removed_ids)})")

    # ---- Stats for 1898 layer ----
    in_arch = [c for c in merged_out if c.get("inArchive") is not False]
    before_1898 = [c for c in in_arch if (c.get("startYear") or 9999) <= 1898]
    print(f"\nVisible churches (inArchive!=false): {len(in_arch)}")
    print(f"  with startYear ≤ 1898  (shown on 1898 layer): {len(before_1898)}")

    # Catalog: count distinct base names whose earliest year ≤ 1898
    cat_min = {}
    for r in catalog:
        b = base_ka(r["name"])
        a, _ = parse_years_str(r["years"])
        if a is None:
            continue
        if b not in cat_min or a < cat_min[b]:
            cat_min[b] = a
    cat_before_1898 = sum(1 for v in cat_min.values() if v <= 1898)
    cat_total = len(cat_min)
    print(
        f"\nArchive catalog: {len(catalog)} rows  "
        f"({cat_total} distinct churches, "
        f"{cat_before_1898} with earliest year ≤ 1898)"
    )


if __name__ == "__main__":
    main()
