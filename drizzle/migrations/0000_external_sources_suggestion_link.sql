ALTER TABLE public.external_sources ADD COLUMN IF NOT EXISTS suggestion_id uuid;
CREATE INDEX IF NOT EXISTS external_sources_suggestion_idx ON public.external_sources(suggestion_id);
ALTER TABLE public.external_sources DROP CONSTRAINT external_sources_check;
ALTER TABLE public.external_sources ADD CONSTRAINT external_sources_check CHECK (((scope = 'feature') AND (feature_id IS NOT NULL OR suggestion_id IS NOT NULL)) OR ((scope = 'uezd') AND (uezd_ru IS NOT NULL OR uezd_en IS NOT NULL)));