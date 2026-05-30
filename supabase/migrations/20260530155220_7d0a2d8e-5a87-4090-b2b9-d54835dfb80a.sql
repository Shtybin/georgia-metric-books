ALTER TABLE public.feature_overrides DROP CONSTRAINT IF EXISTS feature_overrides_action_check;
ALTER TABLE public.feature_overrides ADD CONSTRAINT feature_overrides_action_check
  CHECK (action IN ('edit','delete','add','patch','merge_unlocated'));