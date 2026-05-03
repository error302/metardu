-- Phase 12: Field Projects
CREATE TABLE IF NOT EXISTS field_projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL, -- Replaced auth.uid() with standard UUID for next-auth
  name            TEXT NOT NULL,
  county_code     TEXT NOT NULL,
  parcel_number   TEXT,
  coordinate_system TEXT NOT NULL DEFAULT 'WGS84',
  beacons         JSONB NOT NULL DEFAULT '[]',
  parcels         JSONB NOT NULL DEFAULT '[]',
  synced_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Index for fast user lookups (RLS handled by app layer API proxy)
CREATE INDEX IF NOT EXISTS idx_field_projects_user ON field_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_field_projects_county ON field_projects(county_code);
