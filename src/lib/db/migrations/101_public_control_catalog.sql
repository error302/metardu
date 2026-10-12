-- UP: Explicit reference evidence, independent catalogue review and private control-import captures.
-- Existing legacy rows retain their old SRID/defaults; none is relabelled as an explicit declaration.
ALTER TABLE public.public_beacons
  ADD COLUMN IF NOT EXISTS horizontal_crs TEXT,
  ADD COLUMN IF NOT EXISTS vertical_datum TEXT,
  ADD COLUMN IF NOT EXISTS source_reference TEXT,
  ADD COLUMN IF NOT EXISTS authority TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.survey_points
  ADD COLUMN IF NOT EXISTS horizontal_crs TEXT,
  ADD COLUMN IF NOT EXISTS vertical_datum TEXT;

CREATE TABLE public.public_beacon_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beacon_id UUID NOT NULL REFERENCES public.public_beacons(id) ON DELETE RESTRICT,
  reviewer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('verified','rejected')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  source_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.public_beacon_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_review_read ON public.public_beacon_reviews FOR SELECT USING (current_user_id() IS NOT NULL);
CREATE POLICY catalog_review_insert ON public.public_beacon_reviews FOR INSERT WITH CHECK (
  reviewer_id=current_user_id() AND is_admin()
  AND EXISTS (SELECT 1 FROM public.public_beacons b WHERE b.id=beacon_id AND b.submitted_by IS DISTINCT FROM reviewer_id)
);

ALTER TABLE public.public_beacons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS submitter_all_beacons ON public.public_beacons;
DROP POLICY IF EXISTS admin_all_beacons ON public.public_beacons;
DROP POLICY IF EXISTS authenticated_read_beacons ON public.public_beacons;
CREATE POLICY catalog_read ON public.public_beacons FOR SELECT USING (current_user_id() IS NOT NULL);
CREATE POLICY catalog_submit ON public.public_beacons FOR INSERT WITH CHECK (submitted_by=current_user_id() AND status='pending' AND verified_by IS NULL AND verified_at IS NULL);
CREATE POLICY catalog_admin_update ON public.public_beacons FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY catalog_insert_guard ON public.public_beacons AS RESTRICTIVE FOR INSERT WITH CHECK (submitted_by=current_user_id() AND status='pending' AND verified_by IS NULL AND verified_at IS NULL);
CREATE POLICY catalog_update_guard ON public.public_beacons AS RESTRICTIVE FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY catalog_delete_guard ON public.public_beacons AS RESTRICTIVE FOR DELETE USING (false);

CREATE FUNCTION public.protect_public_control_record() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE review public.public_beacon_reviews%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reference catalogue records are retained for provenance.'; END IF;
  IF EXISTS (SELECT 1 FROM public.public_beacon_reviews WHERE beacon_id=OLD.id)
     AND (to_jsonb(NEW)-ARRAY['status','verified_by','verified_at','updated_at']) IS DISTINCT FROM
         (to_jsonb(OLD)-ARRAY['status','verified_by','verified_at','updated_at'])
  THEN RAISE EXCEPTION 'Reviewed source coordinates are immutable; submit a new referenced record.'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.verified_by IS DISTINCT FROM OLD.verified_by OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
    SELECT * INTO review FROM public.public_beacon_reviews WHERE beacon_id=OLD.id ORDER BY created_at DESC,id DESC LIMIT 1;
    IF review.id IS NULL OR NEW.status <> review.decision OR NEW.verified_by IS DISTINCT FROM review.reviewer_id OR NEW.verified_at IS DISTINCT FROM review.created_at
    THEN RAISE EXCEPTION 'Catalogue status requires its independent review record.'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER public_control_record_guard BEFORE UPDATE OR DELETE ON public.public_beacons FOR EACH ROW EXECUTE FUNCTION public.protect_public_control_record();

CREATE TABLE public.control_import_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  beacon_id UUID NOT NULL REFERENCES public.public_beacons(id) ON DELETE RESTRICT,
  point_id UUID NOT NULL UNIQUE REFERENCES public.survey_points(id) ON DELETE RESTRICT,
  actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  request_id UUID NOT NULL,
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  source_snapshot JSONB NOT NULL,
  project_reference_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,actor_id,request_id), UNIQUE(project_id,beacon_id)
);
ALTER TABLE public.control_import_captures ENABLE ROW LEVEL SECURITY;
CREATE POLICY control_import_read ON public.control_import_captures FOR SELECT USING (actor_id=current_user_id());
CREATE POLICY control_import_insert ON public.control_import_captures FOR INSERT WITH CHECK (
 actor_id=current_user_id()
 AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.user_id=actor_id)
 AND EXISTS (SELECT 1 FROM public.survey_points s JOIN public.public_beacons b ON b.id=control_import_captures.beacon_id
   JOIN public.project_reference_systems r ON r.project_id=control_import_captures.project_id
   WHERE s.id=point_id AND s.project_id=control_import_captures.project_id AND b.status='verified'
   AND b.horizontal_crs IS NOT NULL AND b.horizontal_crs=r.horizontal_crs AND s.horizontal_crs=b.horizontal_crs
   AND s.easting=b.easting::numeric(14,4) AND s.northing=b.northing::numeric(14,4)
   AND s.elevation IS NOT DISTINCT FROM b.elevation::numeric(12,4)
   AND (b.elevation IS NULL OR (b.vertical_datum IS NOT NULL AND b.vertical_datum=r.vertical_datum AND s.vertical_datum=b.vertical_datum))
   AND source_snapshot=to_jsonb(b) AND project_reference_snapshot=to_jsonb(r))
);
CREATE FUNCTION public.reject_control_evidence_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Control provenance captures and reviews are immutable.';
END $$;
CREATE TRIGGER immutable_public_control_review BEFORE UPDATE OR DELETE ON public.public_beacon_reviews FOR EACH ROW EXECUTE FUNCTION public.reject_control_evidence_mutation();
CREATE TRIGGER immutable_control_import BEFORE UPDATE OR DELETE ON public.control_import_captures FOR EACH ROW EXECUTE FUNCTION public.reject_control_evidence_mutation();
CREATE FUNCTION public.protect_imported_control_coordinate() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.control_import_captures WHERE point_id=OLD.id) THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Imported control coordinates retain their source capture.'; END IF;
   IF (to_jsonb(NEW)-ARRAY['description','updated_at','signed_audit']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['description','updated_at','signed_audit'])
   THEN RAISE EXCEPTION 'Imported control coordinates are immutable; record a new observation.'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER imported_control_coordinate_guard BEFORE UPDATE OR DELETE ON public.survey_points FOR EACH ROW EXECUTE FUNCTION public.protect_imported_control_coordinate();
CREATE INDEX public_control_grid_xy ON public.public_beacons(horizontal_crs,easting,northing) WHERE status='verified';
-- DOWN: Refuse automatic rollback that would remove reference and review evidence.
-- DO $$ BEGIN RAISE EXCEPTION 'Use a reviewed forward migration; control provenance must be retained.'; END $$;
