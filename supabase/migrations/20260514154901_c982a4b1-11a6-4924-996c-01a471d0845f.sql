CREATE TABLE public.guide_content (
  lang text NOT NULL PRIMARY KEY CHECK (lang IN ('ru','en','ka')),
  content text NOT NULL DEFAULT '',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.guide_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read guide"
  ON public.guide_content FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can insert guide"
  ON public.guide_content FOR INSERT
  TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update guide"
  ON public.guide_content FOR UPDATE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete guide"
  ON public.guide_content FOR DELETE
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_guide_content_updated_at
  BEFORE UPDATE ON public.guide_content
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();