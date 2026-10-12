-- Preserve source and coordinate-reference evidence for offline field captures.
-- Raw GNSS latitude/longitude remains EPSG:4326 until a reviewed project-grid
-- transformation is explicitly performed.

ALTER TABLE survey_observations
  ADD COLUMN IF NOT EXISTS horizontal_crs VARCHAR(64),
  ADD COLUMN IF NOT EXISTS vertical_datum VARCHAR(120),
  ADD COLUMN IF NOT EXISTS fix_quality SMALLINT,
  ADD COLUMN IF NOT EXISTS accuracy_source VARCHAR(20),
  ADD COLUMN IF NOT EXISTS instrument_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS observation_source VARCHAR(32);

COMMENT ON COLUMN survey_observations.horizontal_crs IS
  'CRS of the stored horizontal coordinates; raw receiver latitude/longitude is EPSG:4326.';
COMMENT ON COLUMN survey_observations.vertical_datum IS
  'Vertical reference as reported or explicitly established; NULL means unknown.';
COMMENT ON COLUMN survey_observations.fix_quality IS
  'Raw receiver fix-quality code. Never infer this value from a browser accuracy estimate.';
COMMENT ON COLUMN survey_observations.accuracy_source IS
  'Provenance for the accuracy estimate: receiver, browser, or unknown.';
COMMENT ON COLUMN survey_observations.instrument_name IS
  'Instrument name reported by the connected device when available.';
COMMENT ON COLUMN survey_observations.observation_source IS
  'Capture source such as gnss_receiver, browser_geolocation, or total_station.';

-- DOWN
-- Manual rollback only: these columns retain instrument and coordinate
-- provenance for collected observations. Dropping them would destroy evidence;
-- use a forward fix if application code needs correction.
