// Builds public/data/parishes.geojson + stats.json from RU + EN CSVs.
// Run with: bun scripts/build-geojson.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function parseCSV(text: string): string[][] {
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter(r => r.length > 1);
}

function parseYears(s: string): number[] {
  if (!s) return [];
  const out = new Set<number>();
  for (const part of s.split(",")) {
    const p = part.trim();
    const m = p.match(/^(\d{4})\s*[-–]\s*(\d{4})$/);
    if (m) {
      const a = +m[1], b = +m[2];
      for (let y = a; y <= b; y++) out.add(y);
    } else {
      const n = parseInt(p, 10);
      if (!isNaN(n)) out.add(n);
    }
  }
  return [...out].sort((a, b) => a - b);
}

function compactYears(years: number[]): string {
  if (!years.length) return "";
  const sorted = [...years].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0], prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const y = sorted[i];
    if (y === prev + 1) { prev = y; continue; }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = y; prev = y;
  }
  parts.push(start === prev ? `${start}` : `${start}-${prev}`);
  return parts.join(", ");
}

function bucketOf(year: number): string {
  if (year < 1840) return "pre-1840";
  if (year < 1860) return "1840-1860";
  if (year < 1880) return "1860-1880";
  if (year < 1900) return "1880-1900";
  return "post-1900";
}

const root = process.cwd();
const enRows = parseCSV(readFileSync(join(root, "scripts/data/en.csv"), "utf8"));
const ruRows = parseCSV(readFileSync(join(root, "scripts/data/ru.csv"), "utf8"));

enRows.shift(); ruRows.shift();

type RawRow = {
  lat: number; lon: number;
  settlementEn: string; settlementRu: string;
  churchEn: string; churchRu: string;
  regionEn: string; regionRu: string;
  uezdEn: string; uezdRu: string;
  yearsStr: string;
  startYear: number;
};

const raw: RawRow[] = [];
type UnlocatedRaw = {
  settlementEn: string; settlementRu: string;
  churchEn: string; churchRu: string;
  regionEn: string; regionRu: string;
  uezdEn: string; uezdRu: string;
  yearsStr: string;
  startYear: number;
};
const unlocatedRaw: UnlocatedRaw[] = [];
let total = 0;
let withCoords = 0;

const len = Math.max(enRows.length, ruRows.length);
for (let i = 0; i < len; i++) {
  const en = enRows[i] || [];
  const ru = ruRows[i] || [];
  if (en.every(c => !c?.trim()) && ru.every(c => !c?.trim())) continue;
  total++;

  const lat = parseFloat(en[7] || ru[7] || "");
  const lon = parseFloat(en[8] || ru[8] || "");
  const hasCoords = isFinite(lat) && isFinite(lon);

  const startYearParsed = parseInt(en[5] || ru[5] || "", 10);

  if (!hasCoords) {
    unlocatedRaw.push({
      settlementEn: (en[0] || "").trim(), settlementRu: (ru[0] || "").trim(),
      churchEn: (en[1] || "").trim(),     churchRu: (ru[1] || "").trim(),
      regionEn: (en[2] || "").trim(),     regionRu: (ru[2] || "").trim(),
      uezdEn: (en[3] || "").trim(),       uezdRu: (ru[3] || "").trim(),
      yearsStr: en[4] || ru[4] || "",
      startYear: isFinite(startYearParsed) ? startYearParsed : 0,
    });
    continue;
  }
  withCoords++;

  const startYear = startYearParsed;
  if (!isFinite(startYear)) continue;

  raw.push({
    lat, lon,
    settlementEn: (en[0] || "").trim(), settlementRu: (ru[0] || "").trim(),
    churchEn: (en[1] || "").trim(),     churchRu: (ru[1] || "").trim(),
    regionEn: (en[2] || "").trim(),     regionRu: (ru[2] || "").trim(),
    uezdEn: (en[3] || "").trim(),       uezdRu: (ru[3] || "").trim(),
    yearsStr: en[4] || ru[4] || "",
    startYear,
  });
}

// Group by rounded coordinates
const groups = new Map<string, RawRow[]>();
for (const r of raw) {
  const key = `${r.lat.toFixed(6)}|${r.lon.toFixed(6)}`;
  const arr = groups.get(key);
  if (arr) arr.push(r); else groups.set(key, [r]);
}

const firstNonEmpty = (vals: string[]) => vals.find(v => v && v.length) || "";
const joinUnique = (vals: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of vals) {
    const t = v.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t); out.push(t);
  }
  return out.join("; ");
};

const features: any[] = [];
for (const rows of groups.values()) {
  const lat = rows[0].lat, lon = rows[0].lon;

  const yearsSet = new Set<number>();
  for (const r of rows) for (const y of parseYears(r.yearsStr)) yearsSet.add(y);
  const yearsArr = [...yearsSet].sort((a, b) => a - b);

  let computedMissing: number[] = [];
  if (yearsArr.length) {
    const lo = yearsArr[0], hi = yearsArr[yearsArr.length - 1];
    for (let y = lo; y <= hi; y++) if (!yearsSet.has(y)) computedMissing.push(y);
  }

  const startYear = Math.min(...rows.map(r => r.startYear));
  const endYear = yearsArr.length ? yearsArr[yearsArr.length - 1] : startYear;

  const yearsCompactRu = compactYears(yearsArr);
  const missingCompact = compactYears(computedMissing);

  features.push({
    type: "Feature",
    id: features.length,
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: {
      settlement: {
        en: firstNonEmpty(rows.map(r => r.settlementEn)),
        ru: firstNonEmpty(rows.map(r => r.settlementRu)),
      },
      church: {
        en: joinUnique(rows.map(r => r.churchEn)),
        ru: joinUnique(rows.map(r => r.churchRu)),
      },
      region: {
        en: firstNonEmpty(rows.map(r => r.regionEn)),
        ru: firstNonEmpty(rows.map(r => r.regionRu)),
      },
      uezd: {
        en: firstNonEmpty(rows.map(r => r.uezdEn)),
        ru: firstNonEmpty(rows.map(r => r.uezdRu)),
      },
      yearsRaw:   { en: yearsCompactRu, ru: yearsCompactRu },
      missingRaw: { en: missingCompact, ru: missingCompact },
      startYear,
      endYear,
      coverage: Math.max(1, yearsArr.length),
      missingCount: computedMissing.length,
      bucket: bucketOf(startYear),
    },
  });
}

const outDir = join(root, "public/data");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "parishes.geojson"),
  JSON.stringify({ type: "FeatureCollection", features }));
const stats = {
  total,
  withCoords,
  withoutCoords: total - withCoords,
  uniqueLocations: features.length,
  geocodingConfidence: total ? withCoords / total : 0,
};
writeFileSync(join(outDir, "stats.json"), JSON.stringify(stats, null, 2));
console.log("Done", { features: features.length, ...stats });
