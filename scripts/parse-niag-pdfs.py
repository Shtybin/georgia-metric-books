#!/usr/bin/env python3
"""Parse NIAG Ф.489 оп.6 PDF catalogs into a structured JSON.

Output: public/data/niag-catalog.json
Shape:
  {
    "generatedAt": "...",
    "sections": [
      { "file": "1819-1830", "year": 1819, "uezdRaw": "Tbilisis", "uezdKey": "tbilisi", "raw": "..." },
      ...
    ]
  }

Sections are split by headers like:
  # 1 a    Tbilisis mazra      1819 weli
The body keeps the raw transliterated table dump from pdftotext -layout so
the LLM can read settlement+church+district lines directly.
"""
from __future__ import annotations
import json, re, subprocess, sys, os, datetime, pathlib

PDF_DIR = pathlib.Path("/tmp/niag")
OUT = pathlib.Path("public/data/niag-catalog.json")

FILES = ["1819-1830", "1831-1840", "1841-1850", "1851-1860", "1861-1870"]

# Header examples:
#   # 1 a    Tbilisis mazra      1819 weli
#   # 5      Telavis mazra       1819 weli
#   # 15     goris mazra         1822 weli
# Tolerate Cyrillic №/N, georgian "weli" or "წელი".
HEADER_RE = re.compile(
    r"^\s*(?:#|№|Nº|N)\s*\d+\s*[a-zა-ჰ]?\s+"
    r"([A-Za-zა-ჰ'_\-\u00B4\u2018\u2019]+(?:s|ის))\s+"
    r"(?:mazra|მაზრა|maxre|maxra)\s+"
    r"(\d{4})\s*(?:weli|წელი|wlebi)\s*$",
    re.IGNORECASE,
)

# Looser fallback: any line containing "mazra YYYY weli"
FALLBACK_RE = re.compile(
    r"([A-Za-zა-ჰ'_\-]+)\s+(?:mazra|მაზრა)\s+(\d{4})\s*(?:weli|წელი|wlebi)",
    re.IGNORECASE,
)

UEZD_MAP = {
    "tbilisis": "tbilisi",
    "Tbilisis": "tbilisi",
    "თბილისის": "tbilisi",
    "Telavis": "telavi",
    "Telavi": "telavi",
    "თელავის": "telavi",
    "goris": "gori",
    "გორის": "gori",
    "siRnaRis": "signagi",
    "siRnaRi": "signagi",
    "signaRis": "signagi",
    "signagis": "signagi",
    "სიღნაღის": "signagi",
    "duSeTis": "dusheti",
    "duSeT": "dusheti",
    "დუშეთის": "dusheti",
    "ahalcixis": "akhaltsikhe",
    "axalcixis": "akhaltsikhe",
    "ახალციხის": "akhaltsikhe",
    "ozurgeTis": "ozurgeti",
    "ოზურგეთის": "ozurgeti",
    "quTaisis": "kutaisi",
    "ქუთაისის": "kutaisi",
    "SoraPnis": "shorapani",
    "SorapnisShorapnis": "shorapani",
    "racis": "racha",
    "lecxumis": "lechkhumi",
    "zugdidis": "zugdidi",
    "soxumis": "sukhumi",
    "baTumis": "batumi",
    "arTvinis": "artvin",
    "yvirilas": "kvirila",
}

def normalize_uezd(raw: str) -> str:
    raw_clean = raw.strip()
    if raw_clean in UEZD_MAP:
        return UEZD_MAP[raw_clean]
    # generic "Xis" -> "x" (georgian transliteration genitive)
    k = raw_clean.lower().rstrip("'’`")
    for suffix in ("isa", "is", "s"):
        if k.endswith(suffix):
            return k[: -len(suffix)]
    return k

def extract(pdf: pathlib.Path) -> str:
    out = pdf.with_suffix(".txt")
    if not out.exists():
        subprocess.run(["pdftotext", "-layout", str(pdf), str(out)], check=True)
    return out.read_text(encoding="utf-8", errors="replace")

def parse_text(text: str, file_label: str):
    lines = text.splitlines()
    sections = []
    current = None
    for ln in lines:
        m = HEADER_RE.match(ln)
        if not m:
            m = FALLBACK_RE.search(ln) if "mazra" in ln or "მაზრა" in ln else None
        if m:
            if current and current["raw"].strip():
                sections.append(current)
            uezd_raw, year = m.group(1), m.group(2)
            current = {
                "file": file_label,
                "year": int(year),
                "uezdRaw": uezd_raw,
                "uezdKey": normalize_uezd(uezd_raw),
                "raw": "",
            }
            continue
        if current is None:
            continue
        # skip pure page numbers (1-4 digits centered) and empty
        stripped = ln.strip()
        if not stripped:
            current["raw"] += "\n"
            continue
        if re.fullmatch(r"\d{1,4}", stripped):
            continue
        if re.fullmatch(r"ფონდი\s+\d+,?\s*ანაწერი\s+N?\s*\d+", stripped):
            continue
        current["raw"] += ln.rstrip() + "\n"
    if current and current["raw"].strip():
        sections.append(current)
    # collapse runs of >2 blank lines
    for s in sections:
        s["raw"] = re.sub(r"\n{3,}", "\n\n", s["raw"]).strip()
    return sections

def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    all_sections = []
    for f in FILES:
        pdf = PDF_DIR / f"{f}.pdf"
        if not pdf.exists():
            print(f"skip {pdf}", file=sys.stderr)
            continue
        text = extract(pdf)
        secs = parse_text(text, f)
        print(f"{f}: {len(secs)} sections", file=sys.stderr)
        all_sections.extend(secs)
    # index by (uezdKey, year) for quick lookup count
    by_uezd = {}
    for s in all_sections:
        by_uezd.setdefault(s["uezdKey"], 0)
        by_uezd[s["uezdKey"]] += 1
    print("by uezd:", json.dumps(by_uezd, ensure_ascii=False, indent=2), file=sys.stderr)
    payload = {
        "generatedAt": datetime.datetime.utcnow().isoformat() + "Z",
        "source": "НИАГ Ф.489 оп.6 (1819-1870)",
        "sections": all_sections,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    size_kb = OUT.stat().st_size // 1024
    print(f"wrote {OUT} ({size_kb} KB, {len(all_sections)} sections)", file=sys.stderr)

if __name__ == "__main__":
    main()
