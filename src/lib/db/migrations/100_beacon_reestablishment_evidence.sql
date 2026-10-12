-- UP: Preserve the observed replacement and the exact record it superseded.
-- No existing coordinate, numbering or reference declaration is backfilled.
ALTER TABLE public.beacon_registry ADD COLUMN IF NOT EXISTS horizontal_crs TEXT;
ALTER TABLE public.beacon_registry ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE RESTRICT;

CREATE TABLE public.beacon_reestablishment_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  predecessor_id UUID NOT NULL REFERENCES public.beacon_registry(id) ON DELETE RESTRICT,
  replacement_id UUID NOT NULL UNIQUE REFERENCES public.beacon_registry(id) ON DELETE RESTRICT,
  actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  request_id UUID NOT NULL,
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  reference_snapshot JSONB NOT NULL,
  predecessor_snapshot JSONB NOT NULL,
  observation JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (project_id, actor_id, request_id),
  UNIQUE (predecessor_id),
  CHECK (predecessor_id <> replacement_id)
);
ALTER TABLE public.beacon_reestablishment_captures ENABLE ROW LEVEL SECURITY;
CREATE POLICY beacon_capture_read ON public.beacon_reestablishment_captures
  FOR SELECT USING (actor_id = NULLIF(current_setting('request.user_id', true), '')::UUID);
CREATE POLICY beacon_capture_append ON public.beacon_reestablishment_captures
  FOR INSERT WITH CHECK (
    actor_id = NULLIF(current_setting('request.user_id', true), '')::UUID
    AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = beacon_reestablishment_captures.project_id AND p.user_id = beacon_reestablishment_captures.actor_id)
    AND EXISTS (SELECT 1 FROM public.beacon_registry b WHERE b.id = beacon_reestablishment_captures.predecessor_id AND b.created_by = beacon_reestablishment_captures.actor_id AND (b.project_id IS NULL OR b.project_id = beacon_reestablishment_captures.project_id))
    AND EXISTS (SELECT 1 FROM public.beacon_registry b WHERE b.id = beacon_reestablishment_captures.replacement_id AND b.created_by = beacon_reestablishment_captures.actor_id AND b.project_id = beacon_reestablishment_captures.project_id AND b.re_established_from_id = beacon_reestablishment_captures.predecessor_id)
  );
CREATE FUNCTION public.reject_beacon_capture_mutation() RETURNS TRIGGER
LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Beacon observation captures are immutable; record a new observation.';
END; $$;
CREATE TRIGGER beacon_capture_immutable BEFORE UPDATE OR DELETE
  ON public.beacon_reestablishment_captures FOR EACH ROW
  EXECUTE FUNCTION public.reject_beacon_capture_mutation();

CREATE OR REPLACE FUNCTION public.enforce_beacon_supersession() RETURNS TRIGGER
LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.superseded_by_id IS NOT NULL OR EXISTS (
      SELECT 1 FROM public.beacon_reestablishment_captures c
       WHERE c.predecessor_id = OLD.id OR c.replacement_id = OLD.id
    ) THEN RAISE EXCEPTION 'Published beacon evidence cannot be deleted.'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.superseded_by_id IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'A superseded beacon is immutable.';
  END IF;
  IF NEW.superseded_by_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.beacon_reestablishment_captures c WHERE c.replacement_id = OLD.id
  ) THEN
    IF (to_jsonb(NEW) - ARRAY['status','superseded_by_id','updated_at']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','superseded_by_id','updated_at']) THEN
      RAISE EXCEPTION 'Published beacon coordinates, reference and provenance are immutable.';
    END IF;
  END IF;
  IF NEW.superseded_by_id IS DISTINCT FROM OLD.superseded_by_id THEN
    IF NEW.status <> 'SUPERSEDED' OR NOT EXISTS (
      SELECT 1 FROM public.beacon_reestablishment_captures c
       WHERE c.predecessor_id = OLD.id AND c.replacement_id = NEW.superseded_by_id
    ) THEN RAISE EXCEPTION 'Beacon supersession requires its immutable observation capture.'; END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS beacon_registry_supersession ON public.beacon_registry;
CREATE TRIGGER beacon_registry_supersession BEFORE UPDATE OR DELETE ON public.beacon_registry
  FOR EACH ROW EXECUTE FUNCTION public.enforce_beacon_supersession();
