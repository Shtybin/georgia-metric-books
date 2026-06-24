-- 1) Cap JSONB payload size in missing_years_suggestions
ALTER TABLE public.missing_years_suggestions
  DROP CONSTRAINT IF EXISTS settlement_snapshot_len_max;
ALTER TABLE public.missing_years_suggestions
  ADD CONSTRAINT settlement_snapshot_len_max
    CHECK (settlement_snapshot IS NULL OR pg_column_size(settlement_snapshot) <= 8192);

-- 2) Harden has_min_role: forbid arbitrary cross-user lookups.
CREATE OR REPLACE FUNCTION public.has_min_role(_user_id uuid, _min_role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND (
        -- Only the caller (about themself) or an admin may probe.
        _user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.user_roles a
          WHERE a.user_id = auth.uid() AND a.role = 'admin'
        )
      )
      AND (
        ur.role = 'admin'
        OR (_min_role = 'editor'      AND ur.role IN ('editor'))
        OR (_min_role = 'contributor' AND ur.role IN ('editor','contributor'))
      )
  )
$function$;

-- 3) Defense-in-depth: strip unused table grants for anon.
REVOKE ALL ON public.user_invitations FROM anon;
REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.missing_years_suggestions FROM anon;
REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.problem_reports FROM anon;
-- anon retains INSERT on the two submission tables, gated by their RLS
-- WITH CHECK policies (status='pending' / status='new').

-- 4) Treat invitation token_hash as secret: only SECURITY DEFINER function
--    public.accept_invitation needs to read it (it runs as table owner).
--    Admin UI lists invitations via supabaseAdmin (service_role), which is
--    unaffected by column-level grants.
REVOKE SELECT (token_hash) ON public.user_invitations FROM authenticated;
COMMENT ON COLUMN public.user_invitations.token_hash IS
  'SHA-256 of the invitation token. Write-only for the app: read access is restricted to service_role and to the SECURITY DEFINER accept_invitation function.';

-- 5) Mark problem_reports.contact as sensitive (RLS already restricts SELECT
--    to admin/editor roles; this comment makes the intent explicit).
COMMENT ON COLUMN public.problem_reports.contact IS
  'Sensitive: reporter-supplied contact info (email/handle). SELECT gated by admin/editor RLS only; never expose to anon or generic authenticated reads.';
