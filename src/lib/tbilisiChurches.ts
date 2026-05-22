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
}

let cache: TbilisiChurch[] | null = null;
let inflight: Promise<TbilisiChurch[]> | null = null;

export function fetchTbilisiChurches(): Promise<TbilisiChurch[]> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch("/data/tbilisi-churches.json")
    .then((r) => r.json())
    .then((rows: TbilisiChurch[]) => {
      cache = rows;
      inflight = null;
      return rows;
    });
  return inflight;
}

export const TBILISI_YEAR_MIN = 1818;
export const TBILISI_YEAR_MAX = 1924;
