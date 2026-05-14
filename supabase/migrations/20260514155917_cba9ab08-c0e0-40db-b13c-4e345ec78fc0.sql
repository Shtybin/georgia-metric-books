CREATE TYPE public.missing_years_suggestion_status AS ENUM ('pending','approved','rejected');

CREATE TABLE public.missing_years_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id integer,
  settlement_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_missing text NOT NULL DEFAULT '',
  proposed_missing text NOT NULL DEFAULT '',
  note text,
  status public.missing_years_suggestion_status NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT proposed_missing_len CHECK (char_length(proposed_missing) <= 2000),
  CONSTRAINT current_missing_len CHECK (char_length(current_missing) <= 2000),
  CONSTRAINT note_len CHECK (note IS NULL OR char_length(note) <= 2000)
);

ALTER TABLE public.missing_years_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit missing-years suggestions"
  ON public.missing_years_suggestions FOR INSERT
  TO anon, authenticated
  WITH CHECK (status = 'pending');

CREATE POLICY "Admins can read missing-years suggestions"
  ON public.missing_years_suggestions FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update missing-years suggestions"
  ON public.missing_years_suggestions FOR UPDATE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete missing-years suggestions"
  ON public.missing_years_suggestions FOR DELETE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_missing_years_suggestions_updated_at
  BEFORE UPDATE ON public.missing_years_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX missing_years_suggestions_status_idx ON public.missing_years_suggestions (status, created_at DESC);
CREATE INDEX missing_years_suggestions_feature_idx ON public.missing_years_suggestions (feature_id);