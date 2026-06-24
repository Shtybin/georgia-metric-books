ALTER TABLE public.ai_audit_runs
  ADD COLUMN IF NOT EXISTS agent_progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS watchdog_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.ai_audit_runs.agent_progress IS 'Per-agent counters: {coordinator,geo,metrics,archive,reviewer:{done,failed,lastError}}';
COMMENT ON COLUMN public.ai_audit_runs.watchdog_state IS 'Watchdog: {lastTickAt, stallCount, autoRestartCount}';
COMMENT ON COLUMN public.ai_audit_runs.heartbeat_at IS 'Updated each batch tick; used by watchdog to detect stalls';