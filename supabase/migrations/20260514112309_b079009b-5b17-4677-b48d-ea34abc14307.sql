
-- Status enum for uezd correction suggestions
DO $$ BEGIN
  CREATE TYPE public.uezd_correction_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.uezd_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id integer,
  settlement_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  region_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_uezd jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_uezd jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  status public.uezd_correction_status NOT NULL DEFAULT 'pending',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uezd_corrections_status ON public.uezd_corrections(status);
CREATE INDEX IF NOT EXISTS idx_uezd_corrections_feature ON public.uezd_corrections(feature_id);

ALTER TABLE public.uezd_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read uezd corrections"
  ON public.uezd_corrections FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert uezd corrections"
  ON public.uezd_corrections FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update uezd corrections"
  ON public.uezd_corrections FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete uezd corrections"
  ON public.uezd_corrections FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_uezd_corrections_updated_at
  BEFORE UPDATE ON public.uezd_corrections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
