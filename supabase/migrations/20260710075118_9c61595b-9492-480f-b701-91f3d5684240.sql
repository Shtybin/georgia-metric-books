
CREATE TABLE public.analytics_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event TEXT NOT NULL,
  path TEXT,
  lang TEXT,
  session_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX analytics_events_event_created_idx ON public.analytics_events (event, created_at DESC);
CREATE INDEX analytics_events_created_idx ON public.analytics_events (created_at DESC);
CREATE INDEX analytics_events_session_idx ON public.analytics_events (session_id);

GRANT INSERT ON public.analytics_events TO anon, authenticated;
GRANT ALL ON public.analytics_events TO service_role;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert analytics events"
  ON public.analytics_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(event) BETWEEN 1 AND 64
    AND (path IS NULL OR length(path) <= 256)
    AND (lang IS NULL OR length(lang) <= 8)
    AND (session_id IS NULL OR length(session_id) <= 64)
  );

CREATE POLICY "Admins can read analytics events"
  ON public.analytics_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
