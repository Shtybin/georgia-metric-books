// Builds scripts/data/ka.csv from ru.csv + en.csv using a manual glossary
// (regions/uezds) and the Lovable AI Gateway for settlements/churches.
//
// Usage:
//   LOVABLE_API_KEY=... bun scripts/translate-ka.ts
//
// Idempotent: caches translations by RU string in scripts/data/ka-cache.json,
// and re-uses any existing scripts/data/ka.csv translations.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const API_KEY = process.env.LOVABLE_API_KEY;
if (!API_KEY) {
  console.error("LOVABLE_API_KEY is required");
  process.exit(1);
}
const MODEL = process.env.KA_MODEL || "google/gemini-2.5-flash";

function parseCSV(text: string): string[][] {
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let cur: string[] = []; let field = ""; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c === "\r") {}
      else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

function csvEscape(s: string): string {
  if (s == null) return "";
  if (/[\",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const ruRows = parseCSV(readFileSync(join(root, "scripts/data/ru.csv"), "utf8"));
const enRows = parseCSV(readFileSync(join(root, "scripts/data/en.csv"), "utf8"));
const header = ruRows[0];
const dataRu = ruRows.slice(1);
const dataEn = enRows.slice(1);

const glossary = JSON.parse(readFileSync(join(root, "scripts/data/ka-glossary.json"), "utf8")) as {
  regions: Record<string, string>;
  uezds: Record<string, string>;
};

const cachePath = join(root, "scripts/data/ka-cache.json");
const cache: Record<string, string> = existsSync(cachePath)
  ? JSON.parse(readFileSync(cachePath, "utf8")) : {};

// Pre-populate cache from glossary
for (const [ru, ka] of Object.entries(glossary.regions)) cache[`region::${ru}`] = ka;
for (const [ru, ka] of Object.entries(glossary.uezds)) cache[`uezd::${ru}`] = ka;

// Also pre-populate from any existing ka.csv (manual edits preserved)
const kaPath = join(root, "scripts/data/ka.csv");
if (existsSync(kaPath)) {
  const kaPrev = parseCSV(readFileSync(kaPath, "utf8")).slice(1);
  for (let i = 0; i < kaPrev.length && i < dataRu.length; i++) {
    const ka = kaPrev[i]; const ru = dataRu[i];
    if (!ka || !ru) continue;
    for (const [col, kind] of [[0, "settlement"], [1, "church"], [2, "region"], [3, "uezd"]] as const) {
      const ruVal = (ru[col] || "").trim();
      const kaVal = (ka[col] || "").trim();
      if (ruVal && kaVal && /[\u10A0-\u10FF]/.test(kaVal)) {
        cache[`${kind}::${ruVal}`] = kaVal;
      }
    }
  }
}

type Kind = "settlement" | "church" | "region" | "uezd";

// Collect items that need translation
const need: { kind: Kind; ru: string; en: string }[] = [];
const seen = new Set<string>();
for (let i = 0; i < dataRu.length; i++) {
  const ru = dataRu[i]; const en = dataEn[i] || [];
  for (const [col, kind] of [[0, "settlement"], [1, "church"], [2, "region"], [3, "uezd"]] as const) {
    const ruVal = (ru[col] || "").trim();
    if (!ruVal || ruVal === "-") continue;
    const key = `${kind}::${ruVal}`;
    if (cache[key] != null) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    need.push({ kind, ru: ruVal, en: (en[col] || "").trim() });
  }
}
console.log(`Glossary covers ${Object.keys(cache).length} entries.`);
console.log(`To translate via AI: ${need.length}`);

const SYSTEM = `You are a Georgian historical cartographer translating 19th-century Russian-Empire toponyms and church names of Georgia into Georgian (ქართული).

Rules:
- Output Georgian script (Mkhedruli). Use historical literary forms where applicable (e.g. Тифлис → ტფილისი, not თბილისი, when the source uses "Тифлис"; Кутаис → ქუთაისი).
- For settlements: render the proper Georgian name if it is a known Georgian village; otherwise transliterate accurately from Russian into Georgian script preserving Georgian phonotactics. Always translate "село N" → "სოფელი N".
- For churches: keep the full structure "<dedication> <type>", e.g. "Церковь Святого Георгия" → "წმინდა გიორგის ეკლესია"; "Успенская церковь" → "მიძინების ეკლესია"; "Свято-Троицкая" → "წმინდა სამების". Use "ეკლესია" for церковь, "სამრევლო" for приход, "სავანე/მონასტერი" for монастырь, "კათოლიკოსი" for католикос.
- For regions/uezds: use historical Georgian administrative names (e.g. "Тифлисская губерния" → "ტფილისის გუბერნია"; "Кутаисский уезд" → "ქუთაისის მაზრა").
- Return ONLY the Georgian translation, one line, no quotes, no commentary, no transliteration in parentheses.
- If absolutely uncertain, still produce your best Georgian rendering (no English fallback).`;

async function translateBatch(items: { kind: Kind; ru: string; en: string }[]): Promise<string[]> {
  const userPrompt = items.map((it, i) =>
    `${i + 1}. [${it.kind}] RU: ${it.ru}${it.en ? `  EN: ${it.en}` : ""}`
  ).join("\n");

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content:
`Translate each of the following items to Georgian. Return exactly ${items.length} lines, numbered "N. <Georgian>", in order, nothing else.

${userPrompt}` },
    ],
    temperature: 0.1,
  };

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI ${res.status}: ${t.slice(0, 300)}`);
  }
  const json: any = await res.json();
  const text: string = json.choices?.[0]?.message?.content || "";
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const expected = `${i + 1}.`;
    const line = lines.find(l => l.startsWith(expected));
    if (!line) { out.push(""); continue; }
    out.push(line.slice(expected.length).trim().replace(/^[—\-:\s]+/, ""));
  }
  return out;
}

const BATCH = 30;
let done = 0; let saved = 0;
for (let i = 0; i < need.length; i += BATCH) {
  const batch = need.slice(i, i + BATCH);
  let attempts = 0; let result: string[] = [];
  while (attempts < 3) {
    try { result = await translateBatch(batch); break; }
    catch (e: any) {
      attempts++;
      console.warn(`  retry ${attempts}/3:`, e.message);
      await new Promise(r => setTimeout(r, 1500 * attempts));
    }
  }
  for (let j = 0; j < batch.length; j++) {
    const tr = (result[j] || "").trim();
    if (tr) cache[`${batch[j].kind}::${batch[j].ru}`] = tr;
  }
  done += batch.length;
  saved++;
  if (saved % 5 === 0) writeFileSync(cachePath, JSON.stringify(cache, null, 1));
  process.stdout.write(`\r  translated ${done}/${need.length}`);
}
console.log("");
writeFileSync(cachePath, JSON.stringify(cache, null, 1));

// Build ka.csv
const out: string[] = [];
out.push(header.map(csvEscape).join(","));
for (let i = 0; i < dataRu.length; i++) {
  const ru = dataRu[i]; const en = dataEn[i] || [];
  const row = [...ru];
  for (const [col, kind] of [[0, "settlement"], [1, "church"], [2, "region"], [3, "uezd"]] as const) {
    const ruVal = (ru[col] || "").trim();
    if (!ruVal) { row[col] = ""; continue; }
    if (ruVal === "-") { row[col] = "-"; continue; }
    const key = `${kind}::${ruVal}`;
    row[col] = cache[key] || ruVal;
  }
  // Keep numeric cols and year strings from RU (years use digits; coords same)
  out.push(row.map(csvEscape).join(","));
}
writeFileSync(kaPath, "\uFEFF" + out.join("\n") + "\n");
console.log(`Wrote ${kaPath} (${dataRu.length} rows)`);
