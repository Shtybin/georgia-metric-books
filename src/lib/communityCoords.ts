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
  settlement_ka?: string;
  church_ka?: string;
  region_ka?: string;
  uezd_ka?: string;
}

type KaDict = Record<"settlement" | "church" | "region" | "uezd", Record<string, string>>;

function kaOf(dict: Record<string, string>, ru: string): string {
  const v = (ru || "").trim();
  if (!v) return "";
  if (dict[v]) return dict[v];
  const parts = v.split("|").map((p) => p.trim());
  if (parts.length > 1 && parts.every((p) => dict[p])) return parts.map((p) => dict[p]).join(" | ");
  return "";
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
      settlement: { ru: s.settlement_ru, en: s.settlement_en || s.settlement_ru, ka: s.settlement_ka || s.settlement_en || s.settlement_ru },
      church: { ru: s.church_ru, en: s.church_en || s.church_ru, ka: s.church_ka || s.church_en || s.church_ru },
      region: { ru: s.region_ru, en: s.region_en || s.region_ru, ka: s.region_ka || s.region_en || s.region_ru },
      uezd: { ru: s.uezd_ru, en: s.uezd_en || s.uezd_ru, ka: s.uezd_ka || s.uezd_en || s.uezd_ru },
      yearsRaw: { ru: s.years, en: s.years, ka: s.years },
      missingRaw: { ru: "", en: "", ka: "" },
      startYear,
      endYear,
      coverage: Math.max(1, years.length || 1),
      missingCount: 0,
      bucket: bucketOf(startYear),
      communityAdded: true,
      suggestionId: s.id,
    },
  };
}

export function useApprovedSuggestions() {
  const [approved, setApproved] = useState<ApprovedSuggestion[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // Paginate: the Data API caps a single response at 1000 rows.
      const PAGE = 1000;
      const rows: ApprovedSuggestion[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("coord_suggestions")
          .select(
            "id, settlement_ru, settlement_en, uezd_ru, uezd_en, region_ru, region_en, church_ru, church_en, years, start_year, end_year, lat, lon",
          )
          .eq("status", "approved")
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) {
          console.error("[approved suggestions]", error);
          break;
        }
        rows.push(...((data || []) as ApprovedSuggestion[]));
        if (!data || data.length < PAGE) break;
      }
      let dict: KaDict | null = null;
      try {
        dict = await fetch("/data/ka-names.json", { cache: "no-cache" }).then((r) => r.json());
      } catch {
        dict = null;
      }
      const enriched = dict
        ? rows.map((r) => ({
            ...r,
            settlement_ka: kaOf(dict!.settlement, r.settlement_ru),
            church_ka: kaOf(dict!.church, r.church_ru),
            region_ka: kaOf(dict!.region, r.region_ru),
            uezd_ka: kaOf(dict!.uezd, r.uezd_ru),
          }))
        : rows;
      if (mounted) setApproved(enriched);
    })();
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
