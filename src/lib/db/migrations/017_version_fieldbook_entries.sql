-- Migration 017: Add versioning triggers for fieldbook entries, traverse observations, and survey points
-- Phase 4: Make it Trustworthy
--
-- Problem:
--   Fieldbook edits (traverse_observations, project_fieldbook_entries) and
--   survey_points are NOT auto-versioned. For cadastral evidence chains
--   under Survey Act Cap 299, every fieldbook mutation must be traceable.
--
-- Solution:
--   1. Re-create entity_version_trigger_func() to include an entity_type
--      whitelist check so that triggers on ANY table are harmless if the
--      table isn't in the versioning set.
--   2. Attach AFTER INSERT OR UPDATE OR DELETE triggers to:
--       - traverse_observations
--       - project_fieldbook_entries
--       - survey_points
--   3. Update the RLS SELECT policy so that versions for these new entity
--      types are visible to authorised users.

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1: Re-create the trigger function with a versioning whitelist
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
  v_allowed BOOLEAN;
BEGIN
  -- ── Whitelist: only version tables we explicitly care about ──
  SELECT EXISTS (
    SELECT 1 FROM (VALUES
      ('parcels'),
      ('blocks'),
      ('projects'),
      ('traverse_results'),
      ('traverse_history'),
      ('traverse_observations'),
      ('project_fieldbook_entries'),
      ('survey_points')
    ) AS t(tbl)
    WHERE t.tbl = TG_TABLE_NAME
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Get the current user from RLS session variable
  current_user_id := NULLIF(current_setting('request.user_id', true), '')::UUID;

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
-- PART 2: Attach versioning triggers to the new tables
-- ═══════════════════════════════════════════════════════════════════════════

-- Traverse observations (individual observations within a traverse)
DROP TRIGGER IF EXISTS version_traverse_observations ON traverse_observations;
CREATE TRIGGER version_traverse_observations AFTER INSERT OR UPDATE OR DELETE ON traverse_observations
  FOR EACH ROW EXECUTE FUNCTION entity_version_trigger_func();

-- Project fieldbook entries (level/traverse/control/hydro/mining rows)
DROP TRIGGER IF EXISTS version_project_fieldbook_entries ON project_fieldbook_entries;
CREATE TRIGGER version_project_fieldbook_entries AFTER INSERT OR UPDATE OR DELETE ON project_fieldbook_entries
  FOR EACH ROW EXECUTE FUNCTION entity_version_trigger_func();

-- Survey points (coordinate evidence points)
DROP TRIGGER IF EXISTS version_survey_points ON survey_points;
CREATE TRIGGER version_survey_points AFTER INSERT OR UPDATE OR DELETE ON survey_points
  FOR EACH ROW EXECUTE FUNCTION entity_version_trigger_func();

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3: Update RLS policy to include new entity types
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop and recreate the SELECT policy to cover the new entity types
DROP POLICY IF EXISTS "Users can view entity versions for their projects" ON entity_versions;
CREATE POLICY "Users can view entity versions for their projects"
  ON entity_versions FOR SELECT
  USING (
    -- Parcels via block → project
    (entity_type = 'parcels' AND entity_id IN (
      SELECT p.id FROM parcels p
      JOIN blocks b ON b.id = p.block_id
      JOIN projects proj ON proj.id = b.project_id
      WHERE proj.user_id = current_setting('request.user_id', true)::UUID
    ))
    -- Blocks via project
    OR (entity_type = 'blocks' AND entity_id IN (
      SELECT b.id FROM blocks b
      JOIN projects proj ON proj.id = b.project_id
      WHERE proj.user_id = current_setting('request.user_id', true)::UUID
    ))
    -- Projects owned by user
    OR (entity_type = 'projects' AND entity_id IN (
      SELECT id FROM projects WHERE user_id = current_setting('request.user_id', true)::UUID
    ))
    -- Traverse results via parcel_traverses → parcels → blocks → projects
    OR (entity_type = 'traverse_results' AND entity_id IN (
      SELECT tr.id FROM traverse_results tr
      JOIN parcel_traverses pt ON pt.id = tr.traverse_id
      JOIN parcels p ON p.id = pt.parcel_id
      JOIN blocks b ON b.id = p.block_id
      JOIN projects proj ON proj.id = b.project_id
      WHERE proj.user_id = current_setting('request.user_id', true)::UUID
    ))
    -- Traverse observations via parcel_traverses → parcels → blocks → projects
    OR (entity_type = 'traverse_observations' AND entity_id IN (
      SELECT tobs.id FROM traverse_observations tobs
      JOIN parcel_traverses pt ON pt.id = tobs.traverse_id
      JOIN parcels p ON p.id = pt.parcel_id
      JOIN blocks b ON b.id = p.block_id
      JOIN projects proj ON proj.id = b.project_id
      WHERE proj.user_id = current_setting('request.user_id', true)::UUID
    ))
    -- Project fieldbook entries via project
    OR (entity_type = 'project_fieldbook_entries' AND entity_id IN (
      SELECT pfe.id FROM project_fieldbook_entries pfe
      JOIN projects proj ON proj.id = pfe.project_id
      WHERE proj.user_id = current_setting('request.user_id', true)::UUID
    ))
    -- Survey points via project
    OR (entity_type = 'survey_points' AND entity_id IN (
      SELECT sp.id FROM survey_points sp
      JOIN projects proj ON proj.id = sp.project_id
      WHERE proj.user_id = current_setting('request.user_id', true)::UUID
    ))
    -- Fallback: user can see versions they created
    OR created_by = current_setting('request.user_id', true)::UUID
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4: Indexes for the new entity types
-- ═══════════════════════════════════════════════════════════════════════════
-- The existing idx_entity_versions_entity index on (entity_type, entity_id)
-- already covers queries for the new entity types, so no additional
-- indexes are needed.
