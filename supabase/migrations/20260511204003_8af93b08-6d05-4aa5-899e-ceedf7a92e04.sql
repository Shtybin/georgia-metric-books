CREATE TABLE public.problem_report_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.problem_reports(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid,
  old_status report_status,
  new_status report_status NOT NULL,
  note text
);

CREATE INDEX idx_prh_report_id ON public.problem_report_history(report_id, changed_at DESC);

ALTER TABLE public.problem_report_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read history"
ON public.problem_report_history FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert history"
ON public.problem_report_history FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete history"
ON public.problem_report_history FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger: log status changes (and initial creation)
CREATE OR REPLACE FUNCTION public.log_problem_report_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.problem_report_history (report_id, changed_by, old_status, new_status, note)
    VALUES (NEW.id, NEW.reviewed_by, NULL, NEW.status, NULL);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.problem_report_history (report_id, changed_by, old_status, new_status, note)
    VALUES (NEW.id, NEW.reviewed_by, OLD.status, NEW.status, NEW.admin_notes);
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_problem_report_status_change
AFTER INSERT OR UPDATE OF status ON public.problem_reports
FOR EACH ROW EXECUTE FUNCTION public.log_problem_report_status_change();