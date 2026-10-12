-- Preserve the fix accuracy supplied with each as-staked field observation.

-- UP:
ALTER TABLE setout_observations
  ADD COLUMN IF NOT EXISTS reported_accuracy_m NUMERIC(12,4);

COMMENT ON COLUMN setout_observations.reported_accuracy_m IS
  'Operator/device-reported horizontal fix accuracy in metres; NULL means no accuracy estimate was supplied.';

-- DOWN:
ALTER TABLE setout_observations
  DROP COLUMN IF EXISTS reported_accuracy_m;
