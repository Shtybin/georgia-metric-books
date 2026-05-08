// Builds public/data/parishes.geojson + stats.json from RU + EN CSVs.
// Run with: bun scripts/build-geojson.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function parseCSV(text: string): string[][] {
  // Strip BOM
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

function endYear(yearsStr: string, startYear: number, missing: number[]): number {
  const ys = parseYears(yearsStr);
  if (ys.length) return ys[ys.length - 1];
  if (missing.length) return missing[missing.length - 1];
  return startYear;
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

// drop headers
enRows.shift(); ruRows.shift();

const features: any[] = [];
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
  if (!isFinite(lat) || !isFinite(lon)) continue;
  withCoords++;

  const startYear = parseInt(en[5] || ru[5] || "", 10);
  if (!isFinite(startYear)) continue;

  const yearsStr = en[4] || ru[4] || "";
  const missingStr = en[6] || ru[6] || "";
  const missing = parseYears(missingStr);
  const ey = endYear(yearsStr, startYear, missing);
  const yearsArr = parseYears(yearsStr);
  const coverage = Math.max(1, yearsArr.length || (ey - startYear + 1) - missing.length);

  features.push({
    type: "Feature",
    id: features.length,
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: {
      settlement: { en: en[0] || "", ru: ru[0] || "" },
      church:     { en: en[1] || "", ru: ru[1] || "" },
      region:     { en: en[2] || "", ru: ru[2] || "" },
      uezd:       { en: en[3] || "", ru: ru[3] || "" },
      yearsRaw:   { en: yearsStr,    ru: ru[4] || yearsStr },
      missingRaw: { en: missingStr,  ru: ru[6] || missingStr },
      startYear,
      endYear: ey,
      coverage,
      missingCount: missing.length,
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
  geocodingConfidence: total ? withCoords / total : 0,
};
writeFileSync(join(outDir, "stats.json"), JSON.stringify(stats, null, 2));
console.log("Done", { features: features.length, ...stats });
