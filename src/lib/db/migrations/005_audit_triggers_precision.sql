-- Migration 005: Audit triggers, optimistic locking, DOUBLE PRECISION → NUMERIC
-- Phase 3: Make it Professional

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1: Audit trigger infrastructure
-- Auto-logs all INSERT/UPDATE/DELETE on critical tables to audit_logs
-- ═══════════════════════════════════════════════════════════════════════════

-- Ensure audit_logs table exists with correct schema
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON audit_logs (table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  current_user_id UUID;
BEGIN
  -- Get the current user from RLS session variable
  current_user_id := current_setting('request.user_id', true)::UUID;

  IF (TG_OP = 'INSERT') THEN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, new_data)
    VALUES (current_user_id, 'INSERT', TG_TABLE_NAME, NEW.id::TEXT, to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data, new_data)
    VALUES (current_user_id, 'UPDATE', TG_TABLE_NAME, NEW.id::TEXT, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data)
    VALUES (current_user_id, 'DELETE', TG_TABLE_NAME, OLD.id::TEXT, to_jsonb(OLD));
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach audit triggers to critical tables
-- Cadastral data
DROP TRIGGER IF EXISTS audit_parcels ON parcels;
CREATE TRIGGER audit_parcels AFTER INSERT OR UPDATE OR DELETE ON parcels
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

DROP TRIGGER IF EXISTS audit_blocks ON blocks;
CREATE TRIGGER audit_blocks AFTER INSERT OR UPDATE OR DELETE ON blocks
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

DROP TRIGGER IF EXISTS audit_traverse_results ON traverse_results;
CREATE TRIGGER audit_traverse_results AFTER INSERT OR UPDATE OR DELETE ON traverse_results
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

DROP TRIGGER IF EXISTS audit_traverse_observations ON traverse_observations;
CREATE TRIGGER audit_traverse_observations AFTER INSERT OR UPDATE OR DELETE ON traverse_observations
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Project & survey data
DROP TRIGGER IF EXISTS audit_projects ON projects;
CREATE TRIGGER audit_projects AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

DROP TRIGGER IF EXISTS audit_surveys ON surveys;
CREATE TRIGGER audit_surveys AFTER INSERT OR UPDATE OR DELETE ON surveys
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- User & payment data
DROP TRIGGER IF EXISTS audit_surveyor_profiles ON surveyor_profiles;
CREATE TRIGGER audit_surveyor_profiles AFTER INSERT OR UPDATE OR DELETE ON surveyor_profiles
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

DROP TRIGGER IF EXISTS audit_payment_history ON payment_history;
CREATE TRIGGER audit_payment_history AFTER INSERT OR UPDATE OR DELETE ON payment_history
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2: Optimistic locking — auto-update updated_at on row change
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at columns where missing and attach triggers
-- parcels
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parcels' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE parcels ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

DROP TRIGGER IF EXISTS set_updated_at_parcels ON parcels;
CREATE TRIGGER set_updated_at_parcels BEFORE UPDATE ON parcels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- blocks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'blocks' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE blocks ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

DROP TRIGGER IF EXISTS set_updated_at_blocks ON blocks;
CREATE TRIGGER set_updated_at_blocks BEFORE UPDATE ON blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- projects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE projects ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

DROP TRIGGER IF EXISTS set_updated_at_projects ON projects;
CREATE TRIGGER set_updated_at_projects BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- surveys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'surveys' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE surveys ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

DROP TRIGGER IF EXISTS set_updated_at_surveys ON surveys;
CREATE TRIGGER set_updated_at_surveys BEFORE UPDATE ON surveys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- traverse_results
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'traverse_results' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE traverse_results ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

DROP TRIGGER IF EXISTS set_updated_at_traverse_results ON traverse_results;
CREATE TRIGGER set_updated_at_traverse_results BEFORE UPDATE ON traverse_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3: Fix DOUBLE PRECISION → NUMERIC for survey-grade precision
-- RDM 1.1 requires millimeter accuracy; DOUBLE PRECISION has rounding errors
-- ═══════════════════════════════════════════════════════════════════════════

-- leveling_runs: RL and distance values
DO $$
BEGIN
  -- RL (reduced level)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leveling_runs' AND column_name = 'rl'
      AND data_type = 'double precision'
  ) THEN
    ALTER TABLE leveling_runs ALTER COLUMN rl TYPE NUMERIC(12,4);
  END IF;

  -- distance
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leveling_runs' AND column_name = 'distance'
      AND data_type = 'double precision'
  ) THEN
    ALTER TABLE leveling_runs ALTER COLUMN distance TYPE NUMERIC(12,4);
  END IF;
END $$;

-- traverse_observations: slope_dist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'traverse_observations' AND column_name = 'slope_distance'
      AND data_type = 'double precision'
  ) THEN
    ALTER TABLE traverse_observations ALTER COLUMN slope_distance TYPE NUMERIC(14,4);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'traverse_observations' AND column_name = 'slope_dist'
      AND data_type = 'double precision'
  ) THEN
    ALTER TABLE traverse_observations ALTER COLUMN slope_dist TYPE NUMERIC(14,4);
  END IF;
END $$;

-- survey_points: easting, northing, elevation
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'survey_points' AND column_name = 'easting'
      AND data_type = 'double precision'
  ) THEN
    ALTER TABLE survey_points ALTER COLUMN easting TYPE NUMERIC(14,4);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'survey_points' AND column_name = 'northing'
      AND data_type = 'double precision'
  ) THEN
    ALTER TABLE survey_points ALTER COLUMN northing TYPE NUMERIC(14,4);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'survey_points' AND column_name = 'elevation'
      AND data_type = 'double precision'
  ) THEN
    ALTER TABLE survey_points ALTER COLUMN elevation TYPE NUMERIC(12,4);
  END IF;
END $$;
