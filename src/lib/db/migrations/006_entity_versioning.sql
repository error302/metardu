-- Migration 006: Data versioning — entity snapshots for legal traceability
-- Phase 4: Make it Trustworthy
-- Survey Act Cap 299 requires deed plan revisions to be traceable.

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1: General entity_versions table
-- Stores JSONB snapshots of any entity at each revision
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS entity_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,  -- 'parcel', 'block', 'traverse', 'scheme', 'project'
  entity_id UUID NOT NULL,
  version INT NOT NULL DEFAULT 1,
  snapshot JSONB NOT NULL,    -- full entity state at this version
  delta JSONB,                -- only changed fields (optional, for diff display)
  change_summary TEXT,        -- human-readable: "Updated parcel area from 0.5 to 0.48 ha"
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_entity_version UNIQUE (entity_type, entity_id, version)
);

CREATE INDEX IF NOT EXISTS idx_entity_versions_entity ON entity_versions (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_versions_created_at ON entity_versions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_versions_created_by ON entity_versions (created_by);

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2: Versioning trigger function
-- Automatically snapshots row state on UPDATE, computes delta
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION entity_version_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  current_user_id UUID;
  next_version INT;
  delta_obj JSONB;
  old_json JSONB;
  new_json JSONB;
  key TEXT;
  changes TEXT[];
BEGIN
  -- Get the current user from RLS session variable
  current_user_id := current_setting('request.user_id', true)::UUID;

  -- Only snapshot on UPDATE (INSERT is version 1, handled separately)
  IF (TG_OP = 'UPDATE') THEN
    -- Get next version number
    SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
    FROM entity_versions
    WHERE entity_type = TG_TABLE_NAME AND entity_id = NEW.id;

    old_json := to_jsonb(OLD);
    new_json := to_jsonb(NEW);

    -- Compute delta: only fields that changed
    delta_obj := '{}'::JSONB;
    FOR key IN SELECT jsonb_object_keys(old_json) LOOP
      IF old_json->key IS DISTINCT FROM new_json->key THEN
        delta_obj := delta_obj || jsonb_build_object(key, jsonb_build_object('old', old_json->key, 'new', new_json->key));
      END IF;
    END LOOP;

    INSERT INTO entity_versions (entity_type, entity_id, version, snapshot, delta, created_by)
    VALUES (TG_TABLE_NAME, NEW.id, next_version, new_json, delta_obj, current_user_id);

    -- Auto-increment revision_number if column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = TG_TABLE_NAME AND column_name = 'revision_number') THEN
      NEW.revision_number := COALESCE(OLD.revision_number, 0) + 1;
    END IF;

    RETURN NEW;
  END IF;

  -- On INSERT, create version 1 snapshot
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO entity_versions (entity_type, entity_id, version, snapshot, created_by)
    VALUES (TG_TABLE_NAME, NEW.id, 1, to_jsonb(NEW), current_user_id);
    RETURN NEW;
  END IF;

  -- On DELETE, snapshot the final state
  IF (TG_OP = 'DELETE') THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
    FROM entity_versions
    WHERE entity_type = TG_TABLE_NAME AND entity_id = OLD.id;

    INSERT INTO entity_versions (entity_type, entity_id, version, snapshot, delta, created_by, change_summary)
    VALUES (TG_TABLE_NAME, OLD.id, next_version, to_jsonb(OLD), NULL, current_user_id, 'DELETED');
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3: Attach versioning triggers to critical tables
-- ═══════════════════════════════════════════════════════════════════════════

-- Parcels (cadastral data — LEGAL requirement for traceability)
DROP TRIGGER IF EXISTS version_parcels ON parcels;
CREATE TRIGGER version_parcels AFTER INSERT OR UPDATE OR DELETE ON parcels
  FOR EACH ROW EXECUTE FUNCTION entity_version_trigger_func();

-- Blocks
DROP TRIGGER IF EXISTS version_blocks ON blocks;
CREATE TRIGGER version_blocks AFTER INSERT OR UPDATE OR DELETE ON blocks
  FOR EACH ROW EXECUTE FUNCTION entity_version_trigger_func();

-- Projects
DROP TRIGGER IF EXISTS version_projects ON projects;
CREATE TRIGGER version_projects AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION entity_version_trigger_func();

-- Traverse results (computation outputs)
DROP TRIGGER IF EXISTS version_traverse_results ON traverse_results;
CREATE TRIGGER version_traverse_results AFTER INSERT OR UPDATE OR DELETE ON traverse_results
  FOR EACH ROW EXECUTE FUNCTION entity_version_trigger_func();

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4: RLS policies for entity_versions
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE entity_versions ENABLE ROW LEVEL SECURITY;

-- Users can view versions for entities they own (via project membership)
CREATE POLICY "Users can view entity versions for their projects"
  ON entity_versions FOR SELECT
  USING (
    entity_id IN (
      SELECT p.id FROM parcels p
      JOIN blocks b ON b.id = p.block_id
      JOIN projects proj ON proj.id = b.project_id
      WHERE proj.user_id = current_setting('request.user_id', true)::UUID
    )
    OR entity_id IN (
      SELECT b.id FROM blocks b
      JOIN projects proj ON proj.id = b.project_id
      WHERE proj.user_id = current_setting('request.user_id', true)::UUID
    )
    OR entity_id IN (
      SELECT id FROM projects WHERE user_id = current_setting('request.user_id', true)::UUID
    )
    OR created_by = current_setting('request.user_id', true)::UUID
  );

-- Authenticated users can insert versions (triggers do this)
CREATE POLICY "Authenticated users can insert entity versions"
  ON entity_versions FOR INSERT
  WITH CHECK (created_by = current_setting('request.user_id', true)::UUID);

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 5: Enrich audit_logs with old_data/new_data columns
-- (complements migration 005 which created the table)
-- ═══════════════════════════════════════════════════════════════════════════

-- These columns already exist from migration 005, but ensure they're there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_logs' AND column_name = 'old_data'
  ) THEN
    ALTER TABLE audit_logs ADD COLUMN old_data JSONB;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_logs' AND column_name = 'new_data'
  ) THEN
    ALTER TABLE audit_logs ADD COLUMN new_data JSONB;
  END IF;
END $$;
