-- Switch has_min_role to SECURITY INVOKER and rely on user_roles RLS
-- (user can see own roles; admins can see all roles).
CREATE OR REPLACE FUNCTION public.has_min_role(_user_id uuid, _min_role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND (
        ur.role = 'admin'
        OR (_min_role = 'editor'      AND ur.role IN ('editor'))
        OR (_min_role = 'contributor' AND ur.role IN ('editor','contributor'))
      )
  )
$$;

-- Lock execution down: only trusted server-side service_role calls it.
REVOKE EXECUTE ON FUNCTION public.has_min_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.has_min_role(uuid, app_role) TO service_role;