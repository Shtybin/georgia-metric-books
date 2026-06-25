-- AI Orchestration — Phase 3: geolocation task
-- 1) Distinguish run types (audit vs geolocate) on ai_audit_runs
ALTER TABLE public.ai_audit_runs
  ADD COLUMN IF NOT EXISTS task_kind text NOT NULL DEFAULT 'audit';

ALTER TABLE public.ai_audit_runs
  DROP CONSTRAINT IF EXISTS ai_audit_runs_task_kind_chk;
ALTER TABLE public.ai_audit_runs
  ADD CONSTRAINT ai_audit_runs_task_kind_chk
  CHECK (task_kind IN ('audit','geolocate'));

CREATE INDEX IF NOT EXISTS ai_audit_runs_task_kind_idx
  ON public.ai_audit_runs (task_kind, started_at DESC);

-- 2) Extend finding kind enum with 'geolocate' (kind column already jsonb-typed via enum)
ALTER TYPE public.ai_audit_finding_kind ADD VALUE IF NOT EXISTS 'geolocate';

-- 3) Track which channel created a coord suggestion
ALTER TABLE public.coord_suggestions
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual';

ALTER TABLE public.coord_suggestions
  DROP CONSTRAINT IF EXISTS coord_suggestions_origin_chk;
ALTER TABLE public.coord_suggestions
  ADD CONSTRAINT coord_suggestions_origin_chk
  CHECK (origin IN ('manual','ai-geocoder','ai-orchestration'));

CREATE INDEX IF NOT EXISTS coord_suggestions_origin_idx
  ON public.coord_suggestions (origin, status);