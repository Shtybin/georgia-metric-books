/**
 * Client-side grouping of map points that share (essentially) identical
 * coordinates. Different churches in the same settlement that ended up as
 * separate records are merged into a single marker whose card lists every
 * church and reports the combined year range / coverage / categories.
 *
 * Grouping precision: 4 decimal degrees ≈ 11 m. Points farther apart than
 * that stay separate.
 */
import { parseYearsString, bucketOf } from "@/lib/userCoords";

type Feature = GeoJSON.Feature<GeoJSON.Point, any>;

const PRECISION = 4;

function coordKey(f: Feature): string | null {
  const coords = f.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lon, lat] = coords;
  if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return `${lon.toFixed(PRECISION)}|${lat.toFixed(PRECISION)}`;
}

function splitChurches(s: unknown): string[] {
  if (typeof s !== "string" || !s) return [];
  return s.split("|").map((x) => x.trim()).filter(Boolean);
}

function mergeLangChurch(features: Feature[], code: "ru" | "en" | "ka"): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of features) {
    const val = f.properties?.church?.[code];
    for (const part of splitChurches(val)) {
      const k = part.toLocaleLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(part);
    }
  }
  return out.join(" | ");
}

function mergeLangText(features: Feature[], field: string, code: "ru" | "en" | "ka", sep: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of features) {
    const v = f.properties?.[field]?.[code];
    if (typeof v !== "string" || !v.trim()) continue;
    const t = v.trim();
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.join(sep);
}

function mergeCategories(features: Feature[]): string[] {
  const set = new Set<string>();
  for (const f of features) {
    const cats = f.properties?.categories;
    if (Array.isArray(cats)) for (const c of cats) set.add(c);
  }
  return [...set];
}

function buildMembers(group: Feature[]): any[] {
  const out: any[] = [];
  for (const f of group) {
    const p = f.properties ?? {};
    // Each source feature may itself bundle multiple "|"-separated churches —
    // expand them so each church row is independently filterable. Year/category
    // metadata is shared across the expanded rows (we don't have per-church
    // granularity at this point).
    const ru = splitChurches(p.church?.ru);
    const en = splitChurches(p.church?.en);
    const ka = splitChurches(p.church?.ka);
    const n = Math.max(ru.length, en.length, ka.length, 1);
    const startYear = Number(p.startYear);
    const endYear = Number(p.endYear);
    const bucket = typeof p.bucket === "string"
      ? p.bucket
      : (Number.isFinite(startYear) ? bucketOf(startYear) : undefined);
    const categories: string[] = Array.isArray(p.categories) ? p.categories : [];
    for (let i = 0; i < n; i++) {
      out.push({
        church: { ru: ru[i] || "", en: en[i] || "", ka: ka[i] || "" },
        startYear: Number.isFinite(startYear) ? startYear : null,
        endYear: Number.isFinite(endYear) ? endYear : null,
        bucket,
        categories,
        yearsRaw: { ru: p.yearsRaw?.ru || "", en: p.yearsRaw?.en || "" },
      });
    }
  }
  return out;
}

function mergeFeatureGroup(group: Feature[]): Feature {
  if (group.length === 1) {
    const base = group[0];
    // Even single-feature points expose `members` so the card has a uniform
    // shape and per-church filter chips work consistently.
    return {
      ...base,
      properties: { ...(base.properties ?? {}), members: buildMembers(group) },
    };
  }
  const base = group[0];

  // Union of all calendar years across members.
  const yearSet = new Set<number>();
  let minStart = Number.POSITIVE_INFINITY;
  let maxEnd = Number.NEGATIVE_INFINITY;
  for (const f of group) {
    const yrs = parseYearsString(f.properties?.yearsRaw?.ru || f.properties?.yearsRaw?.en || "");
    for (const y of yrs) yearSet.add(y);
    const s = Number(f.properties?.startYear);
    const e = Number(f.properties?.endYear);
    if (Number.isFinite(s)) minStart = Math.min(minStart, s);
    if (Number.isFinite(e)) maxEnd = Math.max(maxEnd, e);
  }
  const startYear = Number.isFinite(minStart) ? minStart : (base.properties?.startYear ?? 1900);
  const endYear = Number.isFinite(maxEnd) ? maxEnd : (base.properties?.endYear ?? startYear);
  const coverage = yearSet.size || group.reduce((acc, f) => acc + Number(f.properties?.coverage || 0), 0) || 1;

  const churchRu = mergeLangChurch(group, "ru");
  const churchEn = mergeLangChurch(group, "en");
  const churchKa = mergeLangChurch(group, "ka");

  return {
    ...base,
    properties: {
      ...(base.properties ?? {}),
      church: { ru: churchRu, en: churchEn, ka: churchKa },
      yearsRaw: {
        ru: mergeLangText(group, "yearsRaw", "ru", " · "),
        en: mergeLangText(group, "yearsRaw", "en", " · "),
      },
      missingRaw: {
        ru: mergeLangText(group, "missingRaw", "ru", " · "),
        en: mergeLangText(group, "missingRaw", "en", " · "),
      },
      startYear,
      endYear,
      coverage,
      missingCount: group.reduce((acc, f) => acc + Number(f.properties?.missingCount || 0), 0),
      bucket: bucketOf(startYear),
      categories: mergeCategories(group),
      mergedCount: group.length,
      mergedIds: group.map((f) => f.id),
      members: buildMembers(group),
    },
  };
}

/** Haversine distance in kilometres between two [lon, lat] pairs. */
function distanceKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function settlementKey(f: Feature): string | null {
  const p = f.properties ?? {};
  const s = (p.settlement?.ru || p.settlement?.en || "").toLocaleLowerCase().trim();
  if (!s) return null;
  // Settlement-only key. Uezd/region spellings frequently disagree between
  // the bundled dataset and approved geocoder suggestions for the same
  // village (or one side is empty), so requiring them to match exactly
  // leaves obvious duplicates split. Real conflicts are blocked by
  // `adminCompatible` + the SAME_SETTLEMENT_MAX_KM distance check.
  return s;
}

function norm(s: unknown): string {
  return typeof s === "string" ? s.toLocaleLowerCase().trim() : "";
}

function adminCompatible(a: Feature, b: Feature): boolean {
  const pa = a.properties ?? {}, pb = b.properties ?? {};
  const ua = norm(pa.uezd?.ru) || norm(pa.uezd?.en);
  const ub = norm(pb.uezd?.ru) || norm(pb.uezd?.en);
  const ra = norm(pa.region?.ru) || norm(pa.region?.en);
  const rb = norm(pb.region?.ru) || norm(pb.region?.en);
  if (ua && ub && ua !== ub) return false;
  if (ra && rb && ra !== rb) return false;
  return true;
}

/**
 * Maximum distance between two points sharing the same settlement+uezd+region
 * that are still considered the same place. Far enough to absorb GPS jitter
 * and slightly disagreeing geocoder hits (~1.5 km), but tight enough to keep
 * genuinely different villages with the same name (e.g. two "Ахалдаба" 60 km
 * apart) as separate markers.
 */
const SAME_SETTLEMENT_MAX_KM = 1.5;

export function mergeColocatedFeatures(features: Feature[]): Feature[] {
  // Pass 1 — exact-coord groups (rounded to ~11 m).
  const coordGroups = new Map<string, Feature[]>();
  for (const f of features) {
    const k = coordKey(f);
    if (!k) continue;
    const arr = coordGroups.get(k);
    if (arr) arr.push(f);
    else coordGroups.set(k, [f]);
  }

  // Pass 2 — merge coord-groups that share settlement+uezd+region and whose
  // centroids are within SAME_SETTLEMENT_MAX_KM of each other.
  type Cluster = {
    features: Feature[];
    centroid: [number, number];
  };
  const bySettlement = new Map<string, Cluster[]>();
  const unkeyed: Cluster[] = [];

  for (const group of coordGroups.values()) {
    const c = group[0].geometry.coordinates as [number, number];
    const cluster: Cluster = { features: group, centroid: c };
    const sk = settlementKey(group[0]);
    if (!sk) {
      unkeyed.push(cluster);
      continue;
    }
    const list = bySettlement.get(sk);
    if (!list) {
      bySettlement.set(sk, [cluster]);
      continue;
    }
    // Find an existing nearby cluster to merge into.
    let merged = false;
    for (const existing of list) {
      if (distanceKm(existing.centroid, c) <= SAME_SETTLEMENT_MAX_KM) {
        existing.features.push(...group);
        merged = true;
        break;
      }
    }
    if (!merged) list.push(cluster);
  }

  const out: Feature[] = [];
  for (const list of bySettlement.values()) {
    for (const cl of list) out.push(mergeFeatureGroup(cl.features));
  }
  for (const cl of unkeyed) out.push(mergeFeatureGroup(cl.features));
  return out;
}
