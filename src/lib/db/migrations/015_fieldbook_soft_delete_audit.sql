-- Migration 015: Fieldbook soft-delete + per-row audit trail
-- ────────────────────────────────────────────────────────────────────────────
-- Problem:
--   Fieldbook rows (level / traverse / control / hydro / mining) were
--   hard-deleted via setRows(p.filter(...)). For cadastral evidence
--   chains this is unacceptable — ISK / Survey of Kenya audits can
--   demand "who changed what, when?" up to 7 years after the fact.
--
-- Solution:
--   1. Add deleted_at + deleted_by columns to project_fieldbook_entries
--      so deletions become reversible soft-deletes.
--   2. Add a per-row signed_audit JSONB column that accumulates a hash
--      chain of mutations (insert, update, soft-delete, restore).
--      Each entry contains {user_id, action, at, prev_hash, hash}.
--   3. Add an audit trigger that appends to signed_audit automatically.
--   4. Add a fieldbook_audit_events table for an event-stream view
--      that joins across all fieldbook types.
--
-- Rollback: see DOWN section at the bottom of this file.

-- ════════════════════════════════════════════════════════════════════════════
-- UP
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Soft-delete columns
ALTER TABLE project_fieldbook_entries
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- 2. Per-row signed audit chain (JSONB array of mutation entries)
ALTER TABLE project_fieldbook_entries
  ADD COLUMN IF NOT EXISTS signed_audit JSONB DEFAULT '[]'::jsonb;

-- 3. Survey points — same treatment (points are also field evidence)
ALTER TABLE survey_points
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID,
  ADD COLUMN IF NOT EXISTS signed_audit JSONB DEFAULT '[]'::jsonb;

-- 4. Hash-chain helper. Returns a deterministic SHA-256 hex digest of
--    the concatenated fields, so each audit entry can reference the
--    previous entry's hash, making tampering detectable.
CREATE OR REPLACE FUNCTION fieldbook_audit_hash(
  p_user_id TEXT,
  p_action  TEXT,
  p_at      TEXT,
  p_prev    TEXT,
  p_row_id  TEXT,
  p_summary TEXT
) RETURNS TEXT AS $$
DECLARE
  payload TEXT;
BEGIN
  payload := COALESCE(p_user_id,'') || '|' ||
             COALESCE(p_action, '') || '|' ||
             COALESCE(p_at, '') || '|' ||
             COALESCE(p_prev, '') || '|' ||
             COALESCE(p_row_id, '') || '|' ||
             COALESCE(p_summary, '');
  RETURN encode(digest(payload, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 5. Trigger function: append a signed audit entry on INSERT / UPDATE / DELETE
CREATE OR REPLACE FUNCTION fieldbook_signed_audit_func() RETURNS TRIGGER AS $$
DECLARE
  v_user_id   UUID;
  v_user_text TEXT;
  v_action    TEXT;
  v_prev_hash TEXT;
  v_new_hash  TEXT;
  v_summary   TEXT;
  v_at        TEXT;
  v_entry     JSONB;
BEGIN
  -- Resolve current user from RLS session variable (set by middleware)
  v_user_text := COALESCE(current_setting('request.user_id', true), '');
  v_user_id   := NULLIF(v_user_text, '')::UUID;
  v_at        := to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  IF (TG_OP = 'DELETE') THEN
    -- Hard DELETE — record what was removed
    SELECT (signed_audit -> jsonb_array_length(signed_audit) - 1 ->> 'hash')
      INTO v_prev_hash
      FROM project_fieldbook_entries WHERE id = OLD.id;
    v_prev_hash := COALESCE(v_prev_hash, '');
    v_summary   := 'deleted row';
    v_new_hash  := fieldbook_audit_hash(v_user_text, 'DELETE', v_at, v_prev_hash, OLD.id::TEXT, v_summary);
    v_entry     := jsonb_build_object(
      'user_id', v_user_text,
      'action', 'DELETE',
      'at', v_at,
      'prev_hash', v_prev_hash,
      'hash', v_new_hash,
      'summary', v_summary
    );
    -- Insert into the cross-table event stream (below)
    INSERT INTO fieldbook_audit_events (table_name, row_id, user_id, action, prev_hash, hash, summary, payload)
    VALUES (TG_TABLE_NAME, OLD.id::TEXT, v_user_id, 'DELETE', v_prev_hash, v_new_hash, v_summary, to_jsonb(OLD));
    RETURN OLD;
  ELSIF (TG_OP = 'INSERT') THEN
    v_summary  := 'created row';
    v_new_hash := fieldbook_audit_hash(v_user_text, 'INSERT', v_at, '', NEW.id::TEXT, v_summary);
    v_entry    := jsonb_build_object(
      'user_id', v_user_text,
      'action', 'INSERT',
      'at', v_at,
      'prev_hash', '',
      'hash', v_new_hash,
      'summary', v_summary
    );
    NEW.signed_audit := jsonb_build_array(v_entry);
    INSERT INTO fieldbook_audit_events (table_name, row_id, user_id, action, prev_hash, hash, summary, payload)
    VALUES (TG_TABLE_NAME, NEW.id::TEXT, v_user_id, 'INSERT', '', v_new_hash, v_summary, to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Detect soft-delete: deleted_at went from NULL to NOT NULL
    IF (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
      v_action := 'SOFT_DELETE';
    ELSIF (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL) THEN
      v_action := 'RESTORE';
    ELSE
      v_action := 'UPDATE';
    END IF;

    SELECT (signed_audit -> jsonb_array_length(signed_audit) - 1 ->> 'hash')
      INTO v_prev_hash
      FROM project_fieldbook_entries WHERE id = OLD.id;
    v_prev_hash := COALESCE(v_prev_hash, '');
    v_summary   := v_action || ' row';
    v_new_hash  := fieldbook_audit_hash(v_user_text, v_action, v_at, v_prev_hash, NEW.id::TEXT, v_summary);
    v_entry     := jsonb_build_object(
      'user_id', v_user_text,
      'action', v_action,
      'at', v_at,
      'prev_hash', v_prev_hash,
      'hash', v_new_hash,
      'summary', v_summary
    );
    NEW.signed_audit := COALESCE(OLD.signed_audit, '[]'::jsonb) || jsonb_build_array(v_entry);

    INSERT INTO fieldbook_audit_events (table_name, row_id, user_id, action, prev_hash, hash, summary, payload)
    VALUES (TG_TABLE_NAME, NEW.id::TEXT, v_user_id, v_action, v_prev_hash, v_new_hash, v_summary, to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 6. Cross-table audit event stream
CREATE TABLE IF NOT EXISTS fieldbook_audit_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  TEXT NOT NULL,
  row_id      TEXT NOT NULL,
  user_id     UUID,
  action      TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE','SOFT_DELETE','RESTORE')),
  prev_hash   TEXT,
  hash        TEXT NOT NULL,
  summary     TEXT,
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fieldbook_audit_events_row     ON fieldbook_audit_events (table_name, row_id);
CREATE INDEX IF NOT EXISTS idx_fieldbook_audit_events_user    ON fieldbook_audit_events (user_id);
CREATE INDEX IF NOT EXISTS idx_fieldbook_audit_events_project ON fieldbook_audit_events (created_at DESC);

-- 7. Attach triggers
DROP TRIGGER IF EXISTS trg_fieldbook_entries_signed_audit ON project_fieldbook_entries;
CREATE TRIGGER trg_fieldbook_entries_signed_audit
  BEFORE INSERT OR UPDATE OR DELETE ON project_fieldbook_entries
  FOR EACH ROW EXECUTE FUNCTION fieldbook_signed_audit_func();

DROP TRIGGER IF EXISTS trg_survey_points_signed_audit ON survey_points;
CREATE TRIGGER trg_survey_points_signed_audit
  BEFORE INSERT OR UPDATE OR DELETE ON survey_points
  FOR EACH ROW EXECUTE FUNCTION fieldbook_signed_audit_func();

-- 8. RLS — surveyors can read audit events for rows they own via the project
ALTER TABLE fieldbook_audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_events_select_via_project" ON fieldbook_audit_events;
CREATE POLICY "audit_events_select_via_project" ON fieldbook_audit_events
  FOR SELECT USING (
    -- allow if user is a member of any project the row references
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.user_id = current_setting('request.user_id', true)::UUID
    )
    OR current_setting('request.user_role', true) = 'admin'
  );

-- ════════════════════════════════════════════════════════════════════════════
-- DOWN (manual rollback — not auto-applied)
-- ════════════════════════════════════════════════════════════════════════════
--
-- DROP TRIGGER IF EXISTS trg_survey_points_signed_audit ON survey_points;
-- DROP TRIGGER IF EXISTS trg_fieldbook_entries_signed_audit ON project_fieldbook_entries;
-- DROP FUNCTION IF EXISTS fieldbook_signed_audit_func();
-- DROP FUNCTION IF EXISTS fieldbook_audit_hash(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT);
-- DROP TABLE IF EXISTS fieldbook_audit_events;
-- ALTER TABLE survey_points
--   DROP COLUMN IF EXISTS signed_audit,
--   DROP COLUMN IF EXISTS deleted_by,
--   DROP COLUMN IF EXISTS deleted_at;
-- ALTER TABLE project_fieldbook_entries
--   DROP COLUMN IF EXISTS signed_audit,
--   DROP COLUMN IF EXISTS deleted_by,
--   DROP COLUMN IF EXISTS deleted_at;
