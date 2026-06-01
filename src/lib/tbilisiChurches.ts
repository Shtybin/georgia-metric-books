import { supabase } from "@/integrations/supabase/client";

export interface TbilisiChurch {
  id: number;
  name: { ka: string; ru: string; en: string };
  confession: import("./i18n-tbilisi").Confession;
  confessionRaw: string;
  address: string;
  district: string;
  lat: number;
  lon: number;
  preserved: import("./i18n-tbilisi").YesNo;
  active: import("./i18n-tbilisi").YesNo;
  recordYears: string;
  startYear: number | null;
  endYear: number | null;
  missingYears: string;
  note: string | { ru: string; en: string; ka: string };
  confidence: import("./i18n-tbilisi").Confidence;
  historicalNote: string | { ru: string; en: string; ka: string };
  /** true if coords were updated by an approved AI verification */
  verifiedByAi?: boolean;
  /**
   * Whether this record exists in the official archival catalog
   * (archival-services.gov.ge/saeklesio/regions/location/55).
   * Rows with `inArchive === false` are hidden from /tbilisi and the admin
   * panel, but remain in the JSON file so they can be restored later.
   */
  inArchive?: boolean;
}

let cache: TbilisiChurch[] | null = null;
let inflight: Promise<TbilisiChurch[]> | null = null;

export function fetchTbilisiChurches(): Promise<TbilisiChurch[]> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = Promise.all([
    fetch("/data/tbilisi-churches.json").then((r) => r.json()),
    supabase
      .from("tbilisi_coord_verifications")
      .select("church_id, new_lat, new_lon")
      .eq("status", "approved")
      .then(({ data, error }) => {
        if (error) {
          console.warn("[tbilisi verifications]", error);
          return [] as { church_id: number; new_lat: number; new_lon: number }[];
        }
        return (data || []) as { church_id: number; new_lat: number; new_lon: number }[];
      }),
  ]).then(([rows, overrides]) => {
    const byId = new Map(overrides.map((o) => [o.church_id, o]));
    const merged = (rows as TbilisiChurch[])
      // Hide rows explicitly flagged as not present in the archival catalog.
      .filter((c) => c.inArchive !== false)
      .map((c) => {
        const o = byId.get(c.id);
        if (!o) return c;
        return { ...c, lat: o.new_lat, lon: o.new_lon, confidence: "high" as const, verifiedByAi: true };
      });
    cache = merged;
    inflight = null;
    return merged;
  });
  return inflight;
}

export const TBILISI_YEAR_MIN = 1818;
export const TBILISI_YEAR_MAX = 1924;
