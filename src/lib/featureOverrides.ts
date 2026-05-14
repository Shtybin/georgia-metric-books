import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { bucketOf, parseYearsString } from "@/lib/userCoords";

export interface MultiLang {
  ru: string;
  en: string;
  ka: string;
}

export interface FeatureData {
  settlement: MultiLang;
  church: MultiLang;
  region: MultiLang;
  uezd: MultiLang;
  yearsRaw: { ru: string; en: string; ka?: string };
  startYear: number;
  endYear: number;
  lat: number;
  lon: number;
  /** Историческое название (бывш. ...) на трёх языках, опционально. */
  historicalName?: MultiLang;
  /** Заметка администратора о расхождении уезда / атрибуции. */
  discrepancyNote?: MultiLang;
}

export type OverrideAction = "edit" | "delete" | "add";

export interface FeatureOverride {
  id: string;
  feature_id: number | null;
  action: OverrideAction;
  data: FeatureData | null;
  published: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const NEW_FEATURE_ID_BASE = 5_000_000;

export function emptyMultiLang(): MultiLang {
  return { ru: "", en: "", ka: "" };
}

export function emptyFeatureData(lat = 41.7151, lon = 44.8271): FeatureData {
  return {
    settlement: emptyMultiLang(),
    church: emptyMultiLang(),
    region: emptyMultiLang(),
    uezd: emptyMultiLang(),
    yearsRaw: { ru: "", en: "", ka: "" },
    startYear: 1900,
    endYear: 1900,
    lat,
    lon,
    historicalName: emptyMultiLang(),
    discrepancyNote: emptyMultiLang(),
  };
}

function readMl(v: any): MultiLang | undefined {
  if (!v || typeof v !== "object") return undefined;
  const ml: MultiLang = { ru: v.ru ?? "", en: v.en ?? "", ka: v.ka ?? "" };
  if (!ml.ru && !ml.en && !ml.ka) return undefined;
  return ml;
}

export function featureToData(f: GeoJSON.Feature<GeoJSON.Point, any>): FeatureData {
  const p = f.properties ?? {};
  const [lon, lat] = (f.geometry?.coordinates as [number, number]) ?? [0, 0];
  return {
    settlement: { ru: p.settlement?.ru ?? "", en: p.settlement?.en ?? "", ka: p.settlement?.ka ?? "" },
    church: { ru: p.church?.ru ?? "", en: p.church?.en ?? "", ka: p.church?.ka ?? "" },
    region: { ru: p.region?.ru ?? "", en: p.region?.en ?? "", ka: p.region?.ka ?? "" },
    uezd: { ru: p.uezd?.ru ?? "", en: p.uezd?.en ?? "", ka: p.uezd?.ka ?? "" },
    yearsRaw: { ru: p.yearsRaw?.ru ?? "", en: p.yearsRaw?.en ?? "", ka: p.yearsRaw?.ka ?? "" },
    startYear: typeof p.startYear === "number" ? p.startYear : 1900,
    endYear: typeof p.endYear === "number" ? p.endYear : 1900,
    lat,
    lon,
    historicalName: readMl(p.historicalName) ?? emptyMultiLang(),
    discrepancyNote: readMl(p.discrepancyNote) ?? emptyMultiLang(),
  };
}

export function dataToFeature(
  d: FeatureData,
  id: number,
): GeoJSON.Feature<GeoJSON.Point, any> {
  const years = parseYearsString(d.yearsRaw.ru || d.yearsRaw.en || "");
  const startYear = d.startYear || years[0] || 1900;
  const endYear = d.endYear || (years.length ? years[years.length - 1] : startYear);
  const hist = readMl(d.historicalName);
  const note = readMl(d.discrepancyNote);
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [d.lon, d.lat] },
    properties: {
      settlement: d.settlement,
      church: d.church,
      region: d.region,
      uezd: d.uezd,
      yearsRaw: d.yearsRaw,
      missingRaw: { ru: "", en: "", ka: "" },
      startYear,
      endYear,
      coverage: Math.max(1, years.length || 1),
      missingCount: 0,
      bucket: bucketOf(startYear),
      adminEdited: true,
      ...(hist ? { historicalName: hist } : {}),
      ...(note ? { discrepancyNote: note } : {}),
    },
  };
}

/** Apply published overrides to base FeatureCollection. */
export function applyOverrides<P = any>(
  base: GeoJSON.FeatureCollection<GeoJSON.Point, P>,
  overrides: FeatureOverride[],
): GeoJSON.FeatureCollection<GeoJSON.Point, P> {
  if (!overrides.length) return base;
  const editMap = new Map<number, FeatureData>();
  const deleteSet = new Set<number>();
  const additions: GeoJSON.Feature<GeoJSON.Point, any>[] = [];

  for (const o of overrides) {
    if (o.action === "delete" && o.feature_id != null) {
      deleteSet.add(o.feature_id);
    } else if (o.action === "edit" && o.feature_id != null && o.data) {
      editMap.set(o.feature_id, o.data);
    } else if (o.action === "add" && o.data) {
      const id = NEW_FEATURE_ID_BASE + parseInt(o.id.replace(/-/g, "").slice(0, 8), 16);
      additions.push(dataToFeature(o.data, id));
    }
  }

  const mapped: GeoJSON.Feature<GeoJSON.Point, any>[] = [];
  for (const f of base.features) {
    const fid = f.id as number;
    if (deleteSet.has(fid)) continue;
    const edit = editMap.get(fid);
    if (edit) mapped.push(dataToFeature(edit, fid));
    else mapped.push(f as GeoJSON.Feature<GeoJSON.Point, any>);
  }
  return {
    ...base,
    features: [...mapped, ...additions] as any,
  };
}

/** Hook for the public map: fetches only published overrides. */
export function usePublishedOverrides() {
  const [overrides, setOverrides] = useState<FeatureOverride[]>([]);
  useEffect(() => {
    let mounted = true;
    supabase
      .from("feature_overrides")
      .select("id, feature_id, action, data, published, notes, created_at, updated_at")
      .eq("published", true)
      .then(({ data, error }) => {
        if (error) {
          console.error("[published overrides]", error);
          return;
        }
        if (mounted && data) setOverrides(data as unknown as FeatureOverride[]);
      });
    return () => {
      mounted = false;
    };
  }, []);
  return overrides;
}
