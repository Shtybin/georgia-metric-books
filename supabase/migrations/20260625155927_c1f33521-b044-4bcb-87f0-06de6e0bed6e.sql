-- Remove 16 false "approved" findings caused by AI gateway 524 timeouts so the
-- affected features can be re-audited from scratch by the next orchestrator run.
DELETE FROM public.ai_audit_findings
WHERE status = 'approved'
  AND kind = 'other'
  AND severity = 'error'
  AND rationale LIKE 'Ошибка вызова AI:%';