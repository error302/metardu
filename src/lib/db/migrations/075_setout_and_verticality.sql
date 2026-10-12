-- Project-level setting out (blueprint §11, §9.5, §19, §27).
--
-- Setting out existed only as a standalone calculator: the grid definition and
-- every stake record lived in React state inside one component, the panel was
-- mounted without a projectId, and there was no stake register and no
-- verticality capture at all. A surveyor setting out a building therefore had
-- to keep the register on paper and could not record an as-staked shot or
-- prove a plumb check afterwards.
--
-- These tables make set-out a project activity with evidence:
--   setout_definitions  the design (grid, origin, rotation, pile type)
--   setout_points       the derived design coordinates (revisioned)
--   setout_observations as-staked shots: design vs observed, with tolerance
--   verticality_readings base/top centre captures for column plumb checks

CREATE TABLE IF NOT EXISTS setout_definitions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            VARCHAR(150) NOT NULL,
  structure_type  VARCHAR(40) NOT NULL DEFAULT 'pile'
                  CHECK (structure_type IN ('pile', 'column', 'pier', 'abutment', 'grid_point', 'foundation')),
  origin_easting  NUMERIC(14,3) NOT NULL,
  origin_northing NUMERIC(14,3) NOT NULL,
  origin_rl       NUMERIC(10,3),
  rows            INTEGER NOT NULL DEFAULT 1 CHECK (rows > 0),
  columns         INTEGER NOT NULL DEFAULT 1 CHECK (columns > 0),
  row_spacing     NUMERIC(10,3) NOT NULL,
  column_spacing  NUMERIC(10,3) NOT NULL,
  rotation        NUMERIC(8,4) NOT NULL DEFAULT 0,
  start_label     VARCHAR(20) NOT NULL DEFAULT 'A',
  label_rows_as   VARCHAR(10) NOT NULL DEFAULT 'alpha',
  label_columns_as VARCHAR(10) NOT NULL DEFAULT 'alpha',
  pile_diameter_mm INTEGER,
  depth_m         NUMERIC(8,3),
  crs             VARCHAR(32),
  status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                  CHECK (status IN ('DRAFT', 'COMPUTED', 'IN_PROGRESS', 'COMPLETE', 'SUPERSEDED')),
  tolerance_profile_id UUID REFERENCES tolerance_profiles(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_setout_definitions_project ON setout_definitions(project_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_setout_definitions_active
  ON setout_definitions(project_id, name)
  WHERE status <> 'SUPERSEDED';

-- Design coordinates derived from a definition. Rows carry the revision so a
-- later edit never rewrites what was staked against.
CREATE TABLE IF NOT EXISTS setout_points (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  definition_id   UUID NOT NULL REFERENCES setout_definitions(id) ON DELETE CASCADE,
  revision        INTEGER NOT NULL DEFAULT 1,
  label           VARCHAR(40) NOT NULL,
  row_index       INTEGER,
  column_index    INTEGER,
  easting         NUMERIC(14,3) NOT NULL,
  northing        NUMERIC(14,3) NOT NULL,
  design_rl       NUMERIC(10,3),
  point_type      VARCHAR(40) NOT NULL DEFAULT 'pile',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (definition_id, revision, label)
);

CREATE INDEX IF NOT EXISTS idx_setout_points_lookup
  ON setout_points(definition_id, revision, label);

-- As-staked observations: what the surveyor saw, judged against design.
CREATE TABLE IF NOT EXISTS setout_observations (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id         UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  definition_id      UUID NOT NULL REFERENCES setout_definitions(id) ON DELETE CASCADE,
  setout_point_id    UUID REFERENCES setout_points(id) ON DELETE SET NULL,
  label              VARCHAR(40) NOT NULL,
  design_easting     NUMERIC(14,3) NOT NULL,
  design_northing    NUMERIC(14,3) NOT NULL,
  design_rl          NUMERIC(10,3),
  observed_easting   NUMERIC(14,3) NOT NULL,
  observed_northing  NUMERIC(14,3) NOT NULL,
  observed_rl        NUMERIC(10,3),
  d_e                NUMERIC(12,4),
  d_n                NUMERIC(12,4),
  d_z                NUMERIC(12,4),
  horizontal_error   NUMERIC(12,4),
  vertical_error     NUMERIC(12,4),
  tolerance_profile_id UUID REFERENCES tolerance_profiles(id) ON DELETE SET NULL,
  tolerance_version  VARCHAR(20),
  threshold_h        NUMERIC(10,4),
  threshold_v        NUMERIC(10,4),
  result             VARCHAR(10) NOT NULL DEFAULT 'INFO'
                     CHECK (result IN ('PASS', 'WARN', 'FAIL', 'INFO')),
  instrument         VARCHAR(150),
  instrument_serial  VARCHAR(100),
  operator_name      VARCHAR(150),
  crew               VARCHAR(150),
  observation_batch_id UUID,
  staked_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  staked_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_setout_observations_project
  ON setout_observations(project_id, staked_at DESC);
CREATE INDEX IF NOT EXISTS idx_setout_observations_point
  ON setout_observations(definition_id, label, staked_at DESC);

-- Several shots may exist per point (a re-stake after a FAIL); the register
-- reads the latest, and the history is kept.

-- Column plumb check: base centre and top centre for the same column.
CREATE TABLE IF NOT EXISTS verticality_readings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  definition_id     UUID REFERENCES setout_definitions(id) ON DELETE SET NULL,
  label             VARCHAR(40) NOT NULL,
  level             VARCHAR(40),
  base_easting      NUMERIC(14,3) NOT NULL,
  base_northing     NUMERIC(14,3) NOT NULL,
  base_rl           NUMERIC(10,3),
  top_easting       NUMERIC(14,3) NOT NULL,
  top_northing      NUMERIC(14,3) NOT NULL,
  top_rl            NUMERIC(10,3),
  offset_h          NUMERIC(12,4),      -- computed: horizontal offset over the height
  tilt_ratio        VARCHAR(20),        -- computed: e.g. "1:850"
  tolerance_ratio   VARCHAR(20),
  result            VARCHAR(10) NOT NULL DEFAULT 'INFO'
                    CHECK (result IN ('PASS', 'WARN', 'FAIL', 'INFO')),
  instrument        VARCHAR(150),
  observed_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  observed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verticality_project
  ON verticality_readings(project_id, label, observed_at DESC);

-- An as-staked record is evidence: it may be superseded by a re-stake, never
-- edited in place (blueprint §2.3 / §28).
CREATE OR REPLACE FUNCTION reject_setout_observation_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'as-staked observations are append-only: record a re-stake instead of editing the original';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS setout_observations_immutable ON setout_observations;
CREATE TRIGGER setout_observations_immutable
  BEFORE UPDATE OR DELETE ON setout_observations
  FOR EACH ROW EXECUTE FUNCTION reject_setout_observation_update();

CREATE OR REPLACE FUNCTION reject_verticality_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'verticality readings are append-only evidence';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS verticality_readings_immutable ON verticality_readings;
CREATE TRIGGER verticality_readings_immutable
  BEFORE UPDATE OR DELETE ON verticality_readings
  FOR EACH ROW EXECUTE FUNCTION reject_verticality_update();