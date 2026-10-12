-- UP: Keep original measurement precision and capture references as immutable
-- evidence. Existing rounded rows remain legacy; no values are reconstructed.
ALTER TABLE setout_observations ADD COLUMN IF NOT EXISTS capture_snapshot JSONB;

ALTER TABLE setout_observations ADD CONSTRAINT setout_capture_snapshot_shape CHECK (
  capture_snapshot IS NULL OR (
    jsonb_typeof(capture_snapshot) = 'object'
    AND capture_snapshot->>'schemaVersion' = '1'
    AND capture_snapshot->'algorithm'->>'id' = 'metardu.setout-shot'
    AND capture_snapshot->'algorithm'->>'version' = '1'
    AND capture_snapshot->>'projectId' = project_id::text
    AND capture_snapshot->>'definitionId' = definition_id::text
    AND capture_snapshot->>'pointId' = setout_point_id::text
    AND capture_snapshot->>'pointLabel' = label
    AND (capture_snapshot->>'designRevision')::integer > 0
    AND jsonb_typeof(capture_snapshot->'design') = 'object'
    AND jsonb_typeof(capture_snapshot->'observed') = 'object'
    AND round((capture_snapshot->'design'->>'easting')::numeric, 3) = design_easting
    AND round((capture_snapshot->'design'->>'northing')::numeric, 3) = design_northing
    AND round((capture_snapshot->'observed'->>'easting')::numeric, 3) = observed_easting
    AND round((capture_snapshot->'observed'->>'northing')::numeric, 3) = observed_northing
    AND round((capture_snapshot->'observed'->>'rl')::numeric, 3) IS NOT DISTINCT FROM observed_rl
    AND round((capture_snapshot->'design'->>'rl')::numeric, 3) IS NOT DISTINCT FROM design_rl
    AND round((capture_snapshot->'tolerance'->>'horizontalM')::numeric, 4) = threshold_h
    AND round((capture_snapshot->'tolerance'->>'verticalM')::numeric, 4) = threshold_v
    AND capture_snapshot->'tolerance'->>'version' = tolerance_version
    AND capture_snapshot->'tolerance'->'profile'->>'id' IS NOT DISTINCT FROM tolerance_profile_id::text
    AND round((capture_snapshot->>'reportedAccuracyM')::numeric, 4) IS NOT DISTINCT FROM reported_accuracy_m
    AND round((capture_snapshot->'assessment'->>'horizontalErrorM')::numeric, 4) IS NOT DISTINCT FROM horizontal_error
    AND round((capture_snapshot->'assessment'->>'verticalErrorM')::numeric, 4) IS NOT DISTINCT FROM vertical_error
    AND round((capture_snapshot->'assessment'->>'dE')::numeric, 4) IS NOT DISTINCT FROM d_e
    AND round((capture_snapshot->'assessment'->>'dN')::numeric, 4) IS NOT DISTINCT FROM d_n
    AND round((capture_snapshot->'assessment'->>'dZ')::numeric, 4) IS NOT DISTINCT FROM d_z
    AND capture_snapshot->'assessment'->>'result' = result
  ) IS TRUE
);

CREATE OR REPLACE FUNCTION require_setout_capture_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.capture_snapshot IS NULL THEN
    RAISE EXCEPTION 'New set-out observations require an immutable capture snapshot; deploy the capture-aware application before accepting new shots.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER setout_capture_required BEFORE INSERT ON setout_observations
  FOR EACH ROW EXECUTE FUNCTION require_setout_capture_snapshot();

COMMENT ON COLUMN setout_observations.capture_snapshot IS
  'Original server-assessed measurements, client-reported capture time/CRS, design revision, reference and criteria. NULL identifies pre-migration evidence; never infer a missing capture value.';

-- DOWN: Removing snapshots would destroy original measurement evidence.
DO $$ BEGIN
  RAISE EXCEPTION 'Migration 096 is evidence-forward-only; retain capture snapshots and correct issues with a forward migration.' USING ERRCODE = '55000';
END; $$;
