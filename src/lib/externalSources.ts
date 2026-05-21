import { supabase } from "@/integrations/supabase/client";

export type ExternalProvider = "familysearch" | "niag" | "other";
export type ExternalScope = "feature" | "uezd";

export interface ExternalSource {
  id: string;
  provider: ExternalProvider;
  scope: ExternalScope;
  feature_id: number | null;
  uezd_ru: string | null;
  uezd_en: string | null;
  url: string;
  title: string;
  description: string | null;
  place_query: string | null;
  requires_auth: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExternalSourceInput {
  provider: ExternalProvider;
  scope: ExternalScope;
  feature_id?: number | null;
  uezd_ru?: string | null;
  uezd_en?: string | null;
  url: string;
  title: string;
  description?: string | null;
  place_query?: string | null;
  requires_auth?: boolean;
}

export const PROVIDER_LABELS: Record<ExternalProvider, string> = {
  familysearch: "FamilySearch",
  niag: "НИАГ",
  other: "Источник",
};

/** Public read: combine feature-scoped + uezd-scoped matches. */
export async function fetchSourcesForFeature(
  featureId: number | null,
  uezdRu: string | null,
  uezdEn: string | null,
): Promise<ExternalSource[]> {
  const orParts: string[] = [];
  if (featureId != null) orParts.push(`feature_id.eq.${featureId}`);
  if (uezdRu) orParts.push(`uezd_ru.ilike.${uezdRu.replace(/[,()]/g, " ")}`);
  if (uezdEn) orParts.push(`uezd_en.ilike.${uezdEn.replace(/[,()]/g, " ")}`);
  if (orParts.length === 0) return [];
  const { data, error } = await supabase
    .from("external_sources")
    .select("*")
    .or(orParts.join(","))
    .order("provider", { ascending: true })
    .order("title", { ascending: true });
  if (error) {
    console.error("fetchSourcesForFeature", error);
    return [];
  }
  return (data as ExternalSource[]) || [];
}

/** Admin: list everything. */
export async function fetchAllSources(): Promise<ExternalSource[]> {
  const { data, error } = await supabase
    .from("external_sources")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data as ExternalSource[]) || [];
}

export async function createSource(input: ExternalSourceInput): Promise<void> {
  const payload = {
    provider: input.provider,
    scope: input.scope,
    feature_id: input.scope === "feature" ? input.feature_id ?? null : null,
    uezd_ru: input.scope === "uezd" ? input.uezd_ru ?? null : null,
    uezd_en: input.scope === "uezd" ? input.uezd_en ?? null : null,
    url: input.url.trim(),
    title: input.title.trim(),
    description: input.description?.trim() || null,
    place_query: input.place_query?.trim() || null,
    requires_auth: input.requires_auth ?? true,
  };
  const { error } = await supabase.from("external_sources").insert(payload);
  if (error) throw error;
}

export async function updateSource(
  id: string,
  patch: Partial<ExternalSourceInput>,
): Promise<void> {
  const { error } = await supabase
    .from("external_sources")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSource(id: string): Promise<void> {
  const { error } = await supabase.from("external_sources").delete().eq("id", id);
  if (error) throw error;
}

/** Build a FamilySearch catalog search URL for a place name. */
export function familySearchSearchUrl(place: string): string {
  const q = encodeURIComponent(place);
  return `https://www.familysearch.org/search/catalog/results?q.place=${q}`;
}
