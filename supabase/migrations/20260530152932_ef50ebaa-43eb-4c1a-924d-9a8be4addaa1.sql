
-- Enums
DO $$ BEGIN
  CREATE TYPE public.ai_audit_run_status AS ENUM ('running','paused','done','budget_exhausted','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_audit_finding_kind AS ENUM ('settlement','uezd','church','years','missing_years','duplicate','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_audit_finding_status AS ENUM ('pending','approved','rejected','applied');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_audit_severity AS ENUM ('info','warn','error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Runs
CREATE TABLE IF NOT EXISTS public.ai_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status public.ai_audit_run_status NOT NULL DEFAULT 'running',
  model text NOT NULL DEFAULT 'google/gemini-2.5-flash-lite',
  budget_usd numeric(10,4) NOT NULL DEFAULT 100,
  spent_usd numeric(10,6) NOT NULL DEFAULT 0,
  points_total integer NOT NULL DEFAULT 0,
  points_done integer NOT NULL DEFAULT 0,
  scope text NOT NULL DEFAULT 'all',
  notes text,
  created_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE, DELETE ON public.ai_audit_runs TO authenticated;
GRANT ALL ON public.ai_audit_runs TO service_role;

ALTER TABLE public.ai_audit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Editors can read audit runs" ON public.ai_audit_runs
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Admins can read audit runs" ON public.ai_audit_runs
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Editors can update audit runs" ON public.ai_audit_runs
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'editor'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Admins can update audit runs" ON public.ai_audit_runs
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete audit runs" ON public.ai_audit_runs
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER ai_audit_runs_set_updated
  BEFORE UPDATE ON public.ai_audit_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Findings
CREATE TABLE IF NOT EXISTS public.ai_audit_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.ai_audit_runs(id) ON DELETE CASCADE,
  feature_id integer,
  kind public.ai_audit_finding_kind NOT NULL,
  severity public.ai_audit_severity NOT NULL DEFAULT 'info',
  confidence numeric(4,3) NOT NULL DEFAULT 0,
  current jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed jsonb NOT NULL DEFAULT '{}'::jsonb,
  rationale text NOT NULL DEFAULT '',
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  status public.ai_audit_finding_status NOT NULL DEFAULT 'pending',
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_audit_findings_run_idx ON public.ai_audit_findings(run_id);
CREATE INDEX IF NOT EXISTS ai_audit_findings_feature_idx ON public.ai_audit_findings(feature_id);
CREATE INDEX IF NOT EXISTS ai_audit_findings_status_idx ON public.ai_audit_findings(status);

GRANT SELECT, UPDATE, DELETE ON public.ai_audit_findings TO authenticated;
GRANT ALL ON public.ai_audit_findings TO service_role;

ALTER TABLE public.ai_audit_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Editors can read findings" ON public.ai_audit_findings
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Admins can read findings" ON public.ai_audit_findings
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Editors can update findings" ON public.ai_audit_findings
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'editor'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Admins can update findings" ON public.ai_audit_findings
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete findings" ON public.ai_audit_findings
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER ai_audit_findings_set_updated
  BEFORE UPDATE ON public.ai_audit_findings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
