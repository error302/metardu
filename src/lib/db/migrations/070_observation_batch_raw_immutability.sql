-- Migration 070: protect the original metadata and source digest of an
-- observation batch after it has been registered. Processing state may change;
-- a corrected observation must be recorded in a new batch.
-- UP:
CREATE OR REPLACE FUNCTION guard_observation_batch_raw_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Comparing the complete row makes newly added provenance columns immutable
  -- by default. Only workflow state and its timestamp remain editable.
  IF (to_jsonb(NEW) - 'status' - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'Observation batch source and raw metadata are immutable; create a new batch for corrections'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS observation_batch_raw_immutable ON observation_batches;
CREATE TRIGGER observation_batch_raw_immutable
  BEFORE UPDATE ON observation_batches
  FOR EACH ROW
  EXECUTE FUNCTION guard_observation_batch_raw_update();

-- DOWN: DROP TRIGGER observation_batch_raw_immutable ON observation_batches;
-- DOWN: DROP FUNCTION guard_observation_batch_raw_update();
