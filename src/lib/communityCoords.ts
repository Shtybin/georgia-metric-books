import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { UnlocatedItem } from "@/components/map/UnlocatedPanel";
import { parseYearsString, bucketOf } from "@/lib/userCoords";

export interface ApprovedSuggestion {
  id: string;
  settlement_ru: string;
  settlement_en: string;
  uezd_ru: string;
  uezd_en: string;
  region_ru: string;
  region_en: string;
  church_ru: string;
  church_en: string;
  years: string;
  start_year: number | null;
  end_year: number | null;
  lat: number;
  lon: number;
}

export function approvedToFeature(
  s: ApprovedSuggestion,
  id: number,
): GeoJSON.Feature<GeoJSON.Point, any> {
  const years = parseYearsString(s.years || "");
  const startYear = s.start_year ?? years[0] ?? 1900;
  const endYear = s.end_year ?? (years.length ? years[years.length - 1] : startYear);
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [s.lon, s.lat] },
    properties: {
      settlement: { ru: s.settlement_ru, en: s.settlement_en || s.settlement_ru },
      church: { ru: s.church_ru, en: s.church_en || s.church_ru },
      region: { ru: s.region_ru, en: s.region_en || s.region_ru },
      uezd: { ru: s.uezd_ru, en: s.uezd_en || s.uezd_ru },
      yearsRaw: { ru: s.years, en: s.years },
      missingRaw: { ru: "", en: "" },
      startYear,
      endYear,
      coverage: Math.max(1, years.length || 1),
      missingCount: 0,
      bucket: bucketOf(startYear),
      communityAdded: true,
    },
  };
}

export function useApprovedSuggestions() {
  const [approved, setApproved] = useState<ApprovedSuggestion[]>([]);

  useEffect(() => {
    let mounted = true;
    supabase
      .from("coord_suggestions")
      .select(
        "id, settlement_ru, settlement_en, uezd_ru, uezd_en, region_ru, region_en, church_ru, church_en, years, start_year, end_year, lat, lon",
      )
      .eq("status", "approved")
      .then(({ data, error }) => {
        if (error) {
          console.error("[approved suggestions]", error);
          return;
        }
        if (mounted && data) setApproved(data as ApprovedSuggestion[]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return approved;
}

export async function submitSuggestion(item: UnlocatedItem, lat: number, lon: number) {
  const payload = {
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
  };
  const { error } = await supabase.from("coord_suggestions").insert(payload);
  if (error) throw error;
}
