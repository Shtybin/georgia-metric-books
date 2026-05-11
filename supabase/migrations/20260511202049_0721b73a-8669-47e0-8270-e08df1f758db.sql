CREATE TYPE public.report_status AS ENUM ('new', 'in_progress', 'resolved');

CREATE TABLE public.problem_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  message text NOT NULL,
  contact text,
  page_url text,
  lang text,
  user_agent text,
  status public.report_status NOT NULL DEFAULT 'new',
  reviewed_at timestamptz,
  reviewed_by uuid,
  admin_notes text
);

ALTER TABLE public.problem_reports ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. unauthenticated) can submit a new report, but only with status='new' and bounded length.
CREATE POLICY "Anyone can submit problem reports"
ON public.problem_reports
FOR INSERT
TO anon, authenticated
WITH CHECK (
  status = 'new'
  AND length(message) BETWEEN 1 AND 4000
  AND (contact IS NULL OR length(contact) <= 200)
  AND (page_url IS NULL OR length(page_url) <= 500)
  AND (lang IS NULL OR length(lang) <= 8)
  AND (user_agent IS NULL OR length(user_agent) <= 500)
);

-- Only admins can read / update / delete.
CREATE POLICY "Admins can read all problem reports"
ON public.problem_reports
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update problem reports"
ON public.problem_reports
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete problem reports"
ON public.problem_reports
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX problem_reports_status_created_idx
ON public.problem_reports (status, created_at DESC);