-- UP: Extend immutable capture evidence to version 2 without rewriting observations.
-- Existing v1 snapshots retain their original algorithm and recorded result.
-- Apply and verify on an authorized recovery/test dataset before production promotion.
-- The application retains queued shots if the older v1-only constraint rejects v2.
ALTER TABLE setout_observations DROP CONSTRAINT setout_capture_snapshot_shape;

-- Keep existing stored values; do not regenerate historical designs. Future
-- approved targets must not be quantized to millimetres before a tighter
-- adopted criterion is evaluated. Immutable observation snapshots retain raw
-- capture precision separately from the historical rounded display columns.
ALTER TABLE setout_points
  ALTER COLUMN easting TYPE DOUBLE PRECISION USING easting::double precision,
  ALTER COLUMN northing TYPE DOUBLE PRECISION USING northing::double precision,
  ALTER COLUMN design_rl TYPE DOUBLE PRECISION USING design_rl::double precision;

ALTER TABLE setout_observations ADD CONSTRAINT setout_capture_snapshot_shape CHECK (
  capture_snapshot IS NULL OR (
    jsonb_typeof(capture_snapshot) = 'object'
    AND capture_snapshot->'algorithm'->>'id' = 'metardu.setout-shot'
    AND (
      (capture_snapshot->>'schemaVersion' = '1' AND capture_snapshot->'algorithm'->>'version' = '1'
       AND jsonb_typeof(capture_snapshot->'tolerance'->'horizontalM') = 'number'
       AND jsonb_typeof(capture_snapshot->'tolerance'->'verticalM') = 'number'
       AND capture_snapshot->'tolerance'->>'version' IS NOT NULL)
      OR
      (capture_snapshot->>'schemaVersion' = '2' AND capture_snapshot->'algorithm'->>'version' = '2'
       AND capture_snapshot->'acceptance'->>'scope' = 'numerical_comparison_only'
       AND jsonb_typeof(capture_snapshot->'acceptance'->'eligible') = 'boolean'
       AND jsonb_typeof(capture_snapshot->'acceptance'->'issues') = 'array'
       AND (
         (capture_snapshot->'acceptance'->>'eligible' = 'false'
          AND capture_snapshot->'assessment'->>'result' = 'INFO'
          AND jsonb_array_length(capture_snapshot->'acceptance'->'issues') > 0)
         OR
         (capture_snapshot->'acceptance'->>'eligible' = 'true'
          AND capture_snapshot->'assessment'->>'result' IN ('PASS','WARN','FAIL')
          AND jsonb_array_length(capture_snapshot->'acceptance'->'issues') = 0
          AND capture_snapshot->'tolerance'->>'source' = 'project_profile_transcription'
          AND capture_snapshot->>'capturedToleranceProfileId' = capture_snapshot->'tolerance'->'profile'->>'id'
          AND capture_snapshot->>'capturedAt' IS NOT NULL
          AND capture_snapshot->>'deviceCrs' = capture_snapshot->>'horizontalCrs'
          AND capture_snapshot->>'definitionCrs' = capture_snapshot->>'horizontalCrs'
          AND (capture_snapshot->>'reportedAccuracyM')::numeric > 0
          AND (capture_snapshot->>'reportedAccuracyM')::numeric <= (capture_snapshot->'tolerance'->>'horizontalM')::numeric
          AND capture_snapshot->'capturedDesign' = capture_snapshot->'design'
          AND (capture_snapshot->'design'->>'rl' IS NULL AND capture_snapshot->'observed'->>'rl' IS NULL
               OR jsonb_typeof(capture_snapshot->'design'->'rl') = 'number'
                  AND jsonb_typeof(capture_snapshot->'observed'->'rl') = 'number'
                  AND capture_snapshot->>'deviceVerticalDatum' = capture_snapshot->>'verticalDatum'
                  AND capture_snapshot->>'verticalDatum' IS NOT NULL
                  AND (capture_snapshot->>'reportedVerticalAccuracyM')::numeric > 0
                  AND (capture_snapshot->>'reportedVerticalAccuracyM')::numeric <= (capture_snapshot->'tolerance'->>'verticalM')::numeric)
         )
       )
       AND (
         (capture_snapshot->'tolerance'->>'source' = 'not_provided'
          AND capture_snapshot->'tolerance'->>'horizontalM' IS NULL
          AND capture_snapshot->'tolerance'->>'verticalM' IS NULL
          AND capture_snapshot->'tolerance'->>'version' IS NULL
          AND capture_snapshot->'tolerance'->'profile' = 'null'::jsonb
          AND capture_snapshot->'assessment'->>'result' = 'INFO')
         OR
         (capture_snapshot->'tolerance'->>'source' = 'project_profile_transcription'
          AND (capture_snapshot->'tolerance'->>'horizontalM')::numeric > 0
          AND (capture_snapshot->'tolerance'->>'verticalM')::numeric > 0
          AND jsonb_typeof(capture_snapshot->'tolerance'->'profile') = 'object')
       )
      )
    )
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
    AND round((capture_snapshot->'tolerance'->>'horizontalM')::numeric, 4) IS NOT DISTINCT FROM threshold_h
    AND round((capture_snapshot->'tolerance'->>'verticalM')::numeric, 4) IS NOT DISTINCT FROM threshold_v
    AND capture_snapshot->'tolerance'->>'version' IS NOT DISTINCT FROM tolerance_version
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

-- DOWN: Historical v2 evidence cannot safely be converted to legacy default criteria.
DO $$ BEGIN
  RAISE EXCEPTION 'Migration 106 is evidence-forward-only; retain both capture versions and repair with a forward migration.' USING ERRCODE = '55000';
END; $$;
