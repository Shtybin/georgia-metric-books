CREATE TABLE public.external_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider text NOT NULL DEFAULT 'familysearch',
  scope text NOT NULL CHECK (scope IN ('feature','uezd')),
  feature_id integer,
  uezd_ru text,
  uezd_en text,
  url text NOT NULL,
  title text NOT NULL DEFAULT '',
  description text,
  place_query text,
  requires_auth boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (scope = 'feature' AND feature_id IS NOT NULL) OR
    (scope = 'uezd' AND (uezd_ru IS NOT NULL OR uezd_en IS NOT NULL))
  )
);

CREATE INDEX idx_external_sources_feature ON public.external_sources(feature_id) WHERE feature_id IS NOT NULL;
CREATE INDEX idx_external_sources_uezd_ru ON public.external_sources(lower(uezd_ru)) WHERE uezd_ru IS NOT NULL;
CREATE INDEX idx_external_sources_uezd_en ON public.external_sources(lower(uezd_en)) WHERE uezd_en IS NOT NULL;

ALTER TABLE public.external_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read external sources"
ON public.external_sources FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Admins can insert external sources"
ON public.external_sources FOR INSERT
TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update external sources"
ON public.external_sources FOR UPDATE
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete external sources"
ON public.external_sources FOR DELETE
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_external_sources_updated_at
BEFORE UPDATE ON public.external_sources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();