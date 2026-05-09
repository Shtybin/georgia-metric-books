import { useCallback, useEffect, useState } from "react";
import type { UnlocatedItem } from "@/components/map/UnlocatedPanel";

const STORAGE_KEY = "georgia-metric-books:user-coords:v1";

export type UnlocatedKey = string; // `${settlementLower}|${uezdLower}`

export function unlocatedKey(item: UnlocatedItem): UnlocatedKey {
  const s = (item.settlement.ru || item.settlement.en || "").toLocaleLowerCase().trim();
  const u = (item.uezd.ru || item.uezd.en || "").toLocaleLowerCase().trim();
  return `${s}|${u}`;
}

export interface UserCoordRecord {
  key: UnlocatedKey;
  lat: number;
  lon: number;
  item: UnlocatedItem;
  addedAt: number;
}

type Records = Record<UnlocatedKey, UserCoordRecord>;

type LastAction =
  | { type: "add"; key: UnlocatedKey }
  | null;

function loadRecords(): Records {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Records;
  } catch {
    return {};
  }
}

function saveRecords(records: Records) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    /* ignore quota */
  }
}

export function useUserCoords() {
  const [records, setRecords] = useState<Records>({});
  const [lastAction, setLastAction] = useState<LastAction>(null);

  // Hydrate from localStorage on mount (avoid SSR mismatch)
  useEffect(() => {
    setRecords(loadRecords());
  }, []);

  const add = useCallback((item: UnlocatedItem, lat: number, lon: number) => {
    const key = unlocatedKey(item);
    setRecords((prev) => {
      const next = { ...prev, [key]: { key, lat, lon, item, addedAt: Date.now() } };
      saveRecords(next);
      return next;
    });
    setLastAction({ type: "add", key });
  }, []);

  const undo = useCallback(() => {
    if (!lastAction) return;
    if (lastAction.type === "add") {
      const k = lastAction.key;
      setRecords((prev) => {
        const next = { ...prev };
        delete next[k];
        saveRecords(next);
        return next;
      });
    }
    setLastAction(null);
  }, [lastAction]);

  const dismissUndo = useCallback(() => setLastAction(null), []);

  return { records, add, undo, dismissUndo, lastAction };
}

export type UseUserCoords = ReturnType<typeof useUserCoords>;

/** Parse a compact years string like "1845-1916" or "1836, 1838" into a sorted year list. */
export function parseYearsString(s: string): number[] {
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

export function bucketOf(year: number): string {
  if (year < 1840) return "pre-1840";
  if (year < 1860) return "1840-1860";
  if (year < 1880) return "1860-1880";
  if (year < 1900) return "1880-1900";
  return "post-1900";
}

/** Build a GeoJSON feature from a user coord record. */
export function userRecordToFeature(rec: UserCoordRecord, id: number): GeoJSON.Feature<GeoJSON.Point, any> {
  const it = rec.item;
  const years = parseYearsString(it.years || "");
  const startYear = it.startYear ?? years[0] ?? 1900;
  const endYear = it.endYear ?? (years.length ? years[years.length - 1] : startYear);
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [rec.lon, rec.lat] },
    properties: {
      settlement: it.settlement,
      church: it.church,
      region: it.region,
      uezd: it.uezd,
      yearsRaw: { en: it.years || "", ru: it.years || "" },
      missingRaw: { en: "", ru: "" },
      startYear,
      endYear,
      coverage: Math.max(1, years.length || 1),
      missingCount: 0,
      bucket: bucketOf(startYear),
      userAdded: true,
    },
  };
}
