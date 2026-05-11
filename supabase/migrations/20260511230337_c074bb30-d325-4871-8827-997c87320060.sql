CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$function$;

REVOKE ALL ON FUNCTION private.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, app_role) TO authenticated;

ALTER POLICY "Admins can delete"
ON public.coord_suggestions
USING (private.has_role(auth.uid(), 'admin'::app_role));

ALTER POLICY "Admins can read all"
ON public.coord_suggestions
USING (private.has_role(auth.uid(), 'admin'::app_role));

ALTER POLICY "Admins can update"
ON public.coord_suggestions
USING (private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

ALTER POLICY "Admins can delete history"
ON public.problem_report_history
USING (private.has_role(auth.uid(), 'admin'::app_role));

ALTER POLICY "Admins can insert history"
ON public.problem_report_history
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

ALTER POLICY "Admins can read history"
ON public.problem_report_history
USING (private.has_role(auth.uid(), 'admin'::app_role));

ALTER POLICY "Admins can delete problem reports"
ON public.problem_reports
USING (private.has_role(auth.uid(), 'admin'::app_role));

ALTER POLICY "Admins can read all problem reports"
ON public.problem_reports
USING (private.has_role(auth.uid(), 'admin'::app_role));

ALTER POLICY "Admins can update problem reports"
ON public.problem_reports
USING (private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

ALTER POLICY "Admins can manage roles"
ON public.user_roles
USING (private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

ALTER POLICY "Admins can view roles"
ON public.user_roles
USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$function$;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
