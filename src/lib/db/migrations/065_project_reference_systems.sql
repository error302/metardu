-- 065: project_reference_systems
--
-- Blueprint §4.2 / §19: every project owns its reference system, and no
-- exporter may hard-code a project CRS. Until now the platform had only the
-- denormalized projects.utm_zone / hemisphere / datum triple — no declared
-- horizontal code, no vertical datum, no grid/ground mode, no adopted
-- combined scale factor, no declaration provenance. The P0 CRS authority
-- (src/lib/spatial/projectCrs.ts) refuses to compute without an explicit
-- horizontal CRS; this table is where that declaration is persisted.
--
-- One row per project (UNIQUE project_id): the current declaration.
-- Re-declaring overwrites — every declaration is itself recorded through
-- declared_by / declared_at.
--
-- No silent defaults: distance_mode and coordinate_precision are NOT NULL
-- (their visible defaults are chosen by the surveyor in settings and written
-- explicitly); the horizontal code, datum, and units are resolved from the
-- CRS registry by src/lib/spatial/projectReferenceSystem.ts, never guessed.
-- combined_scale_factor is NULL when the project computes factors per point.

CREATE TABLE IF NOT EXISTS project_reference_systems (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id              UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,

  -- Horizontal (blueprint 4.2 block 1) — authority code + resolved metadata
  horizontal_crs          VARCHAR(20)  NOT NULL
                            CHECK (horizontal_crs <> ''),
  horizontal_name         VARCHAR(200) NOT NULL
                            CHECK (horizontal_name <> ''),
  datum_name              VARCHAR(60)  NOT NULL,
  units                   VARCHAR(20)  NOT NULL CHECK (units IN ('metres')),
  zone                    SMALLINT CHECK (zone >= 1 AND zone <= 60),
  hemisphere              VARCHAR(1)   CHECK (hemisphere IN ('N', 'S')),

  -- Vertical (blueprint 4.2 block 2)
  vertical_datum          VARCHAR(120),
  vertical_reference      VARCHAR(20)
                            CHECK (vertical_reference IS NULL OR
                                   vertical_reference IN ('orthometric', 'ellipsoidal', 'trig', 'local')),
  geoid_model             VARCHAR(120),
  benchmark_basis         TEXT,

  -- Site calibration (blueprint 4.2 block 3)
  calibration_version     VARCHAR(60),
  calibration_notes       TEXT,

  -- Grid/ground mode + adopted factor + precision (blueprint 4.2 block 4)
  distance_mode           VARCHAR(10) NOT NULL
                            CHECK (distance_mode IN ('grid', 'ground')),
  combined_scale_factor   DOUBLE PRECISION
                            CHECK (combined_scale_factor IS NULL OR combined_scale_factor > 0),
  csf_provenance          VARCHAR(20)
                            CHECK (csf_provenance IS NULL OR
                                   csf_provenance IN ('computed', 'surveyor')),
  csf_reference_easting   DOUBLE PRECISION,
  csf_reference_northing  DOUBLE PRECISION,
  csf_reference_height    DOUBLE PRECISION,
  coordinate_precision    SMALLINT NOT NULL
                            CHECK (coordinate_precision >= 0 AND coordinate_precision <= 6),

  -- Provenance
  notes                   TEXT,
  declared_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  declared_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_reference_systems_project
  ON project_reference_systems(project_id);

COMMENT ON TABLE project_reference_systems IS
  'The declared reference system of a project (blueprint §4.2): horizontal CRS, vertical datum, site calibration, grid/ground mode, adopted combined scale factor, coordinate precision. One current declaration per project.';
COMMENT ON COLUMN project_reference_systems.horizontal_crs IS
  'Authority code resolved from the CRS registry (e.g. EPSG:21037). Never defaulted — a project without a row has NO declared CRS.';
COMMENT ON COLUMN project_reference_systems.combined_scale_factor IS
  'Adopted project combined scale factor (k x elevation factor). NULL = compute per point from coordinates and heights.';
COMMENT ON COLUMN project_reference_systems.csf_provenance IS
  'computed = derived from coordinates via the CRS authority; surveyor = adopted from field/office evidence. NULL when no factor is adopted.';
COMMENT ON COLUMN project_reference_systems.coordinate_precision IS
  'Coordinate display precision in decimals (0-6). Visible default 3.';

-- DOWN: DROP TABLE IF EXISTS project_reference_systems;
