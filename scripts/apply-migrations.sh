#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# apply-migrations.sh
#
# Applies database migrations 020–026 and adds ON DELETE CASCADE FK
# constraints for 25 tables that reference project_id but lack them.
#
# Usage:
#   chmod +x scripts/apply-migrations.sh
#   ./scripts/apply-migrations.sh
#
# Credentials are read from DATABASE_URL or individual env vars.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Connection config ──
if [ -n "${DATABASE_URL:-}" ]; then
  # Parse DATABASE_URL: postgresql://user:password@host:port/dbname
  DB_USER="$(echo "$DATABASE_URL" | sed -n 's|^postgresql://\([^:]*\):.*@\([^:]*\):\([0-9]*\)/\(.*\)$|\1|p')"
  DB_PASS="$(echo "$DATABASE_URL" | sed -n 's|^postgresql://[^:]*:\([^@]*\)@.*$|\1|p')"
  DB_HOST="$(echo "$DATABASE_URL" | sed -n 's|^postgresql://[^:]*:[^@]*@\([^:]*\):.*$|\1|p')"
  DB_PORT="$(echo "$DATABASE_URL" | sed -n 's|^postgresql://[^:]*:[^@]*@[^:]*:\([0-9]*\)/.*$|\1|p')"
  DB_NAME="$(echo "$DATABASE_URL" | sed -n 's|^postgresql://[^:]*:[^@]*@[^:]*:[0-9]*/\(.*\)$|\1|p')"
else
  DB_HOST="${DB_HOST:-host.docker.internal}"
  DB_PORT="${DB_PORT:-5432}"
  DB_NAME="${DB_NAME:-metardu}"
  DB_USER="${DB_USER:-metardu}"
fi

echo "═══════════════════════════════════════════════════════════════"
echo "  Metardu Database Migration Script"
echo "  Host: ${DB_HOST}:${DB_PORT}  DB: ${DB_NAME}  User: ${DB_USER}"
echo "═══════════════════════════════════════════════════════════════"

export PGPASSWORD="${DB_PASS:-}"

# ── Helper: run SQL ──
run_sql() {
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "$1"
}

# ── Helper: run SQL file ──
run_sql_file() {
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$1"
}

# ────────────────────────────────────────────────────────────────
# MIGRATION 020: Role-Based Access Control
# ────────────────────────────────────────────────────────────────
echo "[020/026] Applying RBAC migration..."

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<'SQL020'
-- ─── Section 1.2: Role-Based Access Control ───

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('surveyor', 'admin', 'enterprise', 'university', 'government_auditor');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE surveyor_profiles ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'surveyor';
  ALTER TABLE surveyor_profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE surveyor_profiles ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
  ALTER TABLE surveyor_profiles ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admin guard function
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM surveyor_profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_suspended = false
  );
$$;

-- Government auditor guard
CREATE OR REPLACE FUNCTION is_auditor()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM surveyor_profiles
    WHERE id = auth.uid() AND role = 'government_auditor' AND is_suspended = false
  );
$$;
SQL020

echo "[020/026] ✓ RBAC migration applied"

# ────────────────────────────────────────────────────────────────
# MIGRATION 021: Audit Log
# ────────────────────────────────────────────────────────────────
echo "[021/026] Applying audit log migration..."

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<'SQL021'
-- ─── Section 8: Government Audit Log Table ───

CREATE TABLE IF NOT EXISTS government_audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id UUID,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE government_audit_logs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE government_audit_logs FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Immutable: no UPDATE or DELETE
REVOKE UPDATE, DELETE ON government_audit_logs FROM PUBLIC;

DO $$ BEGIN
  CREATE POLICY "insert_authenticated" ON government_audit_logs
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "select_auditors" ON government_audit_logs
    FOR SELECT USING (is_auditor() OR is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_log_user_created ON government_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON government_audit_logs(action, created_at DESC);
SQL021

echo "[021/026] ✓ Audit log migration applied"

# ────────────────────────────────────────────────────────────────
# MIGRATION 022: Row Level Security
# ────────────────────────────────────────────────────────────────
echo "[022/026] Applying RLS policies..."

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<'SQL022'
-- ─── Section 2.1: Row Level Security — Full Audit ───

DO $$ DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND tablename NOT IN ('spatial_ref_sys', 'geography_columns', 'geometry_columns', 'raster_columns', 'raster_overviews')
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
END $$;

-- Projects: owner + team member access
DO $$ BEGIN
  CREATE POLICY "owner_all" ON projects
    FOR ALL USING (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "team_member_select" ON projects
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM project_members WHERE project_id = projects.id AND user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- project_submissions: only via project ownership
DO $$ BEGIN
  CREATE POLICY "owner_all" ON project_submissions
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = project_submissions.project_id AND owner_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- surveyor_profiles: self read/write + admin read all
DO $$ BEGIN
  CREATE POLICY "self_read_write" ON surveyor_profiles
    FOR ALL USING (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin_read_all" ON surveyor_profiles
    FOR SELECT USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users: self read only
DO $$ BEGIN
  CREATE POLICY "self_read" ON users
    FOR SELECT USING (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Public tables: authenticated read
DO $$ BEGIN
  CREATE POLICY "authenticated_read" ON public_beacons
    FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
SQL022

echo "[022/026] ✓ RLS policies applied"

# ────────────────────────────────────────────────────────────────
# MIGRATION 023: Compliance Triggers
# ────────────────────────────────────────────────────────────────
echo "[023/026] Applying compliance triggers..."

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<'SQL023'
-- ─── Section 12: Compliance Triggers ───

CREATE OR REPLACE FUNCTION prevent_self_isk_verification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.verified_isk = true AND OLD.verified_isk = false THEN
    IF NOT is_admin() THEN
      RAISE EXCEPTION 'Only admins can verify ISK numbers';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER check_isk_verification
    BEFORE UPDATE ON surveyor_profiles
    FOR EACH ROW EXECUTE FUNCTION prevent_self_isk_verification();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION prevent_submission_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'submitted' AND NEW.status != 'rejected' THEN
    RAISE EXCEPTION 'Submitted packages cannot be modified';
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER lock_submitted_packages
    BEFORE UPDATE ON project_submissions
    FOR EACH ROW EXECUTE FUNCTION prevent_submission_mutation();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
SQL023

echo "[023/026] ✓ Compliance triggers applied"

# ────────────────────────────────────────────────────────────────
# MIGRATION 024: Encryption at Rest
# ────────────────────────────────────────────────────────────────
echo "[024/026] Applying encryption migration..."

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<'SQL024'
-- ─── Section 2.5: Encryption at Rest ───

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  ALTER ROLE authenticator SET search_path = public;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
SQL024

echo "[024/026] ✓ Encryption migration applied"

# ────────────────────────────────────────────────────────────────
# MIGRATION 025: Field Projects
# ────────────────────────────────────────────────────────────────
echo "[025/026] Applying field projects migration..."

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<'SQL025'
-- Phase 12: Field Projects
CREATE TABLE IF NOT EXISTS field_projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_field_projects_user ON field_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_field_projects_county ON field_projects(county_code);
SQL025

echo "[025/026] ✓ Field projects migration applied"

# ────────────────────────────────────────────────────────────────
# MIGRATION 026: Level Networks
# ────────────────────────────────────────────────────────────────
echo "[026/026] Applying level networks migration..."

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<'SQL026'
-- Migration 026: Level Network Tables

CREATE TABLE IF NOT EXISTS level_networks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    survey_order VARCHAR(20) NOT NULL DEFAULT 'third',
    instrument VARCHAR(100),
    staff_a VARCHAR(100),
    staff_b VARCHAR(100),
    operator_id UUID,
    total_distance_m DOUBLE PRECISION NOT NULL DEFAULT 0,
    misclosure_mm DOUBLE PRECISION,
    allowable_misclosure_mm DOUBLE PRECISION,
    passed BOOLEAN,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID
);

CREATE TABLE IF NOT EXISTS level_control_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    network_id UUID NOT NULL REFERENCES level_networks(id) ON DELETE CASCADE,
    point_id VARCHAR(50) NOT NULL,
    description TEXT,
    original_rl DOUBLE PRECISION NOT NULL,
    adjusted_rl DOUBLE PRECISION,
    sigma_rl DOUBLE PRECISION,
    is_fixed BOOLEAN NOT NULL DEFAULT FALSE,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    order_class VARCHAR(20),
    UNIQUE(network_id, point_id)
);

CREATE TABLE IF NOT EXISTS level_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    network_id UUID NOT NULL REFERENCES level_networks(id) ON DELETE CASCADE,
    from_point_id VARCHAR(50) NOT NULL,
    to_point_id VARCHAR(50) NOT NULL,
    observed_height_diff DOUBLE PRECISION NOT NULL,
    distance DOUBLE PRECISION NOT NULL DEFAULT 30,
    weight DOUBLE PRECISION NOT NULL DEFAULT 1,
    residual_mm DOUBLE PRECISION,
    standardized_residual DOUBLE PRECISION,
    reading_sequence INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS level_adjustment_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    network_id UUID NOT NULL REFERENCES level_networks(id) ON DELETE CASCADE,
    reference_variance DOUBLE PRECISION,
    degrees_of_freedom INTEGER,
    chi_square DOUBLE PRECISION,
    misclosure_mm DOUBLE PRECISION,
    allowable_misclosure_mm DOUBLE PRECISION,
    total_distance_km DOUBLE PRECISION,
    passed BOOLEAN,
    adjusted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_level_networks_project ON level_networks(project_id);
CREATE INDEX IF NOT EXISTS idx_level_control_points_network ON level_control_points(network_id);
CREATE INDEX IF NOT EXISTS idx_level_observations_network ON level_observations(network_id);
CREATE INDEX IF NOT EXISTS idx_level_adjustment_results_network ON level_adjustment_results(network_id);
SQL026

echo "[026/026] ✓ Level networks migration applied"

# ────────────────────────────────────────────────────────────────
# CASCADE FK MIGRATION: Add ON DELETE CASCADE for 25 tables
# that have project_id columns but no FK constraint
# ────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Adding ON DELETE CASCADE FK constraints (25 tables)"
echo "═══════════════════════════════════════════════════════════════"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<'SQLCASCADE'
-- Add ON DELETE CASCADE FK constraints for tables with project_id but no FK.
-- Each is wrapped in DO $$ ... $$ with IF NOT EXISTS for idempotency.

DO $$ BEGIN
  -- bathymetric_surveys
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_bathymetric_surveys_project_id'
  ) THEN
    ALTER TABLE bathymetric_surveys
      ADD CONSTRAINT fk_bathymetric_surveys_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: bathymetric_surveys';
  END IF;

  -- benchmarks
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_benchmarks_project_id'
  ) THEN
    ALTER TABLE benchmarks
      ADD CONSTRAINT fk_benchmarks_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: benchmarks';
  END IF;

  -- cadastra_validations
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_cadastra_validations_project_id'
  ) THEN
    ALTER TABLE cadastra_validations
      ADD CONSTRAINT fk_cadastra_validations_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: cadastra_validations';
  END IF;

  -- cleaned_datasets
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_cleaned_datasets_project_id'
  ) THEN
    ALTER TABLE cleaned_datasets
      ADD CONSTRAINT fk_cleaned_datasets_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: cleaned_datasets';
  END IF;

  -- deed_plans
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_deed_plans_project_id'
  ) THEN
    ALTER TABLE deed_plans
      ADD CONSTRAINT fk_deed_plans_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: deed_plans';
  END IF;

  -- documents
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_documents_project_id'
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT fk_documents_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: documents';
  END IF;

  -- field_books
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_field_books_project_id'
  ) THEN
    ALTER TABLE field_books
      ADD CONSTRAINT fk_field_books_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: field_books';
  END IF;

  -- gnss_sessions
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_gnss_sessions_project_id'
  ) THEN
    ALTER TABLE gnss_sessions
      ADD CONSTRAINT fk_gnss_sessions_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: gnss_sessions';
  END IF;

  -- history
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_history_project_id'
  ) THEN
    ALTER TABLE history
      ADD CONSTRAINT fk_history_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: history';
  END IF;

  -- leveling_runs
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_leveling_runs_project_id'
  ) THEN
    ALTER TABLE leveling_runs
      ADD CONSTRAINT fk_leveling_runs_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: leveling_runs';
  END IF;

  -- mine_twins
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_mine_twins_project_id'
  ) THEN
    ALTER TABLE mine_twins
      ADD CONSTRAINT fk_mine_twins_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: mine_twins';
  END IF;

  -- presence
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_presence_project_id'
  ) THEN
    ALTER TABLE presence
      ADD CONSTRAINT fk_presence_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: presence';
  END IF;

  -- project_attachments
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_attachments_project_id'
  ) THEN
    ALTER TABLE project_attachments
      ADD CONSTRAINT fk_project_attachments_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: project_attachments';
  END IF;

  -- project_beacons
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_beacons_project_id'
  ) THEN
    ALTER TABLE project_beacons
      ADD CONSTRAINT fk_project_beacons_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: project_beacons';
  END IF;

  -- project_fieldbook_entries
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_fieldbook_entries_project_id'
  ) THEN
    ALTER TABLE project_fieldbook_entries
      ADD CONSTRAINT fk_project_fieldbook_entries_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: project_fieldbook_entries';
  END IF;

  -- project_members
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_members_project_id'
  ) THEN
    ALTER TABLE project_members
      ADD CONSTRAINT fk_project_members_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: project_members';
  END IF;

  -- project_notes
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_notes_project_id'
  ) THEN
    ALTER TABLE project_notes
      ADD CONSTRAINT fk_project_notes_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: project_notes';
  END IF;

  -- project_submissions
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_submissions_project_id'
  ) THEN
    ALTER TABLE project_submissions
      ADD CONSTRAINT fk_project_submissions_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: project_submissions';
  END IF;

  -- rim_sections
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_rim_sections_project_id'
  ) THEN
    ALTER TABLE rim_sections
      ADD CONSTRAINT fk_rim_sections_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: rim_sections';
  END IF;

  -- safety_incidents
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_safety_incidents_project_id'
  ) THEN
    ALTER TABLE safety_incidents
      ADD CONSTRAINT fk_safety_incidents_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: safety_incidents';
  END IF;

  -- submission_documents
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_submission_documents_project_id'
  ) THEN
    ALTER TABLE submission_documents
      ADD CONSTRAINT fk_submission_documents_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: submission_documents';
  END IF;

  -- survey_epochs
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_survey_epochs_project_id'
  ) THEN
    ALTER TABLE survey_epochs
      ADD CONSTRAINT fk_survey_epochs_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: survey_epochs';
  END IF;

  -- survey_photos
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_survey_photos_project_id'
  ) THEN
    ALTER TABLE survey_photos
      ADD CONSTRAINT fk_survey_photos_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: survey_photos';
  END IF;

  -- survey_reports
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_survey_reports_project_id'
  ) THEN
    ALTER TABLE survey_reports
      ADD CONSTRAINT fk_survey_reports_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: survey_reports';
  END IF;

  -- usv_missions
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_usv_missions_project_id'
  ) THEN
    ALTER TABLE usv_missions
      ADD CONSTRAINT fk_usv_missions_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK: usv_missions';
  END IF;

END $$;
SQLCASCADE

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  All migrations applied successfully!"
echo "═══════════════════════════════════════════════════════════════"

unset PGPASSWORD
