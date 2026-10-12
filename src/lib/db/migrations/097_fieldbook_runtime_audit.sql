-- Audit source writes must work through the restricted application login.
-- Keep the audit sink private and append-only; only its source-row trigger
-- writes it. Historical hashes and payloads are preserved.

-- UP:
ALTER TABLE public.fieldbook_audit_events ADD COLUMN IF NOT EXISTS project_id UUID;
UPDATE public.fieldbook_audit_events
   SET project_id = (payload ->> 'project_id')::uuid
 WHERE project_id IS NULL
   AND table_name IN ('project_fieldbook_entries', 'survey_points')
   AND payload ->> 'project_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
CREATE INDEX IF NOT EXISTS idx_fieldbook_audit_project
  ON public.fieldbook_audit_events(project_id, created_at);

ALTER TABLE public.fieldbook_audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_events_select_via_project ON public.fieldbook_audit_events;
CREATE POLICY audit_events_select_via_project ON public.fieldbook_audit_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects project
       WHERE project.id = fieldbook_audit_events.project_id
         AND public.can_read_project_data(project.id)
    )
  );

CREATE OR REPLACE FUNCTION public.fieldbook_signed_audit_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_text TEXT := COALESCE(current_setting('request.user_id', true), '');
  v_user_id UUID := NULLIF(v_user_text, '')::uuid;
  v_action TEXT;
  v_prev_hash TEXT := '';
  v_new_hash TEXT;
  v_summary TEXT;
  v_at TEXT := to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_entry JSONB;
  v_row JSONB;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public'
     OR TG_RELID NOT IN ('public.project_fieldbook_entries'::regclass, 'public.survey_points'::regclass) THEN
    RAISE EXCEPTION 'Fieldbook audit trigger attached to an unsupported relation' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'INSERT';
    v_summary := 'created row';
    v_row := to_jsonb(NEW);
  ELSE
    -- Read the source row itself: querying fieldbook entries for a survey
    -- point's predecessor previously broke the survey-point hash chain.
    v_prev_hash := COALESCE(OLD.signed_audit -> -1 ->> 'hash', '');
    IF TG_OP = 'DELETE' THEN
      v_action := 'DELETE';
      v_summary := 'deleted row';
      v_row := to_jsonb(OLD);
    ELSE
      v_action := CASE
        WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'SOFT_DELETE'
        WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'RESTORE'
        ELSE 'UPDATE'
      END;
      v_summary := v_action || ' row';
      v_row := to_jsonb(NEW);
    END IF;
  END IF;

  v_new_hash := public.fieldbook_audit_hash(v_user_text, v_action, v_at,
    v_prev_hash, v_row ->> 'id', v_summary);
  v_entry := jsonb_build_object('user_id', v_user_text, 'action', v_action,
    'at', v_at, 'prev_hash', v_prev_hash, 'hash', v_new_hash, 'summary', v_summary);
  IF TG_OP = 'INSERT' THEN
    NEW.signed_audit := jsonb_build_array(v_entry);
    v_row := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.signed_audit := COALESCE(OLD.signed_audit, '[]'::jsonb) || jsonb_build_array(v_entry);
    v_row := to_jsonb(NEW);
  END IF;

  -- The definer owns the sink; source-table RLS still decides whether the
  -- outer write is authorized. Any outer failure rolls this insert back too.
  INSERT INTO public.fieldbook_audit_events
    (project_id, table_name, row_id, user_id, action, prev_hash, hash, summary, payload)
  VALUES ((v_row ->> 'project_id')::uuid, TG_TABLE_NAME, v_row ->> 'id',
    v_user_id, v_action, v_prev_hash, v_new_hash, v_summary, v_row);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fieldbook_signed_audit_func() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.reject_fieldbook_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'Fieldbook audit events are append-only' USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS protect_fieldbook_audit_events ON public.fieldbook_audit_events;
CREATE TRIGGER protect_fieldbook_audit_events
  BEFORE UPDATE OR DELETE ON public.fieldbook_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_fieldbook_audit_mutation();
REVOKE ALL ON FUNCTION public.reject_fieldbook_audit_mutation() FROM PUBLIC;

COMMENT ON COLUMN public.fieldbook_audit_events.project_id IS
  'Project recorded in the source payload; null historical scope remains inaccessible. Retained after source-row deletion.';

-- DOWN:
DO $$ BEGIN
  RAISE EXCEPTION '097 is security-forward-only; use a reviewed forward migration rather than restoring unscoped audit access.';
END $$;
