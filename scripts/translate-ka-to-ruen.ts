// For rows added in the 2nd pass from saeklesio, ru.csv and en.csv contain
// Georgian placeholders in settlement/church/region/uezd columns.
// This script:
//   1) Builds KA->RU and KA->EN dictionaries from the existing fully-translated
//      rows (where ru/en are non-Georgian) and from ka-glossary.json (inverted).
//   2) For each KA value that has no dictionary hit, asks the Lovable AI
//      Gateway to translate it to RU and to EN.
//   3) Writes back ru.csv and en.csv with the translations, leaving ka.csv
//      and all numeric columns untouched.
//
// Usage:  LOVABLE_API_KEY=... bun scripts/translate-ka-to-ruen.ts
// Idempotent: caches translations in scripts/data/ka-to-ruen-cache.json.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const API_KEY = process.env.LOVABLE_API_KEY;
if (!API_KEY) { console.error("LOVABLE_API_KEY is required"); process.exit(1); }
const MODEL = process.env.KA_MODEL || "google/gemini-2.5-flash";

function parseCSV(text: string): string[][] {
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = []; let cur: string[] = []; let f = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i+1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else { if (c === '"') q = true;
      else if (c === ",") { cur.push(f); f = ""; }
      else if (c === "\n") { cur.push(f); rows.push(cur); cur = []; f = ""; }
      else if (c !== "\r") f += c;
    }
  }
  if (f.length || cur.length) { cur.push(f); rows.push(cur); }
  return rows;
}
function csvEsc(s: string): string {
  if (s == null) return "";
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const isKa = (s: string) => /[\u10A0-\u10FF]/.test(s);

const ruRows = parseCSV(readFileSync(join(root, "scripts/data/ru.csv"), "utf8"));
const enRows = parseCSV(readFileSync(join(root, "scripts/data/en.csv"), "utf8"));
const kaRows = parseCSV(readFileSync(join(root, "scripts/data/ka.csv"), "utf8"));
const header = ruRows[0];
const dRu = ruRows.slice(1), dEn = enRows.slice(1), dKa = kaRows.slice(1);

const cachePath = join(root, "scripts/data/ka-to-ruen-cache.json");
const cache: Record<string, { ru: string; en: string }> = existsSync(cachePath)
  ? JSON.parse(readFileSync(cachePath, "utf8")) : {};

// Build dictionaries from existing well-translated rows
const dictRu = new Map<string, string>();
const dictEn = new Map<string, string>();
const COLS = [[0, "settlement"], [1, "church"], [2, "region"], [3, "uezd"]] as const;
for (let i = 0; i < dRu.length; i++) {
  const r = dRu[i], e = dEn[i] || [], k = dKa[i] || [];
  for (const [c] of COLS) {
    const ka = (k[c] || "").trim();
    const ru = (r[c] || "").trim();
    const en = (e[c] || "").trim();
    if (!ka || !isKa(ka)) continue;
    if (ru && !isKa(ru) && !dictRu.has(ka)) dictRu.set(ka, ru);
    if (en && !isKa(en) && !dictEn.has(ka)) dictEn.set(ka, en);
  }
}
// Invert ka-glossary.json (RU -> KA) for region/uezd
const glossary = JSON.parse(readFileSync(join(root, "scripts/data/ka-glossary.json"), "utf8")) as {
  regions: Record<string, string>; uezds: Record<string, string>;
};
for (const [ru, ka] of Object.entries(glossary.regions)) if (!dictRu.has(ka)) dictRu.set(ka, ru);
for (const [ru, ka] of Object.entries(glossary.uezds))   if (!dictRu.has(ka)) dictRu.set(ka, ru);

console.log(`Dict RU: ${dictRu.size}, EN: ${dictEn.size}`);

// Collect KA strings that still need AI translation
type Kind = "settlement" | "church" | "region" | "uezd";
const need: { kind: Kind; ka: string }[] = [];
const seen = new Set<string>();
for (let i = 0; i < dRu.length; i++) {
  const r = dRu[i];
  for (const [c, kind] of COLS) {
    const v = (r[c] || "").trim();
    if (!v || !isKa(v)) continue;
    const cached = cache[`${kind}::${v}`];
    const ruHit = cached?.ru || dictRu.get(v);
    const enHit = cached?.en || dictEn.get(v);
    if (ruHit && enHit) continue;
    const key = `${kind}::${v}`;
    if (seen.has(key)) continue;
    seen.add(key);
    need.push({ kind: kind as Kind, ka: v });
  }
}
console.log(`To translate via AI: ${need.length}`);

const SYSTEM = `You translate 19th-century Georgian (ქართული) historical toponyms and Orthodox church names of Georgia into Russian (как принято в дореволюционных метрических книгах) and English.

Rules:
- For settlements: use the established Russian/English spelling if widely known (Тбилиси/Tbilisi, Кутаиси/Kutaisi, Гори/Gori); otherwise transliterate the Georgian phonetics into Russian Cyrillic and Latin letters.
- For churches: keep structure. ეკლესია = "церковь" / "church". წმინდა გიორგის ეკლესია → "Св. Георгия" / "St. George". მიძინების ეკლესია → "Успенская" / "Dormition". წმინდა სამების ეკლესია → "Св. Троицы" / "Holy Trinity". წმინდა ნიკოლოზის ეკლესია → "Св. Николая" / "St. Nicholas". მთავარანგელოზის ეკლესია → "Архангела" / "Archangel". ღვთისმშობლის ეკლესია → "Богородицы" / "Theotokos". Drop the word "церковь/church" itself for brevity, matching existing dataset style.
- For regions/uezds: use historical 19th-century names. მაზრა = уезд / Uezd. რაიონი = район / District (modern). გუბერნია = губерния / Governorate.
- Output ONLY the translation, one line each, no quotes, no commentary.`;

async function translateBatch(items: { kind: Kind; ka: string }[]): Promise<{ ru: string; en: string }[]> {
  const userPrompt = items.map((it, i) => `${i + 1}. [${it.kind}] KA: ${it.ka}`).join("\n");
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content:
`Translate each Georgian item to BOTH Russian and English. Return exactly ${items.length} lines, one per item, in this exact format:
N. <Russian> ||| <English>

${userPrompt}` },
    ],
    temperature: 0.1,
  };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json: any = await res.json();
  const text: string = json.choices?.[0]?.message?.content || "";
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out: { ru: string; en: string }[] = [];
  for (let i = 0; i < items.length; i++) {
    const prefix = `${i + 1}.`;
    const line = lines.find(l => l.startsWith(prefix));
    if (!line) { out.push({ ru: "", en: "" }); continue; }
    const body = line.slice(prefix.length).trim().replace(/^[—\-:\s]+/, "");
    const parts = body.split(/\s*\|\|\|\s*/);
    out.push({ ru: (parts[0] || "").trim(), en: (parts[1] || "").trim() });
  }
  return out;
}

const BATCH = 25;
let done = 0;
for (let i = 0; i < need.length; i += BATCH) {
  const batch = need.slice(i, i + BATCH);
  let attempts = 0; let result: { ru: string; en: string }[] = [];
  while (attempts < 3) {
    try { result = await translateBatch(batch); break; }
    catch (e: any) { attempts++; console.warn(`\n  retry ${attempts}/3:`, e.message);
      await new Promise(r => setTimeout(r, 1500 * attempts)); }
  }
  for (let j = 0; j < batch.length; j++) {
    const tr = result[j];
    if (tr && (tr.ru || tr.en)) cache[`${batch[j].kind}::${batch[j].ka}`] = tr;
  }
  done += batch.length;
  if ((i / BATCH) % 5 === 0) writeFileSync(cachePath, JSON.stringify(cache, null, 1));
  process.stdout.write(`\r  translated ${done}/${need.length}`);
}
console.log("");
writeFileSync(cachePath, JSON.stringify(cache, null, 1));

// Apply: rewrite ru.csv and en.csv
let updRu = 0, updEn = 0;
for (let i = 0; i < dRu.length; i++) {
  const r = dRu[i], e = dEn[i] || [];
  for (const [c, kind] of COLS) {
    const v = (r[c] || "").trim();
    if (!v || !isKa(v)) continue;
    const cached = cache[`${kind}::${v}`];
    const ruHit = (cached?.ru) || dictRu.get(v);
    const enHit = (cached?.en) || dictEn.get(v);
    if (ruHit) { r[c] = ruHit; updRu++; }
    if (enHit) { while (e.length <= c) e.push(""); e[c] = enHit; updEn++; }
  }
  dEn[i] = e;
}
writeFileSync(join(root, "scripts/data/ru.csv"),
  "\uFEFF" + [header, ...dRu].map(r => r.map(csvEsc).join(",")).join("\n") + "\n");
writeFileSync(join(root, "scripts/data/en.csv"),
  "\uFEFF" + [enRows[0], ...dEn].map(r => r.map(csvEsc).join(",")).join("\n") + "\n");
console.log(`Updated cells — ru: ${updRu}, en: ${updEn}`);
