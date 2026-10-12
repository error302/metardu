-- Durable, idempotent persistence for offline observations and original field photos.
-- Client-generated keys are unique within each project so retries cannot duplicate data.

CREATE TABLE IF NOT EXISTS survey_observations (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id             TEXT NOT NULL,
  point_id              TEXT,
  point_name            VARCHAR(100) NOT NULL,
  observation_type      VARCHAR(30) NOT NULL,
  northing              DOUBLE PRECISION,
  easting               DOUBLE PRECISION,
  elevation             DOUBLE PRECISION,
  latitude              DOUBLE PRECISION,
  longitude             DOUBLE PRECISION,
  accuracy              DOUBLE PRECISION,
  satellites            INTEGER,
  solution_type         VARCHAR(20),
  hdop                  DOUBLE PRECISION,
  vdop                  DOUBLE PRECISION,
  pdop                  DOUBLE PRECISION,
  instrument_height     DOUBLE PRECISION,
  rod_height            DOUBLE PRECISION,
  backsight             VARCHAR(100),
  foresight             VARCHAR(100),
  horizontal_angle      DOUBLE PRECISION,
  vertical_angle        DOUBLE PRECISION,
  slope_distance        DOUBLE PRECISION,
  temperature           DOUBLE PRECISION,
  pressure              DOUBLE PRECISION,
  humidity              DOUBLE PRECISION,
  weather               VARCHAR(100),
  notes                 TEXT,
  observed_at           TIMESTAMPTZ,
  synced_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_survey_observations_project_time
  ON survey_observations(project_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_survey_observations_point
  ON survey_observations(point_id);
CREATE INDEX IF NOT EXISTS idx_survey_observations_type
  ON survey_observations(observation_type);
CREATE INDEX IF NOT EXISTS idx_survey_observations_synced
  ON survey_observations(synced_at);

CREATE TABLE IF NOT EXISTS field_photos (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id             TEXT NOT NULL,
  observation_client_id TEXT,
  point_id              TEXT,
  point_name            VARCHAR(100),
  storage_path          TEXT NOT NULL UNIQUE,
  filename              VARCHAR(500),
  mime_type             VARCHAR(200),
  caption               TEXT,
  orientation           VARCHAR(20),
  captured_at           TIMESTAMPTZ,
  metadata              JSONB NOT NULL DEFAULT '{}',
  synced_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_field_photos_project_time
  ON field_photos(project_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_photos_observation
  ON field_photos(project_id, observation_client_id);
CREATE INDEX IF NOT EXISTS idx_field_photos_synced
  ON field_photos(synced_at);

ALTER TABLE survey_observations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_child_survey_observations ON survey_observations;
CREATE POLICY project_child_survey_observations ON survey_observations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = survey_observations.project_id
        AND (
          p.user_id::text = current_setting('request.user_id', true)
          OR EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = p.id
              AND pm.user_id::text = current_setting('request.user_id', true)
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = survey_observations.project_id
        AND (
          p.user_id::text = current_setting('request.user_id', true)
          OR EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = p.id
              AND pm.user_id::text = current_setting('request.user_id', true)
          )
        )
    )
  );

ALTER TABLE field_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_child_field_photos ON field_photos;
CREATE POLICY project_child_field_photos ON field_photos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = field_photos.project_id
        AND (
          p.user_id::text = current_setting('request.user_id', true)
          OR EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = p.id
              AND pm.user_id::text = current_setting('request.user_id', true)
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = field_photos.project_id
        AND (
          p.user_id::text = current_setting('request.user_id', true)
          OR EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = p.id
              AND pm.user_id::text = current_setting('request.user_id', true)
          )
        )
    )
  );

COMMENT ON TABLE survey_observations IS 'Offline-first field readings with retry-safe client identifiers; missing coordinates remain NULL.';
COMMENT ON TABLE field_photos IS 'Original field images linked to a project and optional offline observation; EXIF is descriptive and unverified.';
COMMENT ON COLUMN field_photos.captured_at IS 'Capture time only when explicitly recorded in image metadata; NULL does not mean upload time.';
COMMENT ON COLUMN field_photos.metadata IS 'Raw descriptive device metadata; not transformed into survey coordinates or control.';
