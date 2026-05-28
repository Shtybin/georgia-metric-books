
-- Helper: проверка минимального уровня роли (admin > editor > contributor)
CREATE OR REPLACE FUNCTION public.has_min_role(_user_id uuid, _min_role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = 'admin'
        OR (_min_role = 'editor' AND role IN ('editor'))
        OR (_min_role = 'contributor' AND role IN ('editor','contributor'))
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.has_min_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_min_role(uuid, app_role) TO authenticated, service_role;

-- ===== Таблица приглашений =====
CREATE TABLE IF NOT EXISTS public.user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role app_role NOT NULL,
  token_hash text NOT NULL UNIQUE,
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid
);

CREATE INDEX IF NOT EXISTS user_invitations_email_idx ON public.user_invitations (lower(email));
CREATE INDEX IF NOT EXISTS user_invitations_token_idx ON public.user_invitations (token_hash);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_invitations TO authenticated;
GRANT ALL ON public.user_invitations TO service_role;

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read invitations" ON public.user_invitations
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert invitations" ON public.user_invitations
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update invitations" ON public.user_invitations
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete invitations" ON public.user_invitations
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

-- ===== RPC: принятие приглашения =====
-- Вызывается уже аутентифицированным пользователем после установки пароля.
-- Атомарно: проверяет токен, создаёт user_roles запись, помечает приглашение принятым.
CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid;
  _email text;
  _inv record;
  _hash text;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  IF _email IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  _hash := encode(digest(_token, 'sha256'), 'hex');

  SELECT * INTO _inv FROM public.user_invitations
   WHERE token_hash = _hash
     AND accepted_at IS NULL
     AND expires_at > now()
     AND lower(email) = lower(_email)
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation invalid, expired, or email mismatch';
  END IF;

  -- Назначить роль (если уже есть — игнорируем)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, _inv.role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.user_invitations
     SET accepted_at = now(), accepted_by = _uid
   WHERE id = _inv.id;

  RETURN jsonb_build_object('ok', true, 'role', _inv.role);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;

-- pgcrypto для digest()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===== Добавляем editor-доступ к таблицам редактирования карты =====
-- editor получает те же права что admin на работу с данными (без управления пользователями).

-- feature_overrides
CREATE POLICY "Editors can read all overrides" ON public.feature_overrides
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Editors can insert overrides" ON public.feature_overrides
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Editors can update overrides" ON public.feature_overrides
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'editor'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Editors can delete overrides" ON public.feature_overrides
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'editor'::app_role));

-- coord_suggestions
CREATE POLICY "Editors can read all suggestions" ON public.coord_suggestions
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Editors can update suggestions" ON public.coord_suggestions
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'editor'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Editors can delete suggestions" ON public.coord_suggestions
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'editor'::app_role));

-- tbilisi_coord_verifications
CREATE POLICY "Editors can read all verifications" ON public.tbilisi_coord_verifications
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Editors can insert verifications" ON public.tbilisi_coord_verifications
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Editors can update verifications" ON public.tbilisi_coord_verifications
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'editor'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Editors can delete verifications" ON public.tbilisi_coord_verifications
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'editor'::app_role));

-- external_sources (editor: full; contributor: только INSERT)
CREATE POLICY "Editors can insert external sources" ON public.external_sources
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Editors can update external sources" ON public.external_sources
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'editor'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Editors can delete external sources" ON public.external_sources
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Contributors can insert external sources" ON public.external_sources
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'contributor'::app_role));

-- missing_years_suggestions
CREATE POLICY "Editors can read missing-years" ON public.missing_years_suggestions
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Editors can update missing-years" ON public.missing_years_suggestions
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'editor'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Editors can delete missing-years" ON public.missing_years_suggestions
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'editor'::app_role));

-- uezd_corrections
CREATE POLICY "Editors can read uezd corrections" ON public.uezd_corrections
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Editors can insert uezd corrections" ON public.uezd_corrections
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Editors can update uezd corrections" ON public.uezd_corrections
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'editor'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Editors can delete uezd corrections" ON public.uezd_corrections
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'editor'::app_role));

-- problem_reports
CREATE POLICY "Editors can read problem reports" ON public.problem_reports
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Editors can update problem reports" ON public.problem_reports
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'editor'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Editors can delete problem reports" ON public.problem_reports
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'editor'::app_role));

-- problem_report_history
CREATE POLICY "Editors can read history" ON public.problem_report_history
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Editors can insert history" ON public.problem_report_history
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'editor'::app_role));

-- feature_override_history
CREATE POLICY "Editors can read override history" ON public.feature_override_history
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'editor'::app_role));

-- guide_content
CREATE POLICY "Editors can insert guide" ON public.guide_content
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Editors can update guide" ON public.guide_content
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'editor'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'editor'::app_role));
