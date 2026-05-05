-- ============================================================
-- Phase 25: Scheme / Large Project Architecture
-- Adds support for cadastral subdivision schemes (e.g. ward-level)
-- Self-hosted PostgreSQL on GCP VM — plain DDL, no RLS
-- ============================================================

-- 1. Add project_type column to existing projects table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'project_type'
  ) THEN
    ALTER TABLE projects ADD COLUMN project_type VARCHAR(20) NOT NULL DEFAULT 'small';
    COMMENT ON COLUMN projects.project_type IS 'small | scheme';
  END IF;
END $$;

-- 2. Create scheme_details table (1:1 with projects where project_type = 'scheme')
CREATE TABLE IF NOT EXISTS scheme_details (
  id            SERIAL PRIMARY KEY,
  project_id    INTEGER NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  scheme_number VARCHAR(50),
  county        VARCHAR(100),
  sub_county    VARCHAR(100),
  ward          VARCHAR(100),
  planned_parcels INTEGER DEFAULT 0,
  adjudication_section VARCHAR(100),
  status        VARCHAR(30) NOT NULL DEFAULT 'planning',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheme_details_project_id ON scheme_details(project_id);
CREATE INDEX IF NOT EXISTS idx_scheme_details_county ON scheme_details(county);

COMMENT ON TABLE scheme_details IS 'Extended metadata for scheme/large projects — cadastral subdivisions, adjudication schemes';
COMMENT ON COLUMN scheme_details.status IS 'planning | field_in_progress | computation | plan_generation | review | submitted | approved';

-- 3. Create blocks table (belongs to a project)
CREATE TABLE IF NOT EXISTS blocks (
  id            SERIAL PRIMARY KEY,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  block_number  VARCHAR(20) NOT NULL,
  block_name    VARCHAR(200),
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, block_number)
);

CREATE INDEX IF NOT EXISTS idx_blocks_project_id ON blocks(project_id);

COMMENT ON TABLE blocks IS 'Blocks within a scheme project — logical groupings of parcels (e.g. Block A, Block B)';

-- 4. Create parcels table (belongs to a block, which belongs to a project)
CREATE TABLE IF NOT EXISTS parcels (
  id                   SERIAL PRIMARY KEY,
  project_id           INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  block_id             INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  parcel_number        VARCHAR(30) NOT NULL,
  lr_number_proposed   VARCHAR(50),
  lr_number_confirmed  VARCHAR(50),
  area_ha              NUMERIC(12,4),
  status               VARCHAR(30) NOT NULL DEFAULT 'pending',
  assigned_surveyor    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(block_id, parcel_number)
);

CREATE INDEX IF NOT EXISTS idx_parcels_project_id ON parcels(project_id);
CREATE INDEX IF NOT EXISTS idx_parcels_block_id ON parcels(block_id);
CREATE INDEX IF NOT EXISTS idx_parcels_status ON parcels(status);
CREATE INDEX IF NOT EXISTS idx_parcels_assigned_surveyor ON parcels(assigned_surveyor);

COMMENT ON TABLE parcels IS 'Individual parcels within a block — each gets its own traverse, deed plan, and submission';
COMMENT ON COLUMN parcels.status IS 'pending | field_complete | computed | plan_generated | submitted | approved';

-- 5. Auto-update updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scheme_details_updated_at ON scheme_details;
CREATE TRIGGER trg_scheme_details_updated_at
  BEFORE UPDATE ON scheme_details
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_blocks_updated_at ON blocks;
CREATE TRIGGER trg_blocks_updated_at
  BEFORE UPDATE ON blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_parcels_updated_at ON parcels;
CREATE TRIGGER trg_parcels_updated_at
  BEFORE UPDATE ON parcels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
