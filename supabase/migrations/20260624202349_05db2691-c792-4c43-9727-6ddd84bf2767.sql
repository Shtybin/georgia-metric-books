
-- 1) private.has_min_role mirror (SECURITY DEFINER, runs as owner; bypasses caller RLS on user_roles)
CREATE OR REPLACE FUNCTION private.has_min_role(_user_id uuid, _min_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND (
        ur.role = 'admin'
        OR (_min_role = 'editor'      AND ur.role IN ('editor'))
        OR (_min_role = 'contributor' AND ur.role IN ('editor','contributor'))
      )
  )
$$;
REVOKE EXECUTE ON FUNCTION private.has_min_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;

-- 2) Recreate pdf_text_chunks policies using private.has_role / private.has_min_role
DROP POLICY IF EXISTS "Admins can manage pdf chunks" ON public.pdf_text_chunks;
DROP POLICY IF EXISTS "Editors+ can read pdf chunks" ON public.pdf_text_chunks;

CREATE POLICY "Admins can manage pdf chunks"
ON public.pdf_text_chunks
FOR ALL
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Editors+ can read pdf chunks"
ON public.pdf_text_chunks
FOR SELECT
TO authenticated
USING (private.has_min_role(auth.uid(), 'editor'::public.app_role));

-- 3) Recreate storage policies for metric-book-pdfs using private.* helpers
DROP POLICY IF EXISTS "Admins can delete metric-book pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update metric-book pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Editors+ can read metric-book pdfs" ON storage.objects;

CREATE POLICY "Admins can delete metric-book pdfs"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'metric-book-pdfs' AND private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update metric-book pdfs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'metric-book-pdfs' AND private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id = 'metric-book-pdfs' AND private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Editors+ can read metric-book pdfs"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'metric-book-pdfs' AND private.has_min_role(auth.uid(), 'editor'::public.app_role));

-- Insert policy for admins to upload (preserve existing capability if there was one; add a baseline)
DROP POLICY IF EXISTS "Admins can insert metric-book pdfs" ON storage.objects;
CREATE POLICY "Admins can insert metric-book pdfs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'metric-book-pdfs' AND private.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) Cap settlement_snapshot payload on missing_years_suggestions to prevent storage abuse
ALTER TABLE public.missing_years_suggestions
  DROP CONSTRAINT IF EXISTS missing_years_suggestions_snapshot_size_chk;
ALTER TABLE public.missing_years_suggestions
  ADD CONSTRAINT missing_years_suggestions_snapshot_size_chk
  CHECK (settlement_snapshot IS NULL OR pg_column_size(settlement_snapshot) <= 10000);

-- 5) Remove EXECUTE on SECURITY DEFINER functions from `authenticated`.
--    These are now invoked only via server-side createServerFn handlers that
--    use the service-role client (postgres owns/has EXECUTE).
REVOKE EXECUTE ON FUNCTION public.accept_invitation(text)         FROM authenticated, PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rollback_feature_override(uuid) FROM authenticated, PUBLIC, anon;
