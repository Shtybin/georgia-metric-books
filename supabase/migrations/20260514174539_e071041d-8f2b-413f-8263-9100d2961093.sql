-- Lock in EXECUTE privileges for SECURITY DEFINER functions (defense in depth).
-- These REVOKEs are idempotent and assert the intended access model:
--   * anon and PUBLIC must never execute SECURITY DEFINER functions
--   * trigger functions are only invoked by Postgres internally
--   * rollback_feature_override is callable by authenticated (it self-checks admin role)
--   * has_role helpers are callable by authenticated only

REVOKE EXECUTE ON FUNCTION public.log_problem_report_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_feature_override_change()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()         FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.rollback_feature_override(uuid)    FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rollback_feature_override(uuid)    TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role)           FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, app_role)           TO authenticated;

REVOKE EXECUTE ON FUNCTION private.has_role(uuid, app_role)          FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION private.has_role(uuid, app_role)          TO authenticated;