-- ============================================================
-- Phase 27: Parcel Traverse Computation
-- Stores traverse data per parcel with computation results
-- Self-hosted PostgreSQL on GCP VM
-- ============================================================

-- 1. Parcel traverses (one per parcel)
CREATE TABLE IF NOT EXISTS parcel_traverses (
  id              SERIAL PRIMARY KEY,
  parcel_id       INTEGER NOT NULL UNIQUE REFERENCES parcels(id) ON DELETE CASCADE,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  opening_station VARCHAR(50) NOT NULL,
  closing_station  VARCHAR(50),
  opening_easting  NUMERIC(12,4) NOT NULL,
  opening_northing NUMERIC(12,4) NOT NULL,
  opening_rl       NUMERIC(10,4),
  closing_easting  NUMERIC(12,4),
  closing_northing NUMERIC(12,4),
  backsight_bearing NUMERIC(10,6),
  is_closed       BOOLEAN NOT NULL DEFAULT FALSE,
  total_perimeter  NUMERIC(12,4),
  linear_error    NUMERIC(10,6),
  precision_ratio NUMERIC(12,1),
  accuracy_order  VARCHAR(50),
  computed_area_ha NUMERIC(12,6),
  status          VARCHAR(30) NOT NULL DEFAULT 'draft',
  -- Status: draft | computed | needs_review | approved
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parcel_traverses_parcel_id ON parcel_traverses(parcel_id);
CREATE INDEX IF NOT EXISTS idx_parcel_traverses_project_id ON parcel_traverses(project_id);
CREATE INDEX IF NOT EXISTS idx_parcel_traverses_status ON parcel_traverses(status);

-- 2. Traverse observations (many per parcel_traverse)
CREATE TABLE IF NOT EXISTS traverse_observations (
  id              SERIAL PRIMARY KEY,
  traverse_id     INTEGER NOT NULL REFERENCES parcel_traverses(id) ON DELETE CASCADE,
  observation_order INTEGER NOT NULL,
  station         VARCHAR(50) NOT NULL,
  bs              VARCHAR(50) NOT NULL,
  fs              VARCHAR(50) NOT NULL,
  hcl_deg         INTEGER DEFAULT 0,
  hcl_min         INTEGER DEFAULT 0,
  hcl_sec         NUMERIC(6,3) DEFAULT 0,
  hcr_deg         INTEGER DEFAULT 0,
  hcr_min         INTEGER DEFAULT 0,
  hcr_sec         NUMERIC(6,3) DEFAULT 0,
  slope_dist      NUMERIC(10,4),
  va_deg          INTEGER DEFAULT 0,
  va_min          INTEGER DEFAULT 0,
  va_sec          NUMERIC(6,3) DEFAULT 0,
  ih              NUMERIC(8,4) DEFAULT 0,
  th              NUMERIC(8,4) DEFAULT 0,
  remarks         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_traverse_observations_traverse_id ON traverse_observations(traverse_id);

-- 3. Traverse computation results (computed coordinates per station)
CREATE TABLE IF NOT EXISTS traverse_coordinates (
  id              SERIAL PRIMARY KEY,
  traverse_id     INTEGER NOT NULL REFERENCES parcel_traverses(id) ON DELETE CASCADE,
  station         VARCHAR(50) NOT NULL,
  easting         NUMERIC(12,4) NOT NULL,
  northing        NUMERIC(12,4) NOT NULL,
  rl              NUMERIC(10,4),
  UNIQUE(traverse_id, station)
);

CREATE INDEX IF NOT EXISTS idx_traverse_coordinates_traverse_id ON traverse_coordinates(traverse_id);

-- 4. Auto-update triggers
DROP TRIGGER IF EXISTS trg_parcel_traverses_updated_at ON parcel_traverses;
CREATE TRIGGER trg_parcel_traverses_updated_at
  BEFORE UPDATE ON parcel_traverses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
