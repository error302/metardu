-- UP: Add versioned working-book delivery without changing observation archives.
-- Existing books start at revision zero. Every future insert/update receives a
-- fresh database-wide token, including writes by older application versions.
-- Sequence gaps after rollbacks are expected; revisions are opaque identities.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='fieldbooks' AND column_name='revision')
    OR to_regclass('public.fieldbook_revision_seq') IS NOT NULL
    OR to_regclass('public.fieldbook_save_receipts') IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected Fieldbook delivery schema; review before applying 115.';
  END IF;
END $$;

CREATE SEQUENCE public.fieldbook_revision_seq AS BIGINT NO CYCLE;
REVOKE ALL ON SEQUENCE public.fieldbook_revision_seq FROM PUBLIC, authenticated;
GRANT USAGE ON SEQUENCE public.fieldbook_revision_seq TO authenticated;
ALTER TABLE public.fieldbooks ADD COLUMN revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0);

CREATE FUNCTION public.assign_fieldbook_revision() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  NEW.revision := nextval('public.fieldbook_revision_seq');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_fieldbook_revision() FROM PUBLIC;
CREATE TRIGGER fieldbook_delivery_revision BEFORE INSERT OR UPDATE ON public.fieldbooks
  FOR EACH ROW EXECUTE FUNCTION public.assign_fieldbook_revision();

CREATE TABLE public.fieldbook_save_receipts (
  protocol TEXT NOT NULL DEFAULT 'fieldbook-save-v1' CHECK (protocol='fieldbook-save-v1'),
  field_verified BOOLEAN NOT NULL DEFAULT FALSE CHECK (NOT field_verified),
  actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  book_id UUID NOT NULL,
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  base_revision BIGINT CHECK (base_revision >= 0),
  saved_revision BIGINT NOT NULL CHECK (saved_revision > 0),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  base_snapshot JSONB,
  book_snapshot JSONB NOT NULL CHECK (jsonb_typeof(book_snapshot)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (actor_id,request_id),
  CHECK (base_revision IS NULL OR saved_revision > base_revision),
  CHECK ((base_revision IS NULL AND base_snapshot IS NULL) OR
    (base_revision IS NOT NULL AND base_snapshot IS NOT NULL AND jsonb_typeof(base_snapshot)='object'
     AND COALESCE(base_snapshot->>'id'=book_id::text AND base_snapshot->>'project_id'=project_id::text
     AND base_snapshot->>'user_id'=actor_id::text AND base_snapshot->>'revision'=base_revision::text,FALSE)))
);
CREATE INDEX fieldbook_save_receipts_book ON public.fieldbook_save_receipts(project_id,book_id,saved_revision);
ALTER TABLE public.fieldbook_save_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fieldbook_save_receipts FROM PUBLIC,authenticated;
GRANT SELECT,INSERT ON public.fieldbook_save_receipts TO authenticated;
CREATE POLICY read_own_fieldbook_receipts ON public.fieldbook_save_receipts FOR SELECT TO authenticated
  USING (actor_id::text=NULLIF(current_setting('request.user_id',true),'')
    AND public.field_observation_project_access(project_id,FALSE));
CREATE POLICY append_own_fieldbook_receipts ON public.fieldbook_save_receipts FOR INSERT TO authenticated
  WITH CHECK (actor_id::text=NULLIF(current_setting('request.user_id',true),'')
    AND public.field_observation_project_access(project_id,TRUE)
    AND book_snapshot->>'id'=book_id::text AND book_snapshot->>'project_id'=project_id::text
    AND book_snapshot->>'user_id'=actor_id::text AND book_snapshot->>'revision'=saved_revision::text);
CREATE FUNCTION public.reject_fieldbook_receipt_update() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Fieldbook delivery receipts are immutable.' USING ERRCODE='42501'; END;
$$;
REVOKE ALL ON FUNCTION public.reject_fieldbook_receipt_update() FROM PUBLIC;
CREATE TRIGGER fieldbook_receipts_immutable BEFORE UPDATE ON public.fieldbook_save_receipts
  FOR EACH ROW EXECUTE FUNCTION public.reject_fieldbook_receipt_update();
-- Application DELETE/TRUNCATE is revoked. Explicit account/project deletion
-- retains its established FK lifecycle; do not block those cascades with a trigger.

-- DOWN: retain delivered revision identities and receipts; rollback app code instead.
DO $$ BEGIN RAISE EXCEPTION '115 requires a reviewed forward correction; do not discard delivery history.'; END $$;
