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
  /** Бывшие/альтернативные названия — список через запятую (UI), массив в properties. */
  aliases?: MultiLang;
  /** Заметка администратора о расхождении уезда / атрибуции. */
  discrepancyNote?: MultiLang;
  /** Пропущенные годы (текстом, "1850, 1855-1857"). */
  missingYearsRaw?: { ru: string; en: string; ka?: string };
}

export interface ValidationIssue {
  field:
    | "startYear"
    | "endYear"
    | "yearsRaw"
    | "missingYearsRaw"
    | "lat"
    | "lon"
    | "settlement";
  severity: "error" | "warning";
  message: string;
}

const YEAR_MIN = 1700;
const YEAR_MAX = 2100;

export function validateFeatureData(d: FeatureData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const sy = d.startYear;
  const ey = d.endYear;

  if (!Number.isInteger(sy) || sy < YEAR_MIN || sy > YEAR_MAX) {
    issues.push({ field: "startYear", severity: "error", message: `Начало: год должен быть в ${YEAR_MIN}–${YEAR_MAX}.` });
  }
  if (!Number.isInteger(ey) || ey < YEAR_MIN || ey > YEAR_MAX) {
    issues.push({ field: "endYear", severity: "error", message: `Конец: год должен быть в ${YEAR_MIN}–${YEAR_MAX}.` });
  }
  if (Number.isInteger(sy) && Number.isInteger(ey) && ey < sy) {
    issues.push({ field: "endYear", severity: "error", message: "Конец не может быть раньше начала." });
  }

  const raw = d.yearsRaw?.ru || d.yearsRaw?.en || "";
  if (raw.trim()) {
    const years = parseYearsString(raw);
    if (years.length === 0) {
      issues.push({ field: "yearsRaw", severity: "error", message: "Не удалось распознать годы (например: «1845-1916» или «1836, 1838»)." });
    } else if (Number.isInteger(sy) && Number.isInteger(ey)) {
      const oob = years.filter((y) => y < sy || y > ey);
      if (oob.length) {
        issues.push({ field: "yearsRaw", severity: "warning", message: `Годы вне диапазона начала/конца: ${oob.slice(0, 5).join(", ")}${oob.length > 5 ? "…" : ""}.` });
      }
    }
  } else {
    issues.push({ field: "yearsRaw", severity: "warning", message: "Поле «Годы» пустое." });
  }

  const missRaw = d.missingYearsRaw?.ru || d.missingYearsRaw?.en || "";
  if (missRaw.trim()) {
    const miss = parseYearsString(missRaw);
    if (miss.length === 0) {
      issues.push({ field: "missingYearsRaw", severity: "error", message: "Не удалось распознать пропуски." });
    } else if (Number.isInteger(sy) && Number.isInteger(ey)) {
      const oob = miss.filter((y) => y < sy || y > ey);
      if (oob.length) {
        issues.push({ field: "missingYearsRaw", severity: "error", message: `Пропуски вне диапазона: ${oob.slice(0, 5).join(", ")}${oob.length > 5 ? "…" : ""}.` });
      }
      const present = new Set(parseYearsString(raw));
      const overlap = miss.filter((y) => present.has(y));
      if (overlap.length) {
        issues.push({ field: "missingYearsRaw", severity: "warning", message: `Эти годы отмечены и как имеющиеся, и как пропуски: ${overlap.slice(0, 5).join(", ")}.` });
      }
    }
  }

  if (!Number.isFinite(d.lat) || d.lat < -90 || d.lat > 90) {
    issues.push({ field: "lat", severity: "error", message: "Широта вне диапазона −90…90." });
  }
  if (!Number.isFinite(d.lon) || d.lon < -180 || d.lon > 180) {
    issues.push({ field: "lon", severity: "error", message: "Долгота вне диапазона −180…180." });
  }
  if (!d.settlement.ru && !d.settlement.en && !d.settlement.ka) {
    issues.push({ field: "settlement", severity: "error", message: "Укажите название села хотя бы на одном языке." });
  }
  return issues;
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
    aliases: emptyMultiLang(),
    discrepancyNote: emptyMultiLang(),
    missingYearsRaw: { ru: "", en: "", ka: "" },
  };
}

/** Split comma/semicolon/newline-separated alias string into trimmed unique values. */
function splitAliasString(s: string): string[] {
  if (!s) return [];
  return Array.from(
    new Set(
      s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean),
    ),
  );
}

/** Read aliases from properties (array on disk → comma-joined string for UI). */
function readAliases(v: any): MultiLang {
  const j = (arr: any) => Array.isArray(arr) ? arr.filter(Boolean).join(", ") : "";
  if (!v || typeof v !== "object") return emptyMultiLang();
  return { ru: j(v.ru), en: j(v.en), ka: j(v.ka) };
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
    aliases: readAliases(p.aliases),
    discrepancyNote: readMl(p.discrepancyNote) ?? emptyMultiLang(),
    missingYearsRaw: {
      ru: p.missingRaw?.ru ?? "",
      en: p.missingRaw?.en ?? "",
      ka: p.missingRaw?.ka ?? "",
    },
  };
}

export function dataToFeature(
  d: FeatureData,
  id: number,
): GeoJSON.Feature<GeoJSON.Point, any> {
  const yearsRaw = d.yearsRaw ?? { ru: "", en: "", ka: "" };
  const years = parseYearsString(yearsRaw.ru || yearsRaw.en || "");
  const startYear = d.startYear || years[0] || 1900;
  const endYear = d.endYear || (years.length ? years[years.length - 1] : startYear);
  const hist = readMl(d.historicalName);
  const note = readMl(d.discrepancyNote);
  const missingYears = parseYearsString(d.missingYearsRaw?.ru || d.missingYearsRaw?.en || "");
  // Aliases: split comma/semicolon strings into arrays per language. Include
  // historicalName values automatically so search picks them up too.
  const aliasArr = {
    ru: splitAliasString(d.aliases?.ru || ""),
    en: splitAliasString(d.aliases?.en || ""),
    ka: splitAliasString(d.aliases?.ka || ""),
  };
  if (hist?.ru && !aliasArr.ru.includes(hist.ru)) aliasArr.ru.unshift(hist.ru);
  if (hist?.en && !aliasArr.en.includes(hist.en)) aliasArr.en.unshift(hist.en);
  if (hist?.ka && !aliasArr.ka.includes(hist.ka)) aliasArr.ka.unshift(hist.ka);
  const hasAliases = aliasArr.ru.length || aliasArr.en.length || aliasArr.ka.length;
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [d.lon, d.lat] },
    properties: {
      settlement: d.settlement ?? emptyMultiLang(),
      church: d.church ?? emptyMultiLang(),
      region: d.region ?? emptyMultiLang(),
      uezd: d.uezd ?? emptyMultiLang(),
      yearsRaw,
      missingRaw: d.missingYearsRaw ?? { ru: "", en: "", ka: "" },
      startYear,
      endYear,
      coverage: Math.max(1, (years.length || 1) - missingYears.length),
      missingCount: missingYears.length,
      bucket: bucketOf(startYear),
      adminEdited: true,
      ...(hist ? { historicalName: hist } : {}),
      ...(hasAliases ? { aliases: aliasArr } : {}),
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
      .order("updated_at", { ascending: true })
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
