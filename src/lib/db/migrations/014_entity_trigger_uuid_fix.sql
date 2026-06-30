-- Migration 014: Fix entity_version_trigger_func UUID cast
-- The trigger was crashing when current_setting('request.user_id', true) returned
-- an empty string, causing string_to_uuid() to fail with error code 22P02.
-- Now gracefully handles NULL and invalid UUID values.

CREATE OR REPLACE FUNCTION entity_version_trigger_func() RETURNS TRIGGER AS $$
DECLARE
  current_user_id UUID;
  next_version INT;
  delta_obj JSONB;
  old_json JSONB;
  new_json JSONB;
  key TEXT;
  changes TEXT[];
  user_id_text TEXT;
BEGIN
  -- Get the current user from RLS session variable
  user_id_text := current_setting('request.user_id', true);
  IF user_id_text IS NULL OR user_id_text = '' THEN
    current_user_id := NULL;
  ELSE
    BEGIN
      current_user_id := user_id_text::UUID;
    EXCEPTION WHEN OTHERS THEN
      current_user_id := NULL;
    END;
  END IF;

  -- Only snapshot on UPDATE (INSERT is version 1, handled separately)
  IF (TG_OP = 'UPDATE') THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
    FROM entity_versions
    WHERE entity_type = TG_TABLE_NAME AND entity_id = NEW.id;

    old_json := to_jsonb(OLD);
    new_json := to_jsonb(NEW);

    delta_obj := '{}'::JSONB;
    FOR key IN SELECT jsonb_object_keys(old_json) LOOP
      IF old_json->key IS DISTINCT FROM new_json->key THEN
        delta_obj := delta_obj || jsonb_build_object(key, jsonb_build_object('old', old_json->key, 'new', new_json->key));
      END IF;
    END LOOP;

    INSERT INTO entity_versions (entity_type, entity_id, version, snapshot, delta, created_by)
    VALUES (TG_TABLE_NAME, NEW.id, next_version, new_json, delta_obj, current_user_id);

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
$$ LANGUAGE plpgsql;
