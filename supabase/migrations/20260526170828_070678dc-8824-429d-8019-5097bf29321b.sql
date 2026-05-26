
CREATE TYPE public.tbilisi_coord_verif_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.tbilisi_coord_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id integer NOT NULL UNIQUE,
  old_lat double precision NOT NULL,
  old_lon double precision NOT NULL,
  new_lat double precision NOT NULL,
  new_lon double precision NOT NULL,
  distance_m double precision NOT NULL DEFAULT 0,
  model_confidence numeric(3,2) NOT NULL DEFAULT 0,
  reasoning text NOT NULL DEFAULT '',
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  osm_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  status public.tbilisi_coord_verif_status NOT NULL DEFAULT 'pending',
  created_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tbilisi_coord_verifications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tbilisi_coord_verifications TO authenticated;
GRANT ALL ON public.tbilisi_coord_verifications TO service_role;

ALTER TABLE public.tbilisi_coord_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read approved verifications"
  ON public.tbilisi_coord_verifications FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

CREATE POLICY "Admins can read all verifications"
  ON public.tbilisi_coord_verifications FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert verifications"
  ON public.tbilisi_coord_verifications FOR INSERT
  TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update verifications"
  ON public.tbilisi_coord_verifications FOR UPDATE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete verifications"
  ON public.tbilisi_coord_verifications FOR DELETE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_tbilisi_coord_verifications_updated_at
  BEFORE UPDATE ON public.tbilisi_coord_verifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_tbilisi_coord_verifications_status ON public.tbilisi_coord_verifications (status);
