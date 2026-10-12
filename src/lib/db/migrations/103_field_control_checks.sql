-- UP: Private append-only field observations against an explicitly retained basis.
-- Do not reinterpret historical 5 mm comparisons as evidenced project checks.
ALTER TABLE public.boundary_monuments ADD COLUMN IF NOT EXISTS horizontal_crs TEXT;
ALTER TABLE public.boundary_monuments ADD COLUMN IF NOT EXISTS vertical_datum TEXT;
ALTER TABLE public.boundary_monuments ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE RESTRICT;

DROP POLICY IF EXISTS verifications_read_all ON public.control_point_verifications;
DROP POLICY IF EXISTS verifications_insert_own ON public.control_point_verifications;
DROP POLICY IF EXISTS verifications_update_own ON public.control_point_verifications;
CREATE POLICY legacy_control_checks_private ON public.control_point_verifications FOR SELECT USING (verified_by=public.current_user_id());
CREATE POLICY legacy_control_checks_read_guard ON public.control_point_verifications AS RESTRICTIVE FOR SELECT USING (verified_by=public.current_user_id());
CREATE POLICY legacy_control_checks_insert_guard ON public.control_point_verifications AS RESTRICTIVE FOR INSERT WITH CHECK (false);
CREATE POLICY legacy_control_checks_update_guard ON public.control_point_verifications AS RESTRICTIVE FOR UPDATE USING (false);
CREATE POLICY legacy_control_checks_delete_guard ON public.control_point_verifications AS RESTRICTIVE FOR DELETE USING (false);
CREATE TRIGGER retained_legacy_control_check BEFORE UPDATE OR DELETE ON public.control_point_verifications FOR EACH ROW EXECUTE FUNCTION public.reject_control_evidence_mutation();

CREATE TABLE public.control_field_checks (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
 actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 point_type TEXT NOT NULL CHECK (point_type IN ('survey_point','beacon','boundary_monument')),
 point_id UUID NOT NULL,
 request_id UUID NOT NULL,
 input_hash TEXT NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
 source_snapshot JSONB NOT NULL,
 reference_snapshot JSONB NOT NULL,
 observation JSONB NOT NULL,
 result JSONB NOT NULL,
 observed_at TIMESTAMPTZ NOT NULL CHECK (isfinite(observed_at)),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(project_id,actor_id,request_id),
 CHECK ((result->>'certified') IS NOT DISTINCT FROM 'false' AND (result->>'statisticalStabilityEstablished') IS NOT DISTINCT FROM 'false'),
 CHECK (result->>'status' IS NOT NULL AND result->>'status' IN ('not_measured','unsuitable_condition','within_declared_tolerance','exceeds_declared_tolerance'))
);
ALTER TABLE public.control_field_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY field_check_private_read ON public.control_field_checks FOR SELECT USING (
 EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.user_id=public.current_user_id())
);
CREATE POLICY field_check_append ON public.control_field_checks FOR INSERT WITH CHECK (
 actor_id=public.current_user_id() AND EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.user_id=actor_id)
);
CREATE FUNCTION public.check_field_control_basis() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE source JSONB; reference JSONB; grid TEXT; height_datum TEXT;
BEGIN
 SELECT to_jsonb(r) INTO reference FROM public.project_reference_systems r WHERE r.project_id=NEW.project_id FOR SHARE;
 IF reference IS NULL OR reference->>'horizontal_crs' IS NULL OR reference IS DISTINCT FROM NEW.reference_snapshot THEN
  RAISE EXCEPTION 'Field check requires the exact saved project reference';
 END IF;
 IF NEW.point_type='survey_point' THEN
  SELECT to_jsonb(s) INTO source FROM public.survey_points s WHERE s.id=NEW.point_id AND s.project_id=NEW.project_id AND s.is_control AND s.deleted_at IS NULL FOR SHARE;
  grid=source->>'horizontal_crs'; height_datum=source->>'vertical_datum';
 ELSIF NEW.point_type='beacon' THEN
  SELECT to_jsonb(b) INTO source FROM public.beacon_registry b WHERE b.id=NEW.point_id AND b.project_id=NEW.project_id AND b.created_by=NEW.actor_id AND b.status<>'SUPERSEDED' AND b.superseded_by_id IS NULL FOR SHARE;
  grid=source->>'horizontal_crs'; height_datum=source#>>'{metadata,reference,verticalDatum}';
 ELSE
  SELECT to_jsonb(m) INTO source FROM public.boundary_monuments m WHERE m.id=NEW.point_id AND m.created_by=NEW.actor_id AND (m.project_id IS NULL OR m.project_id=NEW.project_id) FOR SHARE;
  grid=source->>'horizontal_crs'; height_datum=source->>'vertical_datum';
 END IF;
 IF source IS NULL OR source IS DISTINCT FROM NEW.source_snapshot OR grid IS NULL OR grid<>reference->>'horizontal_crs' THEN
  RAISE EXCEPTION 'Field check requires the exact current same-grid control basis';
 END IF;
 IF source->>'easting' IS NULL OR source->>'northing' IS NULL THEN RAISE EXCEPTION 'Control basis coordinates are required'; END IF;
 IF NEW.observation->>'measuredElevation' IS NOT NULL AND (source->>'elevation' IS NULL OR height_datum IS NULL OR height_datum IS DISTINCT FROM reference->>'vertical_datum') THEN
  RAISE EXCEPTION 'Height comparison requires an identical declared height datum';
 END IF;
 IF NEW.observed_at>clock_timestamp() OR NEW.observed_at IS DISTINCT FROM (NEW.observation->>'observedAt')::timestamptz THEN RAISE EXCEPTION 'Record the actual observation time'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER field_control_basis_guard BEFORE INSERT ON public.control_field_checks FOR EACH ROW EXECUTE FUNCTION public.check_field_control_basis();
CREATE TRIGGER field_control_check_immutable BEFORE UPDATE OR DELETE ON public.control_field_checks FOR EACH ROW EXECUTE FUNCTION public.reject_control_evidence_mutation();
CREATE INDEX field_control_checks_history ON public.control_field_checks(project_id,observed_at DESC,id);
-- DOWN: Retained observation evidence requires reviewed forward migrations.
