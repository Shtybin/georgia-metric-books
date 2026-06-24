
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.pdf_text_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_name TEXT NOT NULL,
  decade_start INTEGER NOT NULL,
  decade_end INTEGER NOT NULL,
  page_from INTEGER,
  page_to INTEGER,
  content TEXT NOT NULL,
  storage_path TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pdf_text_chunks_decade_idx ON public.pdf_text_chunks(decade_start, decade_end);
CREATE INDEX IF NOT EXISTS pdf_text_chunks_source_idx ON public.pdf_text_chunks(source_name);
CREATE INDEX IF NOT EXISTS pdf_text_chunks_content_trgm_idx ON public.pdf_text_chunks USING gin (content gin_trgm_ops);

GRANT SELECT ON public.pdf_text_chunks TO authenticated;
GRANT ALL ON public.pdf_text_chunks TO service_role;

ALTER TABLE public.pdf_text_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Editors+ can read pdf chunks"
ON public.pdf_text_chunks FOR SELECT TO authenticated
USING (public.has_min_role(auth.uid(), 'editor'::app_role));

CREATE POLICY "Admins can manage pdf chunks"
ON public.pdf_text_chunks FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Editors+ can read metric-book pdfs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'metric-book-pdfs' AND public.has_min_role(auth.uid(), 'editor'::app_role));

CREATE POLICY "Admins can upload metric-book pdfs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'metric-book-pdfs' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update metric-book pdfs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'metric-book-pdfs' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete metric-book pdfs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'metric-book-pdfs' AND public.has_role(auth.uid(), 'admin'::app_role));
