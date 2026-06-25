
-- 1) Remove public direct access on tbilisi_coord_verifications; rely on the public view that omits created_by/reviewed_by.
DROP POLICY IF EXISTS "Public can read approved via view" ON public.tbilisi_coord_verifications;

-- Ensure the safe view is readable publicly.
GRANT SELECT ON public.tbilisi_coord_verifications_public TO anon, authenticated;

-- 2) Bound anon JSONB payload size on missing_years_suggestions.
DROP POLICY IF EXISTS "Anyone can submit missing-years suggestions" ON public.missing_years_suggestions;
CREATE POLICY "Anyone can submit missing-years suggestions"
  ON public.missing_years_suggestions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'pending'::missing_years_suggestion_status
    AND pg_column_size(settlement_snapshot) <= 65536
  );
