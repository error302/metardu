-- UP: Retain recoverable parcel-metadata intake without altering observations.
-- Preflight/reconcile any legacy duplicate block/parcel numbers before release.
-- This deliberately fails on duplicates; it never deletes or renumbers them.
CREATE UNIQUE INDEX scheme_parcel_number_per_block
  ON public.parcels(block_id, parcel_number) WHERE block_id IS NOT NULL;

CREATE TABLE public.scheme_import_receipts (
  actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  block_id UUID NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  protocol TEXT NOT NULL CHECK (protocol='scheme-metadata-import-v1'),
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  source_name TEXT NOT NULL CHECK (length(source_name) BETWEEN 1 AND 255),
  source_bytes BYTEA NOT NULL CHECK (octet_length(source_bytes) BETWEEN 1 AND 4194304),
  receipt JSONB NOT NULL CHECK (jsonb_typeof(receipt)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(actor_id,request_id)
);
CREATE INDEX scheme_import_receipts_project ON public.scheme_import_receipts(project_id,block_id,created_at);
ALTER TABLE public.scheme_import_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheme_import_receipts FROM PUBLIC,authenticated;
GRANT SELECT,INSERT ON public.scheme_import_receipts TO authenticated;
CREATE POLICY scheme_import_owner_read ON public.scheme_import_receipts FOR SELECT TO authenticated
  USING (actor_id::text=NULLIF(current_setting('request.user_id',true),'')
    AND EXISTS(SELECT 1 FROM public.projects p JOIN public.blocks b ON b.project_id=p.id
      WHERE p.id=scheme_import_receipts.project_id AND b.id=scheme_import_receipts.block_id
        AND p.user_id::text=NULLIF(current_setting('request.user_id',true),'')));
CREATE POLICY scheme_import_owner_append ON public.scheme_import_receipts FOR INSERT TO authenticated
  WITH CHECK (actor_id::text=NULLIF(current_setting('request.user_id',true),'')
    AND EXISTS(SELECT 1 FROM public.projects p JOIN public.blocks b ON b.project_id=p.id
      WHERE p.id=scheme_import_receipts.project_id AND b.id=scheme_import_receipts.block_id
        AND p.user_id::text=NULLIF(current_setting('request.user_id',true),'')));
CREATE FUNCTION public.reject_scheme_import_receipt_update() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Scheme import receipts are immutable.' USING ERRCODE='42501'; END;
$$;
REVOKE ALL ON FUNCTION public.reject_scheme_import_receipt_update() FROM PUBLIC;
CREATE TRIGGER scheme_import_receipt_immutable BEFORE UPDATE ON public.scheme_import_receipts
  FOR EACH ROW EXECUTE FUNCTION public.reject_scheme_import_receipt_update();
-- Retain established account/project deletion cascades. Application update,
-- delete and truncate privileges are revoked; imports only append receipts.

-- DOWN: preserve delivery history; roll back application code instead.
DO $$ BEGIN RAISE EXCEPTION '117 requires a reviewed forward correction; preserve import receipts.'; END $$;
