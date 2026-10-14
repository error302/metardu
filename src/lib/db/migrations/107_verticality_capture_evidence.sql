-- UP: Preserve exact new column-plumb evidence and stable delivery identity.
-- Old append-only readings retain their recorded result and NULL snapshot.
-- Verify compatibility and recovery before applying to production.
ALTER TABLE verticality_readings
  ADD COLUMN IF NOT EXISTS capture_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS client_reading_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS verticality_reading_delivery_unique
  ON verticality_readings(project_id, client_reading_id)
  WHERE client_reading_id IS NOT NULL;

ALTER TABLE verticality_readings ADD CONSTRAINT verticality_capture_snapshot_shape CHECK (
  (capture_snapshot IS NULL AND client_reading_id IS NULL) OR (
    client_reading_id IS NOT NULL
    AND jsonb_typeof(capture_snapshot) = 'object'
    AND capture_snapshot->>'schemaVersion' = '1'
    AND capture_snapshot->'algorithm'->>'id' = 'metardu.column-plumb'
    AND capture_snapshot->'algorithm'->>'version' = '1'
    AND capture_snapshot->>'scope' = 'numerical_comparison_only'
    AND capture_snapshot->>'projectId' = project_id::text
    AND capture_snapshot->>'definitionId' IS NOT DISTINCT FROM definition_id::text
    AND capture_snapshot->>'label' = label
    AND capture_snapshot->>'level' IS NOT DISTINCT FROM level
    AND capture_snapshot->>'instrument' IS NOT DISTINCT FROM instrument
    AND capture_snapshot->>'notes' IS NOT DISTINCT FROM notes
    AND capture_snapshot->>'horizontalCrs' IS NOT NULL
    AND jsonb_typeof(capture_snapshot->'base'->'easting') = 'number'
    AND jsonb_typeof(capture_snapshot->'base'->'northing') = 'number'
    AND jsonb_typeof(capture_snapshot->'top'->'easting') = 'number'
    AND jsonb_typeof(capture_snapshot->'top'->'northing') = 'number'
    AND round((capture_snapshot->'base'->>'easting')::numeric, 3) = base_easting
    AND round((capture_snapshot->'base'->>'northing')::numeric, 3) = base_northing
    AND round((capture_snapshot->'top'->>'easting')::numeric, 3) = top_easting
    AND round((capture_snapshot->'top'->>'northing')::numeric, 3) = top_northing
    AND round((capture_snapshot->'base'->>'rl')::numeric, 3) IS NOT DISTINCT FROM base_rl
    AND round((capture_snapshot->'top'->>'rl')::numeric, 3) IS NOT DISTINCT FROM top_rl
    AND round((capture_snapshot->'assessment'->>'offsetM')::numeric, 4) = offset_h
    AND capture_snapshot->'assessment'->>'result' = result
    AND jsonb_typeof(capture_snapshot->'assessment'->'issues') = 'array'
    AND (
      (capture_snapshot->'assessment'->>'result' = 'INFO'
       AND jsonb_array_length(capture_snapshot->'assessment'->'issues') > 0)
      OR
      (capture_snapshot->'assessment'->>'result' IN ('PASS', 'FAIL')
       AND jsonb_array_length(capture_snapshot->'assessment'->'issues') = 0
       AND capture_snapshot->>'capturedCrs' = capture_snapshot->>'horizontalCrs'
       AND capture_snapshot->>'capturedAt' IS NOT NULL
       AND capture_snapshot->>'verticalDatum' IS NOT NULL
       AND capture_snapshot->>'capturedVerticalDatum' = capture_snapshot->>'verticalDatum'
       AND (capture_snapshot->'top'->>'rl')::numeric > (capture_snapshot->'base'->>'rl')::numeric
       AND (capture_snapshot->>'horizontalUncertaintyM')::numeric > 0
       AND (capture_snapshot->>'heightUncertaintyM')::numeric > 0
       AND (capture_snapshot->>'heightUncertaintyM')::numeric < (capture_snapshot->'assessment'->>'heightM')::numeric
       AND (capture_snapshot->>'horizontalUncertaintyM')::numeric <= LEAST(
         (capture_snapshot->'criteria'->>'maxOffsetM')::numeric,
         (capture_snapshot->'assessment'->>'heightM')::numeric / (capture_snapshot->'criteria'->>'minTiltRatio')::numeric))
    )
    AND (
      (capture_snapshot->'criteria' = 'null'::jsonb AND tolerance_ratio IS NULL AND result = 'INFO')
      OR
      (jsonb_typeof(capture_snapshot->'criteria') = 'object'
       AND capture_snapshot->'criteria'->>'acknowledged' = 'true'
       AND length(capture_snapshot->'criteria'->>'name') > 0
       AND length(capture_snapshot->'criteria'->>'reference') > 0
       AND length(capture_snapshot->'criteria'->>'version') > 0
       AND length(capture_snapshot->'criteria'->>'approvedBy') > 0
       AND (capture_snapshot->'criteria'->>'maxOffsetM')::numeric > 0
       AND (capture_snapshot->'criteria'->>'minTiltRatio')::numeric > 0
       AND substring(tolerance_ratio FROM 3)::numeric = (capture_snapshot->'criteria'->>'minTiltRatio')::numeric)
    )
    AND (
      (capture_snapshot->'assessment'->>'tiltRatioKind' = 'unknown'
       AND capture_snapshot->'assessment'->>'tiltRatio' IS NULL
       AND capture_snapshot->'assessment'->>'heightM' IS NULL AND tilt_ratio IS NULL AND result = 'INFO')
      OR
      (capture_snapshot->'assessment'->>'tiltRatioKind' = 'infinite'
       AND capture_snapshot->'assessment'->>'tiltRatio' IS NULL
       AND (capture_snapshot->'assessment'->>'heightM')::numeric > 0
       AND (capture_snapshot->'assessment'->>'offsetM')::numeric = 0 AND tilt_ratio = '1:inf')
      OR
      (capture_snapshot->'assessment'->>'tiltRatioKind' = 'finite'
       AND (capture_snapshot->'assessment'->>'tiltRatio')::numeric > 0
       AND (capture_snapshot->'assessment'->>'heightM')::numeric > 0
       AND substring(tilt_ratio FROM 3)::numeric = round((capture_snapshot->'assessment'->>'tiltRatio')::numeric))
    )
  ) IS TRUE
);

-- DOWN: Recorded criteria/uncertainty evidence cannot be safely discarded.
DO $$ BEGIN
  RAISE EXCEPTION 'Migration 107 is evidence-forward-only; retain plumb snapshots and repair with a forward migration.' USING ERRCODE = '55000';
END; $$;
