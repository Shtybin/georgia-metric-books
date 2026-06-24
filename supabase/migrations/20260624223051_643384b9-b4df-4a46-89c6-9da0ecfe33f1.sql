
DO $$
DECLARE r_id uuid := '32682f71-7959-47b5-8d68-a38d5d594a6f';
BEGIN
  INSERT INTO public.missing_years_suggestions
    (feature_id, current_missing, proposed_missing, settlement_snapshot, note, created_by)
  SELECT feature_id,
         COALESCE(current->>'missingRaw',''),
         COALESCE(proposed->>'missingRaw',''),
         CASE WHEN pg_column_size(current) <= 10000 THEN current ELSE '{}'::jsonb END,
         left('AI-аудит (auto-approve cancelled run): '||COALESCE(rationale,''),1000),
         NULL
  FROM public.ai_audit_findings
  WHERE run_id=r_id AND status='pending' AND kind='missing_years'
    AND feature_id IS NOT NULL AND proposed ? 'missingRaw';

  INSERT INTO public.uezd_corrections
    (feature_id, current_uezd, proposed_uezd, settlement_snapshot, region_snapshot, note, created_by)
  SELECT feature_id, current, proposed, '{}'::jsonb, '{}'::jsonb,
         left('AI-аудит (auto-approve cancelled run): '||COALESCE(rationale,''),1000), NULL
  FROM public.ai_audit_findings
  WHERE run_id=r_id AND status='pending' AND kind='uezd' AND feature_id IS NOT NULL;

  INSERT INTO public.feature_overrides (feature_id, action, data, published, notes, created_by)
  SELECT feature_id, 'patch',
         jsonb_build_object('ai_audit', jsonb_build_object('kind', kind, 'proposed', proposed)),
         false,
         left('AI-аудит #'||substring(id::text,1,8)||' '||kind||': '||COALESCE(rationale,''),1000),
         NULL
  FROM public.ai_audit_findings
  WHERE run_id=r_id AND status='pending'
    AND kind IN ('settlement','church','years') AND feature_id IS NOT NULL;

  UPDATE public.ai_audit_findings
     SET status='applied',
         review_note=COALESCE(review_note,'')||' [auto-approved after cancelled run resume]',
         reviewed_at=now()
   WHERE run_id=r_id AND status='pending';

  UPDATE public.ai_audit_runs
     SET status='running',
         paused_at=NULL,
         finished_at=NULL,
         heartbeat_at=now(),
         updated_at=now(),
         watchdog_state = jsonb_set(
            jsonb_set(COALESCE(watchdog_state,'{}'::jsonb), '{stallCount}', '0'::jsonb),
            '{lastTickAt}', to_jsonb(now()))
   WHERE id=r_id;
END $$;
