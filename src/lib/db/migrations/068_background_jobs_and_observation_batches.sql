-- Migration 068: Background jobs survey expansion, observation batches, evidence events, and tolerance profiles
--
-- Blueprint reference:
--   §2.3 Raw observations are immutable
--   §5.2 Observe — observation batches and source metadata
--   §6.4 Observation batches (traceability, rollback, instrument link)
--   §14.3 Evidence events (append-only timeline)
--   §16 Tolerance profiles as versioned data
--   §21.5 Background jobs (PostgreSQL pattern with SKIP LOCKED, progress, project ownership)
--   §31 P0 Provenance and Background Jobs

-- ── 1. background_jobs expansion ─────────────────────────────────────────────

-- Remove obsolete check constraint on job_type if it exists
DO $$
BEGIN
  ALTER TABLE background_jobs DROP CONSTRAINT IF EXISTS background_jobs_job_type_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Add survey-specific job types check constraint
ALTER TABLE background_jobs
  ADD CONSTRAINT background_jobs_job_type_check
  CHECK (job_type IN (
    'pdf_generation', 'dxf_generation', 'shapefile_generation', 'report_processing',
    'payment_verification', 'email_notification', 'assemble_submission', 'traverse_compute',
    'earthworks_boq', 'large_import', 'topology_full_project', 'surface_build',
    'contour_generation', 'bulk_plan_generation', 'submission_assembly', 'large_dxf',
    'large_landxml', 'report_batch'
  ));

-- Add project ownership, progress, and idempotency
ALTER TABLE background_jobs
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  ADD COLUMN IF NOT EXISTS progress_message TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_background_jobs_project ON background_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_idempotency ON background_jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_background_jobs_pending_pull ON background_jobs(status, priority DESC, created_at ASC) WHERE status = 'pending';


-- ── 2. observation_batches (Blueprint §5.2, §6.4, §19) ──────────────────────

CREATE TABLE IF NOT EXISTS observation_batches (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  batch_number        VARCHAR(100) NOT NULL,
  source_type         VARCHAR(50) NOT NULL
                      CHECK (source_type IN (
                        'total_station', 'gnss_rtk', 'gnss_static', 'digital_level',
                        'auto_level', 'manual', 'import', 'uav_gcp', 'as_built'
                      )),
  source_file_name    VARCHAR(255),
  source_file_hash    VARCHAR(64), -- SHA-256 hex digest
  source_file_size    INT,
  operator            VARCHAR(200),
  crew                VARCHAR(100),
  instrument_id       UUID REFERENCES equipment(id) ON DELETE SET NULL,
  instrument_name     VARCHAR(200),
  instrument_serial   VARCHAR(100),
  station             VARCHAR(100),
  backsight           VARCHAR(100),
  instrument_height   NUMERIC(8,4),
  target_height       NUMERIC(8,4),
  prism_constant      NUMERIC(6,4),
  source_crs          VARCHAR(50),
  quality_metadata    JSONB DEFAULT '{}',
  point_count         INT DEFAULT 0,
  observation_count   INT DEFAULT 0,
  notes               TEXT,
  status              VARCHAR(50) DEFAULT 'raw'
                      CHECK (status IN ('raw', 'processed', 'adjusted', 'superseded', 'quarantined')),
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_project_batch_number UNIQUE (project_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_obs_batches_project ON observation_batches(project_id);
CREATE INDEX IF NOT EXISTS idx_obs_batches_hash ON observation_batches(source_file_hash) WHERE source_file_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_obs_batches_created ON observation_batches(project_id, created_at DESC);


-- ── 3. evidence_events (Blueprint §14.3, §19) ────────────────────────────────

CREATE TABLE IF NOT EXISTS evidence_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type     VARCHAR(50) NOT NULL,
  entity_id       VARCHAR(255) NOT NULL,
  event_type      VARCHAR(50) NOT NULL
                  CHECK (event_type IN (
                    'OBSERVED', 'IMPORTED', 'DERIVED', 'COMPUTED', 'ADJUSTED',
                    'QA_CHECKED', 'APPROVED', 'EXPORTED', 'SUPERSEDED'
                  )),
  details         JSONB NOT NULL DEFAULT '{}',
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  event_hash      VARCHAR(64) NOT NULL,
  previous_hash   VARCHAR(64),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_events_project ON evidence_events(project_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_evidence_events_entity ON evidence_events(project_id, entity_type, entity_id);


-- ── 4. tolerance_profiles (Blueprint §16, §19) ───────────────────────────────

CREATE TABLE IF NOT EXISTS tolerance_profiles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(100) NOT NULL,
  jurisdiction    VARCHAR(100) NOT NULL DEFAULT 'KENYA_CAP_299',
  version         VARCHAR(20) NOT NULL DEFAULT '1.0',
  description     TEXT,
  rules           JSONB NOT NULL,
  is_default      BOOLEAN DEFAULT FALSE,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tolerance_profiles_jurisdiction ON tolerance_profiles(jurisdiction);

-- Seed standard Kenya Survey Act Cap. 299 & RDM tolerance profiles
INSERT INTO tolerance_profiles (name, jurisdiction, version, description, rules, is_default)
VALUES (
  'Kenya Survey Regulations 1994 (Cadastral Standard)',
  'KENYA_CAP_299',
  '1994.1',
  'Survey of Kenya Regulations 1994 Chapter 299 standards for urban and rural cadastral surveys.',
  '{
    "traverse_angular_misclosure_arcsec": "60 * sqrt(n)",
    "traverse_linear_precision_class_a": "1:20000",
    "traverse_linear_precision_class_b": "1:10000",
    "traverse_linear_precision_class_c": "1:5000",
    "leveling_loop_misclosure_mm": "10 * sqrt(K)",
    "beacon_proximity_threshold_m": 0.01,
    "parcel_sliver_gap_threshold_m": 0.50,
    "coordinate_precision_decimals": 3,
    "area_ha_precision_decimals": 4
  }'::jsonb,
  TRUE
) ON CONFLICT DO NOTHING;
