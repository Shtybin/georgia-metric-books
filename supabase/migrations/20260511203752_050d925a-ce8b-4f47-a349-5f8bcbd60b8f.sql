ALTER TABLE public.problem_reports
  ADD COLUMN lat double precision,
  ADD COLUMN lon double precision,
  ADD COLUMN zoom real;

-- Update insert policy to enforce sane ranges when provided
DROP POLICY IF EXISTS "Anyone can submit problem reports" ON public.problem_reports;
CREATE POLICY "Anyone can submit problem reports"
ON public.problem_reports
FOR INSERT
TO anon, authenticated
WITH CHECK (
  status = 'new'::report_status
  AND length(message) BETWEEN 1 AND 4000
  AND (contact IS NULL OR length(contact) <= 200)
  AND (page_url IS NULL OR length(page_url) <= 500)
  AND (lang IS NULL OR length(lang) <= 8)
  AND (user_agent IS NULL OR length(user_agent) <= 500)
  AND (lat IS NULL OR (lat >= -90 AND lat <= 90))
  AND (lon IS NULL OR (lon >= -180 AND lon <= 180))
  AND (zoom IS NULL OR (zoom >= 0 AND zoom <= 24))
);