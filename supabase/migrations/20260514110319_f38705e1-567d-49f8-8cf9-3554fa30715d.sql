CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.feature_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id integer,
  action text NOT NULL CHECK (action IN ('edit','delete','add')),
  data jsonb,
  published boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feature_overrides_feature_id ON public.feature_overrides(feature_id);
CREATE INDEX idx_feature_overrides_published ON public.feature_overrides(published);

ALTER TABLE public.feature_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read published overrides"
  ON public.feature_overrides FOR SELECT
  TO anon, authenticated
  USING (published = true);

CREATE POLICY "Admins can read all overrides"
  ON public.feature_overrides FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert overrides"
  ON public.feature_overrides FOR INSERT
  TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update overrides"
  ON public.feature_overrides FOR UPDATE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete overrides"
  ON public.feature_overrides FOR DELETE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_feature_overrides_updated_at
  BEFORE UPDATE ON public.feature_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();