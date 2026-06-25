
-- Drop the public RLS policy that exposed all columns (incl. created_by/reviewed_by)
DROP POLICY IF EXISTS "Anyone can read approved verifications" ON public.tbilisi_coord_verifications;

-- Safe-column public view (security_invoker honors caller's RLS via base table policies)
CREATE OR REPLACE VIEW public.tbilisi_coord_verifications_public
WITH (security_invoker = true, security_barrier = true) AS
SELECT
  id,
  church_id,
  old_lat,
  old_lon,
  new_lat,
  new_lon,
  distance_m,
  model_confidence,
  reasoning,
  sources,
  osm_candidates,
  status,
  created_at,
  updated_at
FROM public.tbilisi_coord_verifications
WHERE status = 'approved'::tbilisi_coord_verif_status;

GRANT SELECT ON public.tbilisi_coord_verifications_public TO anon, authenticated;

-- Restore public read access scoped to the safe view by re-granting a row policy
-- limited to the same approved rows (the view uses security_invoker, so we need a
-- USING policy that lets anon/authenticated read approved rows but does NOT expose
-- sensitive columns at the application layer). The view projection achieves that.
CREATE POLICY "Public can read approved via view"
  ON public.tbilisi_coord_verifications
  FOR SELECT
  TO anon, authenticated
  USING (status = 'approved'::tbilisi_coord_verif_status);

-- Revoke direct column access to the sensitive admin UUID columns from public roles,
-- so even a direct table query cannot leak them. Admins/editors are checked via
-- has_role() inside SECURITY DEFINER functions / server functions using the
-- service-role client, which bypasses column grants.
REVOKE SELECT (created_by, reviewed_by, reviewed_at) ON public.tbilisi_coord_verifications FROM anon, authenticated;
