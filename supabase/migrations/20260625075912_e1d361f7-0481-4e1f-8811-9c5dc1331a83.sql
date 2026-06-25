-- Auto-approve all remaining pending/approved findings for this run
UPDATE public.ai_audit_findings
   SET status = 'applied',
       review_note = COALESCE(review_note,'') || ' [auto-approved after watchdog restore]',
       reviewed_at = now()
 WHERE run_id = '32682f71-7959-47b5-8d68-a38d5d594a6f'
   AND status IN ('pending','approved');

-- Resume the run from the same point
UPDATE public.ai_audit_runs
   SET status = 'running',
       paused_at = NULL,
       finished_at = NULL,
       heartbeat_at = now(),
       updated_at = now(),
       watchdog_state = jsonb_build_object(
         'lastTickAt', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'stallCount', 0,
         'autoRestartCount', 0
       )
 WHERE id = '32682f71-7959-47b5-8d68-a38d5d594a6f';
