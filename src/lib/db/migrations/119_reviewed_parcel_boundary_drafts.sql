-- UP: Retain reviewed boundary drafts and exact recoverable write receipts.
-- Geometry remains in the existing generic Polygon column from migration 071.
CREATE TABLE public.parcel_boundary_drafts (
  id UUID PRIMARY KEY,
  actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  request_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  parcel_id UUID NOT NULL REFERENCES public.parcels(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  traverse_id UUID NOT NULL REFERENCES public.parcel_traverses(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  input_hash TEXT NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
  evidence_hash TEXT NOT NULL CHECK(evidence_hash ~ '^[a-f0-9]{64}$'),
  snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
  receipt JSONB NOT NULL CHECK(jsonb_typeof(receipt)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(actor_id,request_id)
);
CREATE INDEX parcel_boundary_drafts_register ON public.parcel_boundary_drafts(project_id,parcel_id,created_at DESC,id);
ALTER TABLE public.parcel_boundary_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.parcel_boundary_drafts FROM PUBLIC,authenticated;
GRANT SELECT,INSERT ON public.parcel_boundary_drafts TO authenticated;
CREATE POLICY parcel_boundary_draft_read ON public.parcel_boundary_drafts FOR SELECT TO authenticated
  USING(actor_id::text=NULLIF(current_setting('request.user_id',true),'') AND EXISTS(
    SELECT 1 FROM public.projects p WHERE p.id=parcel_boundary_drafts.project_id AND p.user_id::text=NULLIF(current_setting('request.user_id',true),'')));
CREATE POLICY parcel_boundary_draft_append ON public.parcel_boundary_drafts FOR INSERT TO authenticated
  WITH CHECK(actor_id::text=NULLIF(current_setting('request.user_id',true),'') AND EXISTS(
    SELECT 1 FROM public.projects p JOIN public.parcels r ON r.project_id=p.id JOIN public.parcel_traverses t ON t.parcel_id=r.id AND t.project_id=p.id
    WHERE p.id=parcel_boundary_drafts.project_id AND r.id=parcel_boundary_drafts.parcel_id AND t.id=parcel_boundary_drafts.traverse_id
      AND p.user_id::text=NULLIF(current_setting('request.user_id',true),'')));
CREATE FUNCTION public.reject_parcel_boundary_draft_update() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Retained boundary drafts cannot be updated.' USING ERRCODE='42501'; END;
$$;
REVOKE ALL ON FUNCTION public.reject_parcel_boundary_draft_update() FROM PUBLIC;
CREATE TRIGGER parcel_boundary_draft_immutable BEFORE UPDATE ON public.parcel_boundary_drafts
  FOR EACH ROW EXECUTE FUNCTION public.reject_parcel_boundary_draft_update();
-- Application delete/truncate are revoked. Existing whole-project lifecycle
-- removes its own receipts; direct parcel/traverse deletion retains the source.
-- Deleting a former actor must not erase a transferred project's history.
-- Whole-account deletion can still cascade its own complete project graph.
-- DOWN: Preserve original evidence and receipts; use a reviewed forward correction.
DO $$ BEGIN RAISE EXCEPTION '119 must retain reviewed boundary drafts.'; END $$;
