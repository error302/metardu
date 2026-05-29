-- ═══════════════════════════════════════════════════════════════════════════════
-- METARDU CANONICAL SCHEMA — Migration 000
-- ─────────────────────────────────────────────────────────────────────────────
-- This is the ONE source of truth for all database tables.
-- All PKs use UUID. All project children have ON DELETE CASCADE.
-- No auth.uid() references — uses direct user_id checks for self-hosted NextAuth.
-- Idempotent: uses CREATE TABLE IF NOT EXISTS throughout.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Auto-update updated_at trigger function ───────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- CORE TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Users — the root identity table (self-hosted NextAuth, NOT auth.users)
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     VARCHAR(255),
  isk_number    VARCHAR(50),
  verified_isk  BOOLEAN DEFAULT FALSE,
  role          VARCHAR(50) DEFAULT 'user',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Profiles — 1:1 extension of users
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name     VARCHAR(255),
  firm_name     VARCHAR(255),
  isk_number    VARCHAR(50),
  phone         VARCHAR(50),
  address       TEXT,
  bio           TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Surveyor profiles — extended role/verification info
CREATE TABLE IF NOT EXISTS surveyor_profiles (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  role             VARCHAR(20) DEFAULT 'surveyor' CHECK (role IN ('admin', 'surveyor', 'auditor', 'viewer')),
  isk_number       VARCHAR(50),
  verified_isk     BOOLEAN DEFAULT FALSE,
  is_suspended     BOOLEAN DEFAULT FALSE,
  suspension_reason TEXT,
  last_active_at   TIMESTAMPTZ,
  firm_name        VARCHAR(255),
  license_number   VARCHAR(100),
  phone            VARCHAR(50),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Projects — the central entity
CREATE TABLE IF NOT EXISTS projects (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                   VARCHAR(255) NOT NULL,
  survey_type            VARCHAR(100),
  client_name            VARCHAR(255),
  location               TEXT,
  lr_number              VARCHAR(100),
  folio_number           VARCHAR(100),
  register_number        VARCHAR(100),
  fir_number             VARCHAR(100),
  registration_block     VARCHAR(100),
  registration_district  VARCHAR(100),
  locality               VARCHAR(255),
  computations_no        VARCHAR(100),
  field_book_no          VARCHAR(100),
  file_reference         VARCHAR(100),
  ref_no                 VARCHAR(100),
  survey_date            TIMESTAMPTZ,
  area_ha                DOUBLE PRECISION,
  utm_zone               INTEGER DEFAULT 37,
  hemisphere             VARCHAR(1) DEFAULT 'S',
  datum                  VARCHAR(50) DEFAULT 'Arc 1960',
  boundary_data          JSONB,
  user_id                UUID REFERENCES users(id) ON DELETE CASCADE,
  last_fieldbook_update  TIMESTAMPTZ,
  status                 VARCHAR(50) DEFAULT 'active',
  project_type           VARCHAR(20) DEFAULT 'small',
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SCHEME / SUBDIVISION TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS scheme_details (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id           UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scheme_number        VARCHAR(50),
  county               VARCHAR(100),
  sub_county           VARCHAR(100),
  ward                 VARCHAR(100),
  planned_parcels      INTEGER,
  adjudication_section VARCHAR(100),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blocks (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  block_number  VARCHAR(20) NOT NULL,
  description   TEXT,
  area_ha       NUMERIC(12,6),
  geom          GEOMETRY(POLYGON, 21037),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parcels (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  block_id            UUID REFERENCES blocks(id) ON DELETE CASCADE,
  parcel_number       VARCHAR(30) NOT NULL,
  lr_number_proposed  VARCHAR(50),
  lr_number_confirmed VARCHAR(50),
  area_ha             NUMERIC(12,6),
  status              VARCHAR(30) DEFAULT 'pending',
  assigned_surveyor   UUID REFERENCES users(id) ON DELETE SET NULL,
  notes               TEXT,
  revision_number     INTEGER DEFAULT 1,
  geom                GEOMETRY(POLYGON, 21037),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRAVERSE TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS parcel_traverses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parcel_id       UUID NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  traverse_name   VARCHAR(200),
  traverse_type   VARCHAR(50),
  version         INTEGER DEFAULT 1,
  status          VARCHAR(30) DEFAULT 'draft',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS traverse_observations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  traverse_id   UUID NOT NULL REFERENCES parcel_traverses(id) ON DELETE CASCADE,
  station_from  VARCHAR(50),
  station_to    VARCHAR(50),
  bearing       DOUBLE PRECISION,
  distance      DOUBLE PRECISION,
  face          VARCHAR(10),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS traverse_coordinates (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  traverse_id   UUID NOT NULL REFERENCES parcel_traverses(id) ON DELETE CASCADE,
  station_name  VARCHAR(50),
  easting       NUMERIC(12,3),
  northing      NUMERIC(12,3),
  elevation     DOUBLE PRECISION,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS traverse_history (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parcel_traverse_id  UUID NOT NULL REFERENCES parcel_traverses(id) ON DELETE CASCADE,
  version             INTEGER NOT NULL,
  snapshot            JSONB,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- LEVEL NETWORK TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS level_networks (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id         UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  network_name       VARCHAR(200),
  adjustment_method  VARCHAR(50),
  status             VARCHAR(30) DEFAULT 'pending',
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS level_control_points (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  network_id      UUID NOT NULL REFERENCES level_networks(id) ON DELETE CASCADE,
  point_name      VARCHAR(100),
  known_elevation DOUBLE PRECISION,
  easting         DOUBLE PRECISION,
  northing        DOUBLE PRECISION,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS level_observations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  network_id      UUID NOT NULL REFERENCES level_networks(id) ON DELETE CASCADE,
  from_point      VARCHAR(100),
  to_point        VARCHAR(100),
  observed_diff   DOUBLE PRECISION,
  distance        DOUBLE PRECISION,
  num_setups      INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS level_adjustment_results (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  network_id          UUID NOT NULL REFERENCES level_networks(id) ON DELETE CASCADE,
  adjusted_points     JSONB,
  misclosure          DOUBLE PRECISION,
  adjustment_summary  JSONB,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROAD ENGINEERING TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS road_alignments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  alignment_name  VARCHAR(255),
  start_chainage  DOUBLE PRECISION,
  end_chainage    DOUBLE PRECISION,
  design_speed    DOUBLE PRECISION,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alignment_ips (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alignment_id    UUID NOT NULL REFERENCES road_alignments(id) ON DELETE CASCADE,
  ip_number       INTEGER,
  chainage        DOUBLE PRECISION,
  easting         DOUBLE PRECISION,
  northing        DOUBLE PRECISION,
  elevation       DOUBLE PRECISION,
  radius          DOUBLE PRECISION,
  geom            GEOMETRY(POINT, 21037),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alignment_vertical_ips (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alignment_id    UUID NOT NULL REFERENCES road_alignments(id) ON DELETE CASCADE,
  ip_number       INTEGER,
  chainage        DOUBLE PRECISION,
  elevation       DOUBLE PRECISION,
  gradient_in     DOUBLE PRECISION,
  gradient_out    DOUBLE PRECISION,
  curve_length    DOUBLE PRECISION,
  geom            GEOMETRY(POINT, 21037),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cross_section_stations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alignment_id    UUID NOT NULL REFERENCES road_alignments(id) ON DELETE CASCADE,
  chainage        DOUBLE PRECISION,
  existing_ground JSONB,
  proposed_road   JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS earthworks_results (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alignment_id     UUID NOT NULL REFERENCES road_alignments(id) ON DELETE CASCADE,
  chainage         DOUBLE PRECISION,
  cut_area         DOUBLE PRECISION,
  fill_area        DOUBLE PRECISION,
  cut_volume       DOUBLE PRECISION,
  fill_volume      DOUBLE PRECISION,
  cumulative_cut   DOUBLE PRECISION,
  cumulative_fill  DOUBLE PRECISION,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS road_reserve_parcels (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alignment_id    UUID NOT NULL REFERENCES road_alignments(id) ON DELETE CASCADE,
  parcel_number   VARCHAR(100),
  area_ha         DOUBLE PRECISION,
  geom            GEOMETRY(POLYGON, 21037),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROJECT DIRECT CHILDREN
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS project_fieldbook_entries (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  row_index         INTEGER NOT NULL,
  station           VARCHAR(100),
  bearing           DOUBLE PRECISION DEFAULT 0,
  distance          DOUBLE PRECISION DEFAULT 0,
  raw_data          JSONB,
  import_session_id UUID,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, row_index)
);

CREATE TABLE IF NOT EXISTS survey_points (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  point_name    VARCHAR(100),
  easting       DOUBLE PRECISION,
  northing      DOUBLE PRECISION,
  elevation     DOUBLE PRECISION,
  description   TEXT,
  code          VARCHAR(20),
  geom          GEOMETRY(POINT, 4326),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS network_adjustments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stations          JSONB,
  observations      JSONB,
  adjusted_stations JSONB,
  summary           JSONB,
  status            VARCHAR(50),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mining_surveys (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mine_type           VARCHAR(100),
  sections            JSONB,
  grid_points         JSONB,
  material_density_tm3 DOUBLE PRECISION DEFAULT 1.8,
  material_type       VARCHAR(100),
  volume_result       JSONB,
  status              VARCHAR(50),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hydro_surveys (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sounding_data   JSONB,
  water_level     DOUBLE PRECISION,
  chart_datum     DOUBLE PRECISION,
  survey_date     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gnss_sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id),
  status        VARCHAR(50),
  input_files   JSONB,
  results       JSONB,
  error_msg     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS import_sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name     VARCHAR(255),
  format        VARCHAR(50),
  row_count     INTEGER,
  status        VARCHAR(50),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signatures (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id),
  signature_data TEXT,
  document_type VARCHAR(100),
  signed_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_members (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          VARCHAR(50) DEFAULT 'viewer',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE TABLE IF NOT EXISTS scheme_activity_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  action        VARCHAR(50) NOT NULL,
  details       JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS block_assignments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  block_id      UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  assigned_to   UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  status        VARCHAR(30) DEFAULT 'pending',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SUBMISSIONS (correct UUID schema — NOT the broken SERIAL one from phase28)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS submissions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id       UUID REFERENCES projects(id) ON DELETE CASCADE,
  submission_type  VARCHAR(50),
  status           VARCHAR(30) DEFAULT 'draft',
  submitted_at     TIMESTAMPTZ,
  reviewed_at      TIMESTAMPTZ,
  reviewer_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  notes            TEXT,
  revision_number  INTEGER DEFAULT 1,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supporting_documents (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id  UUID REFERENCES submissions(id) ON DELETE CASCADE,
  project_id     UUID REFERENCES projects(id) ON DELETE CASCADE,
  document_type  VARCHAR(100),
  file_name      VARCHAR(255),
  file_url       TEXT,
  file_size      BIGINT,
  mime_type      VARCHAR(100),
  uploaded_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_submissions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id       UUID REFERENCES projects(id) ON DELETE CASCADE,
  submission_id    UUID REFERENCES submissions(id) ON DELETE CASCADE,
  document_category VARCHAR(100),
  status           VARCHAR(30) DEFAULT 'pending',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS submission_documents (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id     UUID REFERENCES projects(id) ON DELETE CASCADE,
  submission_id  UUID REFERENCES submissions(id) ON DELETE CASCADE,
  document_type  VARCHAR(100),
  file_name      VARCHAR(255),
  file_data      TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PUBLIC BEACONS (the missing table!)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public_beacons (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL,
  beacon_type   VARCHAR(50),
  easting       DOUBLE PRECISION,
  northing      DOUBLE PRECISION,
  elevation     DOUBLE PRECISION,
  datum         VARCHAR(50) DEFAULT 'Arc 1960',
  srid          INTEGER DEFAULT 21037,
  county        VARCHAR(100),
  description   TEXT,
  status        VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  submitted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at   TIMESTAMPTZ,
  geom          GEOMETRY(POINT, 21037),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- BUSINESS TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS equipment (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                   VARCHAR(255) NOT NULL,
  type                   VARCHAR(100),
  serial_number          VARCHAR(255),
  last_calibration_date  TIMESTAMPTZ,
  interval_days          INTEGER DEFAULT 365,
  user_id                UUID REFERENCES users(id) ON DELETE SET NULL,
  owner_id               UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS benchmarks (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) NOT NULL,
  easting       DOUBLE PRECISION,
  northing      DOUBLE PRECISION,
  elevation     DOUBLE PRECISION,
  datum         VARCHAR(50),
  description   TEXT,
  geom          GEOMETRY(POINT, 4326),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action        VARCHAR(255),
  table_name    VARCHAR(255),
  record_id     UUID,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  details       JSONB,
  ip_address    VARCHAR(45),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS online_service_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id),
  project_id      UUID,
  service         VARCHAR(100),
  input_summary   TEXT,
  status          VARCHAR(50) DEFAULT 'success',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_standards (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country         VARCHAR(10),
  standard_name   VARCHAR(255),
  description     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan_id               VARCHAR(50) DEFAULT 'free',
  status                VARCHAR(50) DEFAULT 'active',
  trial_ends_at         TIMESTAMPTZ,
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  payment_method        VARCHAR(50),
  currency              VARCHAR(10) DEFAULT 'KES',
  stripe_customer_id    VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS field_projects (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL,
  project_name    VARCHAR(255),
  county_code     VARCHAR(20),
  beacons         JSONB DEFAULT '[]',
  parcels         JSONB DEFAULT '[]',
  centroid_geom   GEOMETRY(POINT, 4326),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS government_audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action        VARCHAR(100) NOT NULL,
  table_name    VARCHAR(100),
  record_id     UUID,
  user_id       UUID,
  details       JSONB,
  ip_address    VARCHAR(45),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- DOCUMENT GENERATION TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS deed_plans (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  plan_number   VARCHAR(100),
  plan_type     VARCHAR(50),
  status        VARCHAR(30) DEFAULT 'draft',
  generated_at  TIMESTAMPTZ,
  pdf_url       TEXT,
  dxf_url       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_reports (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_type   VARCHAR(100),
  status        VARCHAR(30) DEFAULT 'draft',
  generated_at  TIMESTAMPTZ,
  pdf_url       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leveling_runs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_name      VARCHAR(200),
  method        VARCHAR(50),
  status        VARCHAR(30),
  data          JSONB,
  results       JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PAYMENT TRACKING
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  project_id      UUID,
  amount          NUMERIC(12,2),
  currency        VARCHAR(10),
  payment_method  VARCHAR(50),
  provider        VARCHAR(50),
  provider_id     VARCHAR(255),
  status          VARCHAR(30) DEFAULT 'pending',
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SURVEY EXTRAS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS survey_photos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name     VARCHAR(255),
  file_url      TEXT,
  description   TEXT,
  taken_at      TIMESTAMPTZ,
  geom          GEOMETRY(POINT, 4326),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_epochs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  epoch_name    VARCHAR(100),
  epoch_date    DATE,
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rim_sections (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section_number  VARCHAR(50),
  sheet_number    VARCHAR(50),
  scale           VARCHAR(20),
  geom            GEOMETRY(POLYGON, 21037),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alignments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  alignment_name  VARCHAR(200),
  alignment_type  VARCHAR(50),
  data            JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cross_sections (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  station       DOUBLE PRECISION,
  data          JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- DOCUMENT & REVIEW
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS document_signatures (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_type VARCHAR(100),
  document_id   UUID,
  signer_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  signature_data TEXT,
  signed_at     TIMESTAMPTZ,
  status        VARCHAR(20) DEFAULT 'pending',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS peer_review_requests (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requester_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewer_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  status         VARCHAR(20) DEFAULT 'pending',
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS traverse_results (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  traverse_name   VARCHAR(200),
  method          VARCHAR(50),
  data            JSONB,
  results         JSONB,
  status          VARCHAR(30),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Core
CREATE INDEX IF NOT EXISTS idx_users_email        ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role          ON users(role);
CREATE INDEX IF NOT EXISTS idx_projects_user_id    ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status     ON projects(status);
CREATE INDEX IF NOT EXISTS idx_surveyor_profiles_user_id ON surveyor_profiles(user_id);

-- Scheme/subdivision
CREATE INDEX IF NOT EXISTS idx_scheme_details_project_id ON scheme_details(project_id);
CREATE INDEX IF NOT EXISTS idx_blocks_project_id        ON blocks(project_id);
CREATE INDEX IF NOT EXISTS idx_parcels_project_id       ON parcels(project_id);
CREATE INDEX IF NOT EXISTS idx_parcels_block_id         ON parcels(block_id);
CREATE INDEX IF NOT EXISTS idx_parcels_status           ON parcels(status);

-- Traverse
CREATE INDEX IF NOT EXISTS idx_parcel_traverses_project_id ON parcel_traverses(project_id);
CREATE INDEX IF NOT EXISTS idx_parcel_traverses_parcel_id  ON parcel_traverses(parcel_id);
CREATE INDEX IF NOT EXISTS idx_traverse_observations_traverse_id ON traverse_observations(traverse_id);
CREATE INDEX IF NOT EXISTS idx_traverse_coordinates_traverse_id  ON traverse_coordinates(traverse_id);
CREATE INDEX IF NOT EXISTS idx_traverse_history_parcel_traverse_id ON traverse_history(parcel_traverse_id);

-- Level network
CREATE INDEX IF NOT EXISTS idx_level_networks_project_id          ON level_networks(project_id);
CREATE INDEX IF NOT EXISTS idx_level_control_points_network_id    ON level_control_points(network_id);
CREATE INDEX IF NOT EXISTS idx_level_observations_network_id      ON level_observations(network_id);
CREATE INDEX IF NOT EXISTS idx_level_adjustment_results_network_id ON level_adjustment_results(network_id);

-- Road engineering
CREATE INDEX IF NOT EXISTS idx_road_alignments_project_id   ON road_alignments(project_id);
CREATE INDEX IF NOT EXISTS idx_alignment_ips_alignment_id   ON alignment_ips(alignment_id);
CREATE INDEX IF NOT EXISTS idx_alignment_vertical_ips_alignment_id ON alignment_vertical_ips(alignment_id);
CREATE INDEX IF NOT EXISTS idx_cross_section_stations_alignment_id ON cross_section_stations(alignment_id);
CREATE INDEX IF NOT EXISTS idx_earthworks_results_alignment_id    ON earthworks_results(alignment_id);
CREATE INDEX IF NOT EXISTS idx_road_reserve_parcels_alignment_id  ON road_reserve_parcels(alignment_id);

-- Project direct children
CREATE INDEX IF NOT EXISTS idx_fieldbook_project_id          ON project_fieldbook_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_survey_points_project_id      ON survey_points(project_id);
CREATE INDEX IF NOT EXISTS idx_mining_surveys_project_id     ON mining_surveys(project_id);
CREATE INDEX IF NOT EXISTS idx_gnss_sessions_project_id      ON gnss_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_import_sessions_project_id    ON import_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_signatures_project_id         ON signatures(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id    ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id       ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_scheme_activity_log_project_id ON scheme_activity_log(project_id);
CREATE INDEX IF NOT EXISTS idx_block_assignments_project_id  ON block_assignments(project_id);

-- Submissions
CREATE INDEX IF NOT EXISTS idx_submissions_project_id        ON submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status            ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_supporting_documents_project  ON supporting_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_supporting_documents_submission ON supporting_documents(submission_id);
CREATE INDEX IF NOT EXISTS idx_project_submissions_project   ON project_submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_submission_documents_project  ON submission_documents(project_id);

-- Public beacons
CREATE INDEX IF NOT EXISTS idx_public_beacons_submitted_by ON public_beacons(submitted_by);
CREATE INDEX IF NOT EXISTS idx_public_beacons_status       ON public_beacons(status);
CREATE INDEX IF NOT EXISTS idx_public_beacons_geom         ON public_beacons USING GIST(geom);

-- Business
CREATE INDEX IF NOT EXISTS idx_equipment_user_id    ON equipment(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id   ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_field_projects_user  ON field_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_field_projects_county ON field_projects(county_code);
CREATE INDEX IF NOT EXISTS idx_gov_audit_user_created ON government_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gov_audit_action       ON government_audit_logs(action, created_at DESC);

-- Spatial indexes
CREATE INDEX IF NOT EXISTS idx_parcels_geom          ON parcels USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_blocks_geom            ON blocks USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_alignment_ips_geom     ON alignment_ips USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_alignment_vertical_ips_geom ON alignment_vertical_ips USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_road_reserve_parcels_geom ON road_reserve_parcels USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_survey_points_geom     ON survey_points USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_rim_sections_geom      ON rim_sections USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_field_projects_centroid ON field_projects USING GIST(centroid_geom);
CREATE INDEX IF NOT EXISTS idx_benchmarks_geom         ON benchmarks USING GIST(geom);

-- Document generation
CREATE INDEX IF NOT EXISTS idx_deed_plans_project_id    ON deed_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_survey_reports_project_id ON survey_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_leveling_runs_project_id  ON leveling_runs(project_id);

-- Payments
CREATE INDEX IF NOT EXISTS idx_payment_history_user_id  ON payment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_project_id ON payment_history(project_id);

-- Survey extras
CREATE INDEX IF NOT EXISTS idx_survey_photos_project_id ON survey_photos(project_id);
CREATE INDEX IF NOT EXISTS idx_survey_epochs_project_id ON survey_epochs(project_id);

-- Document & review
CREATE INDEX IF NOT EXISTS idx_document_signatures_project ON document_signatures(project_id);
CREATE INDEX IF NOT EXISTS idx_peer_review_requests_project ON peer_review_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_traverse_results_project  ON traverse_results(project_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- AUTO-UPDATE TRIGGERS FOR updated_at
-- ═══════════════════════════════════════════════════════════════════════════════

-- Core tables
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_surveyor_profiles_updated_at ON surveyor_profiles;
CREATE TRIGGER trg_surveyor_profiles_updated_at
  BEFORE UPDATE ON surveyor_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Scheme/subdivision
DROP TRIGGER IF EXISTS trg_scheme_details_updated_at ON scheme_details;
CREATE TRIGGER trg_scheme_details_updated_at
  BEFORE UPDATE ON scheme_details FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_blocks_updated_at ON blocks;
CREATE TRIGGER trg_blocks_updated_at
  BEFORE UPDATE ON blocks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_parcels_updated_at ON parcels;
CREATE TRIGGER trg_parcels_updated_at
  BEFORE UPDATE ON parcels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Traverse
DROP TRIGGER IF EXISTS trg_parcel_traverses_updated_at ON parcel_traverses;
CREATE TRIGGER trg_parcel_traverses_updated_at
  BEFORE UPDATE ON parcel_traverses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Level networks
DROP TRIGGER IF EXISTS trg_level_networks_updated_at ON level_networks;
CREATE TRIGGER trg_level_networks_updated_at
  BEFORE UPDATE ON level_networks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Road engineering
DROP TRIGGER IF EXISTS trg_road_alignments_updated_at ON road_alignments;
CREATE TRIGGER trg_road_alignments_updated_at
  BEFORE UPDATE ON road_alignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_alignment_ips_updated_at ON alignment_ips;
CREATE TRIGGER trg_alignment_ips_updated_at
  BEFORE UPDATE ON alignment_ips FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_alignment_vertical_ips_updated_at ON alignment_vertical_ips;
CREATE TRIGGER trg_alignment_vertical_ips_updated_at
  BEFORE UPDATE ON alignment_vertical_ips FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_earthworks_results_updated_at ON earthworks_results;
CREATE TRIGGER trg_earthworks_results_updated_at
  BEFORE UPDATE ON earthworks_results FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Project direct children
DROP TRIGGER IF EXISTS trg_project_fieldbook_entries_updated_at ON project_fieldbook_entries;
CREATE TRIGGER trg_project_fieldbook_entries_updated_at
  BEFORE UPDATE ON project_fieldbook_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_survey_points_updated_at ON survey_points;
CREATE TRIGGER trg_survey_points_updated_at
  BEFORE UPDATE ON survey_points FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_network_adjustments_updated_at ON network_adjustments;
CREATE TRIGGER trg_network_adjustments_updated_at
  BEFORE UPDATE ON network_adjustments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_mining_surveys_updated_at ON mining_surveys;
CREATE TRIGGER trg_mining_surveys_updated_at
  BEFORE UPDATE ON mining_surveys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_hydro_surveys_updated_at ON hydro_surveys;
CREATE TRIGGER trg_hydro_surveys_updated_at
  BEFORE UPDATE ON hydro_surveys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_gnss_sessions_updated_at ON gnss_sessions;
CREATE TRIGGER trg_gnss_sessions_updated_at
  BEFORE UPDATE ON gnss_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_signatures_updated_at ON signatures;
CREATE TRIGGER trg_signatures_updated_at
  BEFORE UPDATE ON signatures FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_block_assignments_updated_at ON block_assignments;
CREATE TRIGGER trg_block_assignments_updated_at
  BEFORE UPDATE ON block_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Submissions
DROP TRIGGER IF EXISTS trg_submissions_updated_at ON submissions;
CREATE TRIGGER trg_submissions_updated_at
  BEFORE UPDATE ON submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Public beacons
DROP TRIGGER IF EXISTS trg_public_beacons_updated_at ON public_beacons;
CREATE TRIGGER trg_public_beacons_updated_at
  BEFORE UPDATE ON public_beacons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Business
DROP TRIGGER IF EXISTS trg_equipment_updated_at ON equipment;
CREATE TRIGGER trg_equipment_updated_at
  BEFORE UPDATE ON equipment FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_user_subscriptions_updated_at ON user_subscriptions;
CREATE TRIGGER trg_user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_field_projects_updated_at ON field_projects;
CREATE TRIGGER trg_field_projects_updated_at
  BEFORE UPDATE ON field_projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Document generation
DROP TRIGGER IF EXISTS trg_deed_plans_updated_at ON deed_plans;
CREATE TRIGGER trg_deed_plans_updated_at
  BEFORE UPDATE ON deed_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_survey_reports_updated_at ON survey_reports;
CREATE TRIGGER trg_survey_reports_updated_at
  BEFORE UPDATE ON survey_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_leveling_runs_updated_at ON leveling_runs;
CREATE TRIGGER trg_leveling_runs_updated_at
  BEFORE UPDATE ON leveling_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Document & review
DROP TRIGGER IF EXISTS trg_peer_review_requests_updated_at ON peer_review_requests;
CREATE TRIGGER trg_peer_review_requests_updated_at
  BEFORE UPDATE ON peer_review_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_traverse_results_updated_at ON traverse_results;
CREATE TRIGGER trg_traverse_results_updated_at
  BEFORE UPDATE ON traverse_results FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE — all tables, indexes, and triggers created.
-- ═══════════════════════════════════════════════════════════════════════════════
