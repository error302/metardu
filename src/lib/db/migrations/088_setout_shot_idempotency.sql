-- Make device-first set-out retries safe after network loss or a lost response.

-- UP:
ALTER TABLE setout_observations
  ADD COLUMN IF NOT EXISTS client_shot_id VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS idx_setout_observations_client_shot
  ON setout_observations(project_id, client_shot_id)
  WHERE client_shot_id IS NOT NULL;

COMMENT ON COLUMN setout_observations.client_shot_id IS
  'Stable device-generated identifier used to replay offline set-out uploads without duplicating an immutable observation.';

-- DOWN:
DROP INDEX IF EXISTS idx_setout_observations_client_shot;
ALTER TABLE setout_observations
  DROP COLUMN IF EXISTS client_shot_id;
