-- 1. Length CHECK constraints on coord_suggestions to prevent abuse via oversized inserts
ALTER TABLE public.coord_suggestions
  ADD CONSTRAINT settlement_ru_len   CHECK (char_length(settlement_ru)   <= 500),
  ADD CONSTRAINT settlement_en_len   CHECK (char_length(settlement_en)   <= 500),
  ADD CONSTRAINT uezd_ru_len         CHECK (char_length(uezd_ru)         <= 300),
  ADD CONSTRAINT uezd_en_len         CHECK (char_length(uezd_en)         <= 300),
  ADD CONSTRAINT region_ru_len       CHECK (char_length(region_ru)       <= 300),
  ADD CONSTRAINT region_en_len       CHECK (char_length(region_en)       <= 300),
  ADD CONSTRAINT church_ru_len       CHECK (char_length(church_ru)       <= 300),
  ADD CONSTRAINT church_en_len       CHECK (char_length(church_en)       <= 300),
  ADD CONSTRAINT years_len           CHECK (char_length(years)           <= 500),
  ADD CONSTRAINT notes_len           CHECK (notes IS NULL OR char_length(notes) <= 2000),
  ADD CONSTRAINT submitter_note_len  CHECK (submitter_note IS NULL OR char_length(submitter_note) <= 2000);

-- 2. Lock down SECURITY DEFINER functions: trigger helpers don't need EXECUTE
--    granted to public roles (triggers fire regardless of caller EXECUTE).
REVOKE EXECUTE ON FUNCTION public.log_problem_report_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_feature_override_change()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()         FROM PUBLIC, anon, authenticated;

-- 3. rollback_feature_override has an internal admin check, but we still
--    block anon from invoking it. authenticated keeps EXECUTE so admins
--    can call it; non-admins are rejected inside the function.
REVOKE EXECUTE ON FUNCTION public.rollback_feature_override(uuid) FROM PUBLIC, anon;
