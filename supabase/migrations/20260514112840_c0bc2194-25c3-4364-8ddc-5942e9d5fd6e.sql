
CREATE TABLE IF NOT EXISTS public.feature_override_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  override_id uuid NOT NULL,
  feature_id integer,
  op text NOT NULL CHECK (op IN ('insert','update','delete')),
  action text,
  data jsonb,
  published boolean,
  notes text,
  prev_action text,
  prev_data jsonb,
  prev_published boolean,
  prev_notes text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_override_history_override
  ON public.feature_override_history(override_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_feature_override_history_feature
  ON public.feature_override_history(feature_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_feature_override_history_changed_at
  ON public.feature_override_history(changed_at DESC);

ALTER TABLE public.feature_override_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read override history"
  ON public.feature_override_history FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete override history"
  ON public.feature_override_history FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

-- Trigger function: SECURITY DEFINER so it can write regardless of caller's RLS
CREATE OR REPLACE FUNCTION public.log_feature_override_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.feature_override_history
      (override_id, feature_id, op, action, data, published, notes, changed_by)
    VALUES
      (NEW.id, NEW.feature_id, 'insert', NEW.action, NEW.data, NEW.published, NEW.notes, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.feature_override_history
      (override_id, feature_id, op, action, data, published, notes,
       prev_action, prev_data, prev_published, prev_notes, changed_by)
    VALUES
      (NEW.id, NEW.feature_id, 'update', NEW.action, NEW.data, NEW.published, NEW.notes,
       OLD.action, OLD.data, OLD.published, OLD.notes, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.feature_override_history
      (override_id, feature_id, op, action, data, published, notes, changed_by)
    VALUES
      (OLD.id, OLD.feature_id, 'delete', OLD.action, OLD.data, OLD.published, OLD.notes, auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS feature_overrides_audit ON public.feature_overrides;
CREATE TRIGGER feature_overrides_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.feature_overrides
  FOR EACH ROW EXECUTE FUNCTION public.log_feature_override_change();

-- Rollback: restore an override to the snapshot of the chosen history entry
CREATE OR REPLACE FUNCTION public.rollback_feature_override(_history_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h record;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO h FROM public.feature_override_history WHERE id = _history_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'History entry not found';
  END IF;

  IF h.action IS NULL THEN
    RAISE EXCEPTION 'History snapshot has no action recorded';
  END IF;

  INSERT INTO public.feature_overrides
    (id, feature_id, action, data, published, notes, created_by, created_at, updated_at)
  VALUES
    (h.override_id, h.feature_id, h.action, h.data, COALESCE(h.published, false), h.notes, auth.uid(), now(), now())
  ON CONFLICT (id) DO UPDATE
    SET feature_id = EXCLUDED.feature_id,
        action     = EXCLUDED.action,
        data       = EXCLUDED.data,
        published  = EXCLUDED.published,
        notes      = EXCLUDED.notes,
        updated_at = now();

  RETURN h.override_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_feature_override(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollback_feature_override(uuid) TO authenticated;
