-- UP: Append-only observed traverse inputs, numerical results and final requests.
-- Historical rounded values are preserved; future coordinates keep full precision.
ALTER TABLE public.parcels ALTER COLUMN area_ha TYPE NUMERIC USING area_ha::numeric;
ALTER TABLE public.traverse_coordinates ALTER COLUMN easting TYPE NUMERIC USING easting::numeric;
ALTER TABLE public.traverse_coordinates ALTER COLUMN northing TYPE NUMERIC USING northing::numeric;
ALTER TABLE public.traverse_coordinates ADD COLUMN coordinate_order INTEGER;
ALTER TABLE public.traverse_observations ADD COLUMN observation_order INTEGER;
ALTER TABLE public.traverse_observations ADD COLUMN retained_input JSONB;
ALTER TABLE public.traverse_observations ADD COLUMN source_kind TEXT;
ALTER TABLE public.parcel_traverses ADD COLUMN retained_revision_id UUID;

CREATE TABLE public.parcel_traverse_requests (
  actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  request_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  parcel_id UUID NOT NULL REFERENCES public.parcels(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  input_hash TEXT NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
  state TEXT NOT NULL CHECK(state IN ('committed','cancelled')),
  revision_id UUID,
  receipt JSONB NOT NULL CHECK(jsonb_typeof(receipt)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_id,request_id),
  CHECK((state='committed')=(revision_id IS NOT NULL)),
  CHECK((receipt->>'state') IS NOT DISTINCT FROM state AND (receipt->>'requestId') IS NOT DISTINCT FROM request_id::text AND (receipt->>'actorId') IS NOT DISTINCT FROM actor_id::text
    AND (receipt->>'projectId') IS NOT DISTINCT FROM project_id::text AND (receipt->>'parcelId') IS NOT DISTINCT FROM parcel_id::text AND (receipt->>'inputHash') IS NOT DISTINCT FROM input_hash)
);
CREATE TABLE public.parcel_traverse_revisions (
  id UUID PRIMARY KEY,
  actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  request_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  parcel_id UUID NOT NULL REFERENCES public.parcels(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  traverse_id UUID NOT NULL UNIQUE REFERENCES public.parcel_traverses(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  ordinal INTEGER NOT NULL CHECK(ordinal>0),
  parent_revision_id UUID REFERENCES public.parcel_traverse_revisions(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  input_hash TEXT NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
  result_hash TEXT NOT NULL CHECK(result_hash ~ '^[a-f0-9]{64}$'),
  source_hash TEXT NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
  reference_hash TEXT NOT NULL CHECK(reference_hash ~ '^[a-f0-9]{64}$'),
  request_hash TEXT NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  request_text TEXT NOT NULL,
  engine_version TEXT NOT NULL CHECK(length(engine_version) BETWEEN 1 AND 100),
  input_snapshot JSONB NOT NULL CHECK(jsonb_typeof(input_snapshot)='object'),
  result_snapshot JSONB NOT NULL CHECK(jsonb_typeof(result_snapshot)='object'),
  reference_record TEXT NOT NULL CHECK(jsonb_typeof(reference_record::jsonb)='object'),
  receipt JSONB NOT NULL CHECK(jsonb_typeof(receipt)='object'),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(actor_id,request_id),UNIQUE(parcel_id,ordinal),
  FOREIGN KEY(actor_id,request_id) REFERENCES public.parcel_traverse_requests(actor_id,request_id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CHECK((input_snapshot->>'expectedUserId') IS NOT DISTINCT FROM actor_id::text AND (input_snapshot->>'projectId') IS NOT DISTINCT FROM project_id::text AND (input_snapshot->>'parcelId') IS NOT DISTINCT FROM parcel_id::text
    AND (input_snapshot->>'requestId') IS NOT DISTINCT FROM request_id::text AND (receipt->>'revisionId') IS NOT DISTINCT FROM id::text AND (receipt->>'traverseId') IS NOT DISTINCT FROM traverse_id::text)
);
ALTER TABLE public.parcel_traverse_requests ADD FOREIGN KEY(revision_id) REFERENCES public.parcel_traverse_revisions(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.parcel_traverses ADD FOREIGN KEY(retained_revision_id) REFERENCES public.parcel_traverse_revisions(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX parcel_traverse_revision_register ON public.parcel_traverse_revisions(project_id,parcel_id,ordinal DESC);
CREATE UNIQUE INDEX retained_traverse_coordinate_order ON public.traverse_coordinates(traverse_id,coordinate_order) WHERE coordinate_order IS NOT NULL;
CREATE UNIQUE INDEX retained_traverse_observation_order ON public.traverse_observations(traverse_id,observation_order) WHERE observation_order IS NOT NULL;

ALTER TABLE public.parcel_traverse_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcel_traverse_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.parcel_traverse_requests,public.parcel_traverse_revisions FROM PUBLIC,authenticated;
GRANT SELECT,INSERT ON public.parcel_traverse_requests,public.parcel_traverse_revisions TO authenticated;
REVOKE TRUNCATE ON public.parcel_traverses,public.traverse_coordinates,public.traverse_observations FROM PUBLIC,authenticated;
CREATE POLICY retained_traverse_request_read ON public.parcel_traverse_requests FOR SELECT TO authenticated USING(
  EXISTS(SELECT 1 FROM public.projects p WHERE p.id=parcel_traverse_requests.project_id AND p.user_id::text=NULLIF(current_setting('request.user_id',true),'')));
CREATE POLICY retained_traverse_request_append ON public.parcel_traverse_requests FOR INSERT TO authenticated WITH CHECK(
  actor_id::text=NULLIF(current_setting('request.user_id',true),'') AND EXISTS(SELECT 1 FROM public.projects p JOIN public.parcels r ON r.project_id=p.id WHERE p.id=parcel_traverse_requests.project_id AND r.id=parcel_traverse_requests.parcel_id AND p.user_id::text=NULLIF(current_setting('request.user_id',true),'')));
CREATE POLICY retained_traverse_revision_read ON public.parcel_traverse_revisions FOR SELECT TO authenticated USING(
  EXISTS(SELECT 1 FROM public.projects p WHERE p.id=parcel_traverse_revisions.project_id AND p.user_id::text=NULLIF(current_setting('request.user_id',true),'')));
CREATE POLICY retained_traverse_revision_append ON public.parcel_traverse_revisions FOR INSERT TO authenticated WITH CHECK(
  actor_id::text=NULLIF(current_setting('request.user_id',true),'') AND EXISTS(SELECT 1 FROM public.projects p JOIN public.parcels r ON r.project_id=p.id JOIN public.parcel_traverses t ON t.parcel_id=r.id AND t.project_id=p.id
    WHERE p.id=parcel_traverse_revisions.project_id AND r.id=parcel_traverse_revisions.parcel_id AND t.id=parcel_traverse_revisions.traverse_id AND t.retained_revision_id=parcel_traverse_revisions.id AND p.user_id::text=NULLIF(current_setting('request.user_id',true),'')));

CREATE FUNCTION public.guard_retained_traverse_record() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target_project UUID;
BEGIN
  IF TG_TABLE_NAME IN ('parcel_traverse_requests','parcel_traverse_revisions') THEN
    IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.projects p WHERE p.id=OLD.project_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Retained traverse evidence is immutable.' USING ERRCODE='42501';
  END IF;
  IF TG_TABLE_NAME='parcel_traverses' THEN
    SELECT r.project_id INTO target_project FROM public.parcel_traverse_revisions r WHERE r.traverse_id=OLD.id;
  ELSE
    SELECT r.project_id INTO target_project FROM public.parcel_traverse_revisions r WHERE r.traverse_id=CASE WHEN TG_OP='DELETE' THEN OLD.traverse_id ELSE NEW.traverse_id END;
    IF target_project IS NULL AND TG_OP='UPDATE' THEN
      SELECT r.project_id INTO target_project FROM public.parcel_traverse_revisions r WHERE r.traverse_id=OLD.traverse_id;
    END IF;
  END IF;
  IF target_project IS NOT NULL AND EXISTS(SELECT 1 FROM public.projects p WHERE p.id=target_project) THEN
    RAISE EXCEPTION 'Retained traverse source rows cannot be replaced.' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_retained_traverse_record() FROM PUBLIC;
CREATE TRIGGER retained_traverse_request_immutable BEFORE UPDATE OR DELETE ON public.parcel_traverse_requests FOR EACH ROW EXECUTE FUNCTION public.guard_retained_traverse_record();
CREATE TRIGGER retained_traverse_revision_immutable BEFORE UPDATE OR DELETE ON public.parcel_traverse_revisions FOR EACH ROW EXECUTE FUNCTION public.guard_retained_traverse_record();
CREATE TRIGGER retained_traverse_parent_immutable BEFORE UPDATE OR DELETE ON public.parcel_traverses FOR EACH ROW EXECUTE FUNCTION public.guard_retained_traverse_record();
CREATE TRIGGER retained_traverse_coordinates_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.traverse_coordinates FOR EACH ROW EXECUTE FUNCTION public.guard_retained_traverse_record();
CREATE TRIGGER retained_traverse_observations_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.traverse_observations FOR EACH ROW EXECUTE FUNCTION public.guard_retained_traverse_record();

-- DOWN: Original observation precision and receipts cannot be discarded safely.
DO $$ BEGIN RAISE EXCEPTION '122 requires a reviewed forward correction; retain original traverse evidence.'; END $$;
