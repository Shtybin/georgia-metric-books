import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isProbableMatch, normalizeAdmin } from "@/lib/fuzzyMatch";
import { featureToData, type FeatureData, type FeatureOverride } from "@/lib/featureOverrides";
import { parseYearsString } from "@/lib/userCoords";

// Bundle the unlocated dataset so the worker doesn't depend on filesystem or
// an internal HTTP fetch (which gets routed back to the SPA shell in preview).
import unlocatedBundled from "../../public/data/unlocated.json";
import parishesRaw from "../../public/data/parishes.geojson?raw";

const parishesBundled = JSON.parse(parishesRaw) as GeoJSON.FeatureCollection<GeoJSON.Point, any>;




// ---- Types -------------------------------------------------------------

type LocaleStr = { en: string; ru: string; ka?: string };

interface UnlocatedItem {
  settlement: LocaleStr;
  church: LocaleStr;
  region: LocaleStr;
  uezd: LocaleStr;
  years: string;
  startYear: number | null;
  endYear: number | null;
  count: number;
}

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
  type: string;
  class: string;
  importance?: number;
  address?: Record<string, string>;
}

interface BatchResult {
  /** Counts only successful attempts (inserted + skipped + merged). Rejected items (not found / AI отклонил) do NOT count toward the limit. */
  processed: number;
  /** How many queue items were consumed in total (used by client to advance offset). */
  scanned: number;
  inserted: number;
  skipped: number;
  rejected: number;
  merged: number;
  /** How many candidates remain in the queue after this chunk (for client looping). */
  remaining: number;
  errors: { settlement: string; reason: string }[];
  log: {
    settlement: string;
    uezd: string;
    status: "inserted" | "skipped" | "rejected" | "error" | "merged";
    confidence?: number;
    note?: string;
    lat?: number;
    lon?: number;
    featureId?: number;
  }[];
}

// ---- Helpers -----------------------------------------------------------

const GEORGIA_BBOX = { minLat: 41.0, maxLat: 43.6, minLon: 40.0, maxLon: 46.8 };

function inGeorgia(lat: number, lon: number) {
  return (
    lat >= GEORGIA_BBOX.minLat &&
    lat <= GEORGIA_BBOX.maxLat &&
    lon >= GEORGIA_BBOX.minLon &&
    lon <= GEORGIA_BBOX.maxLon
  );
}

function key(it: { settlement: LocaleStr; uezd: LocaleStr }) {
  const s = (it.settlement.ru || it.settlement.en || "").toLocaleLowerCase().trim();
  const u = (it.uezd.ru || it.uezd.en || "").toLocaleLowerCase().trim();
  return `${s}|${u}`;
}

async function nominatimSearch(q: string, viewbox = true): Promise<NominatimHit[]> {
  const params = new URLSearchParams({
    q,
    format: "json",
    addressdetails: "1",
    limit: "5",
    countrycodes: "ge",
  });
  if (viewbox) {
    // left,top,right,bottom
    params.set("viewbox", "40.0,43.6,46.8,41.0");
    params.set("bounded", "1");
  }
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "georgia-metric-books-atlas/1.0 (admin geocoder)",
      "Accept-Language": "ru,en,ka",
    },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return (await res.json()) as NominatimHit[];
}

// ---- Validation --------------------------------------------------------

function norm(s: string | undefined | null): string {
  return (s || "")
    .toLocaleLowerCase()
    .replace(/[ёе]/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Таблица административных эквивалентов.
 * Слева — токены (RU/EN/KA), которыми историческое уезд/регион записан в
 * исходных данных. Справа — токены, которые встречаются в OSM-адресе или в
 * admin-полях уже опубликованных точек на карте. Если хотя бы один токен из
 * `hist` нормализованно находится в исторической строке И хотя бы один токен
 * из `modern` — в OSM/целевой строке, admin считается совпавшим (даже если
 * fuzzy-проверка по общему префиксу не сработала).
 *
 * Добавляйте сюда новые правила по мере обнаружения расхождений.
 */
const ADMIN_ALIASES: { hist: string[]; modern: string[] }[] = [
  // Они → Онский муниципалитет (Рача-Лечхуми и Нижняя Сванетия)
  { hist: ["они", "oni", "ონი"], modern: ["онски", "oni", "рача", "racha", "лечхуми", "lechkhumi"] },
  // Борджоми → Боржомский муниципалитет (Самцхе-Джавахети)
  { hist: ["борджоми", "borjomi", "ბორჯომი"], modern: ["боржом", "borjom", "самцхе", "samtskhe", "джавахети", "javakheti"] },
];

/** Возвращает true, если пара (historical, modern) описана в ADMIN_ALIASES. */
function aliasMatches(
  historical: string,
  modern: string,
): { ok: boolean; matchedHist?: string; matchedModern?: string } {
  const h = norm(historical);
  const m = norm(modern);
  if (!h || !m) return { ok: false };
  for (const a of ADMIN_ALIASES) {
    const hToken = a.hist.map(norm).find((t) => t && h.includes(t));
    if (!hToken) continue;
    const mToken = a.modern.map(norm).find((t) => t && m.includes(t));
    if (!mToken) continue;
    return { ok: true, matchedHist: hToken, matchedModern: mToken };
  }
  return { ok: false };
}

/**
 * Returns true if `needle` and `hay` share a token with a common prefix of
 * `prefixLen` chars (fuzzy stem match). Handles inflected forms like
 * «Хашури» ↔ «Хашурский», «Терджола» ↔ «Терджолский».
 * `minTokenLen` filters out short noise tokens before matching.
 */
function commonPrefix(a: string, b: string): number {
  const m = Math.min(a.length, b.length);
  let i = 0;
  while (i < m && a[i] === b[i]) i++;
  return i;
}

function tokenOverlap(
  needle: string,
  hay: string,
  minTokenLen = 3,
  prefixLen = 5,
): boolean {
  const n = norm(needle);
  const h = norm(hay);
  if (!n || !h) return false;
  if (h.includes(n)) return true;
  const nTokens = n.split(" ").filter((t) => t.length >= minTokenLen);
  const hTokens = h.split(" ").filter((t) => t.length >= minTokenLen);
  for (const nt of nTokens) {
    if (h.includes(nt)) return true;
    for (const ht of hTokens) {
      const shorter = Math.min(nt.length, ht.length);
      // Adaptive threshold: short tokens (e.g. «вани» 4ch) need len-2 shared
      // prefix («ван» = 3) so «Вани» ↔ «Ванский» matches, while still rejecting
      // unrelated pairs like «вани»/«вакир» (only 2 shared).
      const threshold = Math.min(prefixLen, Math.max(3, shorter - 2));
      if (commonPrefix(nt, ht) >= threshold) return true;
    }
  }
  return false;
}

interface ValidationResult {
  ok: boolean;
  warnings: string[];
  reasons: string[];
}

/**
 * Per-edit consistency checks:
 * 1. OSM address region/uezd overlap with historical region/uezd (if указаны)
 * 2. OSM display_name / address name overlaps with хотя бы одним локализованным
 *    названием (RU/EN/KA) исторического селения
 * Returns ok=false если 2 critical-проверки не прошли (явная ошибка совпадения).
 */
function validateOsmMatch(
  item: UnlocatedItem,
  hit: NominatimHit,
  opts: { minTokenLen?: number; prefixLen?: number; geoStrict?: boolean } = {},
): ValidationResult {
  const minTokenLen = opts.minTokenLen ?? 3;
  const prefixLen = opts.prefixLen ?? 5;
  const geoStrict = opts.geoStrict ?? true;
  const warnings: string[] = [];
  const reasons: string[] = [];
  const addr = hit.address || {};
  const addrRegionStr = [
    addr.county,
    addr.state_district,
    addr.state,
    addr.region,
    addr.municipality,
    addr.province,
  ]
    .filter(Boolean)
    .join(" ");
  const addrName = [
    addr.village,
    addr.hamlet,
    addr.town,
    addr.city,
    addr.suburb,
    addr.locality,
    addr.name,
  ]
    .filter(Boolean)
    .join(" ");

  // 1. region/uezd — fuzzy prefix match handles «Хашури» ↔ «Хашурский».
  const histGeo = [item.uezd.ru, item.uezd.en, item.uezd.ka, item.region.ru, item.region.en, item.region.ka]
    .filter((s) => s && s.trim().length > 0) as string[];
  const histGeoSet = histGeo.length > 0;
  const fullDisplay = `${addrRegionStr} ${hit.display_name}`;
  const geoOk = !histGeoSet || histGeo.some((g) => tokenOverlap(g, fullDisplay, minTokenLen, prefixLen));
  if (histGeoSet && !geoOk) {
    const msg = `регион/уезд не совпадает: ист. «${histGeo.join(" / ")}» vs OSM «${addrRegionStr || hit.display_name}»`;
    if (geoStrict) reasons.push(msg);
    else warnings.push(msg);
  }

  // 2. name match (RU/EN/KA) — always strict
  const histNames = [item.settlement.ka, item.settlement.ru, item.settlement.en]
    .filter((s) => s && s.trim().length > 0) as string[];
  const nameSource = `${addrName} ${hit.display_name}`;
  const nameOk =
    histNames.length === 0 ||
    histNames.some((n) => tokenOverlap(n, nameSource, minTokenLen, prefixLen));
  if (!nameOk) {
    reasons.push(
      `название не совпадает: ист. «${histNames.join(" / ")}» vs OSM «${addrName || hit.display_name}»`,
    );
  }

  const uezdLangs = [item.uezd.ru, item.uezd.en, item.uezd.ka].filter((s) => s && s.trim().length > 0).length;
  if (uezdLangs > 0 && uezdLangs < 2) {
    warnings.push("уезд указан только на одном языке");
  }

  return { ok: (geoStrict ? geoOk : true) && nameOk, warnings, reasons };
}

async function geocodeCandidates(item: UnlocatedItem): Promise<NominatimHit[]> {
  // Try names in priority order; stop at the first one that returns hits.
  // Fewer Nominatim calls = much shorter per-item time (worker timeout safety).
  const names = [item.settlement.ka, item.settlement.en, item.settlement.ru]
    .map((s) => (s || "").trim())
    .filter(Boolean);
  const seen = new Map<string, NominatimHit>();
  for (let i = 0; i < names.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1100)); // Nominatim 1 req/s
    try {
      const hits = await nominatimSearch(names[i], true);
      for (const h of hits) {
        const k = `${h.lat},${h.lon}`;
        if (!seen.has(k)) seen.set(k, h);
      }
      if (seen.size > 0) break; // got something — don't waste more requests
    } catch {
      // try next name
    }
  }
  return [...seen.values()].filter((h) => {
    const lat = parseFloat(h.lat);
    const lon = parseFloat(h.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) && inGeorgia(lat, lon);
  });
}

async function aiArbiter(
  item: UnlocatedItem,
  candidates: NominatimHit[],
): Promise<{ index: number; confidence: number; reason: string } | null> {
  if (candidates.length === 0) return null;

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    // Fallback: pick first candidate when only 1, else null
    if (candidates.length === 1) {
      return { index: 0, confidence: 0.6, reason: "single candidate (no AI)" };
    }
    return null;
  }

  const prompt = `Ты помогаешь определить географические координаты исторического селения в Грузии (XIX век) по списку современных кандидатов из OpenStreetMap.

Историческое селение:
- Название: ${item.settlement.ru || item.settlement.en} ${item.settlement.ka ? `(${item.settlement.ka})` : ""}
- Уезд: ${item.uezd.ru || item.uezd.en || "не указан"}
- Регион: ${item.region.ru || item.region.en || "не указан"}
- Церковь: ${item.church.ru || item.church.en || "не указана"}
- Годы метрических книг: ${item.years || "не указаны"}

Кандидаты OpenStreetMap (все в Грузии):
${candidates.map((c, i) => `${i}. ${c.display_name} [${c.class}/${c.type}, lat=${c.lat}, lon=${c.lon}]`).join("\n")}

Выбери наиболее вероятного кандидата с учётом:
- соответствия региону/уезду исторических данных (если указаны),
- типа объекта (село, деревня предпочтительнее),
- если ни один кандидат не подходит — верни index: -1.

Ответь ТОЛЬКО валидным JSON без обрамления: {"index": <число от -1 до ${candidates.length - 1}>, "confidence": <число от 0 до 1>, "reason": "<краткое объяснение по-русски>"}`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content) as {
      index?: number;
      confidence?: number;
      reason?: string;
    };
    if (
      typeof parsed.index !== "number" ||
      parsed.index < -1 ||
      parsed.index >= candidates.length
    ) {
      return null;
    }
    if (parsed.index === -1) {
      return { index: -1, confidence: 0, reason: parsed.reason || "AI rejected all" };
    }
    return {
      index: parsed.index,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      reason: parsed.reason || "",
    };
  } catch (e) {
    console.error("[aiArbiter]", e);
    return null;
  }
}

async function fetchUnlocated(): Promise<UnlocatedItem[]> {
  // Primary source: bundled JSON (works in both Node dev and Cloudflare worker).
  return unlocatedBundled as UnlocatedItem[];
}

// ---- Auto-merge helpers ------------------------------------------------

interface IndexedFeature {
  id: number;
  lat: number;
  lon: number;
  data: FeatureData;
}

/** Haversine distance in meters between two lat/lon pairs. */
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const BUCKET_DEG = 0.05; // ≈ 5.5 km — guarantees radius ≤ ~5km hits its bucket + 1 ring
function bucketKey(lat: number, lon: number): string {
  return `${Math.floor(lat / BUCKET_DEG)}|${Math.floor(lon / BUCKET_DEG)}`;
}

function buildSpatialIndex(features: IndexedFeature[]): Map<string, IndexedFeature[]> {
  const idx = new Map<string, IndexedFeature[]>();
  for (const f of features) {
    const k = bucketKey(f.lat, f.lon);
    const arr = idx.get(k);
    if (arr) arr.push(f); else idx.set(k, [f]);
  }
  return idx;
}

function bucketNeighbours(lat: number, lon: number): string[] {
  const cy = Math.floor(lat / BUCKET_DEG);
  const cx = Math.floor(lon / BUCKET_DEG);
  const keys: string[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      keys.push(`${cy + dy}|${cx + dx}`);
    }
  }
  return keys;
}

/** Apply published edit/delete overrides to bundled parishes and return an indexable list. */
function buildFeatureIndex(overrides: FeatureOverride[]): IndexedFeature[] {
  const editMap = new Map<number, FeatureData>();
  const deleteSet = new Set<number>();
  for (const o of overrides) {
    if (!o.published) continue;
    if (o.action === "delete" && o.feature_id != null) deleteSet.add(o.feature_id);
    else if (o.action === "edit" && o.feature_id != null && o.data) editMap.set(o.feature_id, o.data);
  }
  const out: IndexedFeature[] = [];
  for (const f of parishesBundled.features) {
    const fid = f.id as number;
    if (deleteSet.has(fid)) continue;
    const edited = editMap.get(fid);
    const data = edited ?? featureToData(f as GeoJSON.Feature<GeoJSON.Point, any>);
    if (!Number.isFinite(data.lat) || !Number.isFinite(data.lon)) continue;
    out.push({ id: fid, lat: data.lat, lon: data.lon, data });
  }
  return out;
}

interface MergeMatch {
  target: IndexedFeature;
  distanceM: number;
  reason: string;
}

function sameSettlement(item: UnlocatedItem, target: FeatureData): boolean {
  const names: [string, string][] = [
    [item.settlement.ru, target.settlement.ru],
    [item.settlement.en, target.settlement.en],
    [item.settlement.ka || "", target.settlement.ka || ""],
  ];
  return names.some(([a, b]) => a && b && isProbableMatch(a, b));
}

function adminMatches(item: UnlocatedItem, target: FeatureData): { ok: boolean; how: string } {
  const itemU = normalizeAdmin(item.uezd.ru || item.uezd.en);
  const itemR = normalizeAdmin(item.region.ru || item.region.en);
  const tgtU = normalizeAdmin(target.uezd.ru || target.uezd.en);
  const tgtR = normalizeAdmin(target.region.ru || target.region.en);
  // Cross-match uezd/region — "уезд" vs "район" stripped, "Тифлисский" = "Тифлисский".
  const buckets = [itemU, itemR].filter(Boolean);
  const tgtBuckets = [tgtU, tgtR].filter(Boolean);
  for (const a of buckets) {
    for (const b of tgtBuckets) {
      if (a === b) return { ok: true, how: `admin «${a}» совпал` };
    }
  }
  // If both sides have no admin info at all, name+distance alone is too weak — refuse.
  if (buckets.length === 0 && tgtBuckets.length === 0) return { ok: false, how: "нет admin-полей" };
  return { ok: false, how: `admin расходится (ист. ${buckets.join("/") || "—"} vs ${tgtBuckets.join("/") || "—"})` };
}

function findMergeTarget(
  item: UnlocatedItem,
  lat: number,
  lon: number,
  index: Map<string, IndexedFeature[]>,
  mergeRadiusM: number,
): { match: MergeMatch | null; nearbyMiss: { target: IndexedFeature; distanceM: number; why: string } | null } {
  let best: MergeMatch | null = null;
  let nearbyMiss: { target: IndexedFeature; distanceM: number; why: string } | null = null;
  for (const key of bucketNeighbours(lat, lon)) {
    const arr = index.get(key);
    if (!arr) continue;
    for (const f of arr) {
      const d = haversineM(lat, lon, f.lat, f.lon);
      if (d > mergeRadiusM) continue;
      const nameOk = sameSettlement(item, f.data);
      if (!nameOk) {
        if (!nearbyMiss || d < nearbyMiss.distanceM) {
          nearbyMiss = { target: f, distanceM: d, why: "имя не совпадает" };
        }
        continue;
      }
      const adm = adminMatches(item, f.data);
      if (!adm.ok) {
        if (!nearbyMiss || d < nearbyMiss.distanceM) {
          nearbyMiss = { target: f, distanceM: d, why: adm.how };
        }
        continue;
      }
      if (!best || d < best.distanceM) {
        best = { target: f, distanceM: d, reason: `имя+${adm.how}` };
      }
    }
  }
  return { match: best, nearbyMiss };
}

/** Union two compact year strings into a deduplicated, range-compacted string. */
function unionYearsRaw(a: string, b: string): string {
  const years = Array.from(new Set([...parseYearsString(a), ...parseYearsString(b)])).sort((x, y) => x - y);
  if (years.length === 0) return "";
  const parts: string[] = [];
  let start = years[0];
  let prev = years[0];
  for (let i = 1; i <= years.length; i++) {
    const y = years[i];
    if (y === prev + 1) { prev = y; continue; }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = prev = y;
  }
  return parts.join(", ");
}

function mergeStr(existing: string, incoming: string): string {
  const a = (existing || "").trim();
  const b = (incoming || "").trim();
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;
  // Avoid double-append if already contains.
  if (a.toLocaleLowerCase().includes(b.toLocaleLowerCase())) return a;
  return `${a} / ${b}`;
}

function buildMergedFeatureData(existing: FeatureData, item: UnlocatedItem, osmName: string): FeatureData {
  void osmName;
  const merged: FeatureData = {
    ...existing,
    settlement: { ...existing.settlement },
    church: {
      ru: mergeStr(existing.church.ru, item.church.ru),
      en: mergeStr(existing.church.en, item.church.en),
      ka: mergeStr(existing.church.ka, item.church.ka || ""),
    },
    region: {
      ru: existing.region.ru || item.region.ru,
      en: existing.region.en || item.region.en,
      ka: existing.region.ka || item.region.ka || "",
    },
    uezd: {
      ru: existing.uezd.ru || item.uezd.ru,
      en: existing.uezd.en || item.uezd.en,
      ka: existing.uezd.ka || item.uezd.ka || "",
    },
    yearsRaw: {
      ru: unionYearsRaw(existing.yearsRaw.ru, item.years),
      en: unionYearsRaw(existing.yearsRaw.en, item.years),
      ka: existing.yearsRaw.ka || "",
    },
    startYear: existing.startYear,
    endYear: existing.endYear,
  };
  // Refresh start/end from union if incoming widens the range.
  const allYears = parseYearsString(merged.yearsRaw.ru || merged.yearsRaw.en || "");
  if (allYears.length) {
    merged.startYear = Math.min(merged.startYear || allYears[0], allYears[0]);
    merged.endYear = Math.max(merged.endYear || allYears[allYears.length - 1], allYears[allYears.length - 1]);
  }
  if (item.startYear != null) merged.startYear = Math.min(merged.startYear, item.startYear);
  if (item.endYear != null) merged.endYear = Math.max(merged.endYear, item.endYear);
  return merged;
}



// ---- Server function ---------------------------------------------------

export const runAiGeocoder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        limit: z.number().int().min(1).max(100).default(10),
        uezd: z.string().max(200).optional(),
        minConfidence: z.number().min(0).max(1).default(0.55),
        offset: z.number().int().min(0).default(0),
        /** Min length of a token to be considered when matching name/region. */
        minTokenLen: z.number().int().min(2).max(10).default(3),
        /** Length of leading stem used for fuzzy token matching (e.g. «хашур» = «хашурск»). */
        prefixLen: z.number().int().min(3).max(8).default(5),
        /** If false, region/uezd mismatch becomes a warning instead of a hard reject. */
        geoStrict: z.boolean().default(true),
        /** Conflict radius in meters around a candidate point (against pending suggestions). */
        conflictRadiusM: z.number().int().min(0).max(5000).default(300),
        /** Radius for auto-merging into an existing published feature. */
        mergeRadiusM: z.number().int().min(0).max(5000).default(1500),
        /** Min AI confidence required to auto-merge into a published feature. */
        minMergeConfidence: z.number().min(0).max(1).default(0.75),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Verify admin role
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr || isAdmin !== true) {
      throw new Response("Forbidden", { status: 403 });
    }

    const items = await fetchUnlocated();

    // Existing suggestion keys (any status) — to avoid duplicates
    const { data: existing } = await supabaseAdmin
      .from("coord_suggestions")
      .select("settlement_ru, settlement_en, uezd_ru, uezd_en");
    const existingKeys = new Set(
      (existing || []).map((e) =>
        `${(e.settlement_ru || e.settlement_en || "").toLocaleLowerCase().trim()}|${(e.uezd_ru || e.uezd_en || "").toLocaleLowerCase().trim()}`,
      ),
    );

    let candidates = items.filter((it) => (it.settlement.ru || it.settlement.en).trim().length > 0);
    if (data.uezd) {
      const u = data.uezd.toLocaleLowerCase().trim();
      candidates = candidates.filter(
        (it) =>
          (it.uezd.ru || "").toLocaleLowerCase().includes(u) ||
          (it.uezd.en || "").toLocaleLowerCase().includes(u),
      );
    }
    candidates = candidates.filter((it) => !existingKeys.has(key(it)));
    // Hard chunk cap to stay within worker timeout (~30s).
    // Each item ≈ 3-5s (Nominatim + AI). Client loops for larger batches.
    const CHUNK_MAX = 3;
    const effectiveLimit = Math.min(data.limit, CHUNK_MAX);
    const totalRemaining = candidates.length;
    candidates = candidates.slice(data.offset, data.offset + effectiveLimit);

    // Load published overrides + build spatial index of canonical features once per request.
    const { data: ovRows } = await supabaseAdmin
      .from("feature_overrides")
      .select("id, feature_id, action, data, published, notes, created_at, updated_at")
      .eq("published", true)
      .order("updated_at", { ascending: true });
    const published = (ovRows || []) as unknown as FeatureOverride[];
    const featureList = buildFeatureIndex(published);
    const featureIndex = buildSpatialIndex(featureList);
    // For looking up existing edit overrides when we want to merge into a feature
    // that already has one (must update, not insert second).
    const editOverrideByFid = new Map<number, FeatureOverride>();
    for (const o of published) {
      if (o.action === "edit" && o.feature_id != null) editOverrideByFid.set(o.feature_id, o);
    }


    const result: BatchResult = {
      processed: 0,
      scanned: 0,
      inserted: 0,
      skipped: 0,
      rejected: 0,
      merged: 0,
      remaining: Math.max(0, totalRemaining - data.offset - effectiveLimit),
      errors: [],
      log: [],
    };

    for (const item of candidates) {
      result.scanned++;
      const label = item.settlement.ru || item.settlement.en;
      const uezdLabel = item.uezd.ru || item.uezd.en || "";
      try {
        const cands = await geocodeCandidates(item);
        if (cands.length === 0) {
          result.rejected++;
          result.log.push({
            settlement: label,
            uezd: uezdLabel,
            status: "rejected",
            note: "Nominatim ничего не нашёл в Грузии",
          });
          continue;
        }
        const arb = await aiArbiter(item, cands);
        if (!arb || arb.index === -1) {
          result.rejected++;
          result.log.push({
            settlement: label,
            uezd: uezdLabel,
            status: "rejected",
            note: arb?.reason || "AI отклонил всех кандидатов",
          });
          continue;
        }
        if (arb.confidence < data.minConfidence) {
          result.skipped++;
          result.processed++;
          result.log.push({
            settlement: label,
            uezd: uezdLabel,
            status: "skipped",
            confidence: arb.confidence,
            note: `confidence ${arb.confidence.toFixed(2)} < ${data.minConfidence}`,
          });
          continue;
        }
        const chosen = cands[arb.index];
        const lat = parseFloat(chosen.lat);
        const lon = parseFloat(chosen.lon);

        // Per-edit consistency checks: region/uezd + name across RU/EN/KA
        const validation = validateOsmMatch(item, chosen, {
          minTokenLen: data.minTokenLen,
          prefixLen: data.prefixLen,
          geoStrict: data.geoStrict,
        });
        if (!validation.ok) {
          result.rejected++;
          result.log.push({
            settlement: label,
            uezd: uezdLabel,
            status: "rejected",
            confidence: arb.confidence,
            note: `авто-проверка: ${validation.reasons.join("; ")}`,
            lat,
            lon,
          });
          continue;
        }

        // --- Auto-merge: try to fold candidate into an existing published feature ---
        const { match: mergeMatch, nearbyMiss } = findMergeTarget(
          item, lat, lon, featureIndex, data.mergeRadiusM,
        );
        if (mergeMatch && arb.confidence >= data.minMergeConfidence) {
          const existingOv = editOverrideByFid.get(mergeMatch.target.id);
          // Use the latest data we have (either the edit override or the bundled feature).
          const baseData = existingOv?.data ?? mergeMatch.target.data;
          const merged = buildMergedFeatureData(baseData, item, chosen.display_name);
          const notes = `AI auto-merge · confidence ${arb.confidence.toFixed(2)} · ${mergeMatch.reason} · ${Math.round(mergeMatch.distanceM)} м · OSM: ${chosen.display_name}`;
          let writeErr: { message: string } | null = null;
          if (existingOv) {
            const { error } = await supabaseAdmin
              .from("feature_overrides")
              .update({ data: JSON.parse(JSON.stringify(merged)), notes, published: true })
              .eq("id", existingOv.id);
            writeErr = error;
            if (!error) existingOv.data = merged;
          } else {
            const { data: inserted, error } = await supabaseAdmin
              .from("feature_overrides")
              .insert({
                feature_id: mergeMatch.target.id,
                action: "edit",
                data: JSON.parse(JSON.stringify(merged)),
                published: true,
                notes,
              })
              .select("id, feature_id, action, data, published, notes, created_at, updated_at")
              .single();
            writeErr = error;
            if (inserted) editOverrideByFid.set(mergeMatch.target.id, inserted as unknown as FeatureOverride);
          }
          // Keep the in-memory feature in sync so subsequent items in the same batch see the merged data.
          mergeMatch.target.data = merged;
          if (writeErr) {
            result.errors.push({ settlement: label, reason: writeErr.message });
            result.log.push({
              settlement: label, uezd: uezdLabel, status: "error",
              note: `авто-слияние не сохранилось: ${writeErr.message}`,
              lat, lon, featureId: mergeMatch.target.id,
            });
          } else {
            result.merged++;
            result.processed++;
            result.log.push({
              settlement: label,
              uezd: uezdLabel,
              status: "merged",
              confidence: arb.confidence,
              note: `слито с #${mergeMatch.target.id} «${mergeMatch.target.data.settlement.ru || mergeMatch.target.data.settlement.en}» (${Math.round(mergeMatch.distanceM)} м, ${mergeMatch.reason})`,
              lat, lon, featureId: mergeMatch.target.id,
            });
          }
          continue;
        }



        // Conflict check: nearby existing record (configurable radius).
        // 1° lat ≈ 111 km; 1° lon ≈ 111 km * cos(lat).
        const radiusDegLat = data.conflictRadiusM / 111_000;
        const radiusDegLon = data.conflictRadiusM / (111_000 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
        const { data: nearby } = await supabaseAdmin
          .from("coord_suggestions")
          .select("id, settlement_ru, settlement_en, status")
          .gte("lat", lat - radiusDegLat)
          .lte("lat", lat + radiusDegLat)
          .gte("lon", lon - radiusDegLon)
          .lte("lon", lon + radiusDegLon)
          .limit(1);
        if (nearby && nearby.length > 0) {
          const n = nearby[0];
          result.skipped++;
          result.processed++;
          result.log.push({
            settlement: label,
            uezd: uezdLabel,
            status: "skipped",
            confidence: arb.confidence,
            note: `конфликт: рядом уже есть запись «${n.settlement_ru || n.settlement_en}» (${n.status})`,
            lat,
            lon,
          });
          continue;
        }

        const warnSuffix = validation.warnings.length > 0
          ? ` · предупр.: ${validation.warnings.join(", ")}`
          : "";

        const { error: insErr } = await supabaseAdmin
          .from("coord_suggestions")
          .insert({
            settlement_ru: item.settlement.ru || "",
            settlement_en: item.settlement.en || "",
            uezd_ru: item.uezd.ru || "",
            uezd_en: item.uezd.en || "",
            region_ru: item.region.ru || "",
            region_en: item.region.en || "",
            church_ru: item.church.ru || "",
            church_en: item.church.en || "",
            years: item.years || "",
            start_year: item.startYear ?? null,
            end_year: item.endYear ?? null,
            lat,
            lon,
            status: "pending",
            submitter_note: `AI-геокодер · confidence ${arb.confidence.toFixed(2)} · ${arb.reason} · OSM: ${chosen.display_name}${warnSuffix}`,
          });
        if (insErr) {
          result.errors.push({ settlement: label, reason: insErr.message });
          result.log.push({
            settlement: label,
            uezd: uezdLabel,
            status: "error",
            note: insErr.message,
          });
        } else {
          result.inserted++;
          result.processed++;
          result.log.push({
            settlement: label,
            uezd: uezdLabel,
            status: "inserted",
            confidence: arb.confidence,
            note: arb.reason,
            lat,
            lon,
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push({ settlement: label, reason: msg });
        result.log.push({
          settlement: label,
          uezd: uezdLabel,
          status: "error",
          note: msg,
        });
      }
    }

    return result;
  });

export const listUnlocatedUezds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (isAdmin !== true) throw new Response("Forbidden", { status: 403 });
    const items = await fetchUnlocated();
    const set = new Map<string, number>();
    for (const it of items) {
      const u = (it.uezd.ru || it.uezd.en || "").trim();
      if (!u) continue;
      set.set(u, (set.get(u) || 0) + 1);
    }
    return [...set.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([uezd, count]) => ({ uezd, count }));
  });
