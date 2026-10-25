-- UP: Exact committed exports and durable cancellation of unconfirmed requests.
-- Artifact bytes and source snapshots remain in the file/deliverable registers.
CREATE TABLE public.scheme_export_requests (
 id UUID PRIMARY KEY,
 actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
 project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
 request_id UUID NOT NULL,
 format TEXT NOT NULL CHECK(format IN('dxf','geojson')),
 request_hash TEXT NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 body JSONB NOT NULL CHECK(jsonb_typeof(body)='object' AND octet_length(body::text)<=8192),
 outcome TEXT NOT NULL CHECK(outcome IN('committed','cancelled')),
 deliverable_revision_id UUID REFERENCES public.deliverable_revisions(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
 receipt JSONB NOT NULL CHECK(jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=8192),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(actor_id,project_id,request_id),
 CHECK((outcome='committed' AND deliverable_revision_id IS NOT NULL) OR (outcome='cancelled' AND deliverable_revision_id IS NULL))
);
CREATE INDEX scheme_export_request_register ON public.scheme_export_requests(project_id,created_at DESC,id);
ALTER TABLE public.scheme_export_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheme_export_requests FROM PUBLIC,authenticated;
GRANT SELECT,INSERT ON public.scheme_export_requests TO authenticated;
CREATE POLICY scheme_export_request_read ON public.scheme_export_requests FOR SELECT TO authenticated USING(
 actor_id::text=NULLIF(current_setting('request.user_id',true),'') AND EXISTS(SELECT 1 FROM public.projects p WHERE p.id=scheme_export_requests.project_id AND p.user_id=scheme_export_requests.actor_id));
CREATE POLICY scheme_export_request_append ON public.scheme_export_requests FOR INSERT TO authenticated WITH CHECK(
 actor_id::text=NULLIF(current_setting('request.user_id',true),'') AND EXISTS(SELECT 1 FROM public.projects p WHERE p.id=scheme_export_requests.project_id AND p.user_id=scheme_export_requests.actor_id)
 AND body->>'expectedUserId'=actor_id::text AND body->>'projectId'=project_id::text AND body->>'requestId'=request_id::text AND body->'reviewed'='true'::jsonb
 AND receipt->>'outcome'=outcome AND receipt->>'requestId'=request_id::text AND receipt->>'requestHash'=request_hash AND receipt->>'sourceHash'=body->>'sourceHash'
 AND ((outcome='cancelled' AND receipt->>'format'=format AND receipt->>'actorId'=actor_id::text AND receipt->>'projectId'=project_id::text) OR EXISTS(
  SELECT 1 FROM public.deliverable_revisions r JOIN public.deliverables d ON d.id=r.deliverable_id
  WHERE r.id=scheme_export_requests.deliverable_revision_id AND d.project_id=scheme_export_requests.project_id AND r.generated_by=scheme_export_requests.actor_id
   AND d.document_type=scheme_export_requests.format AND r.generator='scheme-boundary-'||scheme_export_requests.format
   AND r.manifest#>>'{request,id}'=scheme_export_requests.request_id::text AND r.manifest#>>'{request,userId}'=scheme_export_requests.actor_id::text
   AND r.manifest#>>'{request,projectId}'=scheme_export_requests.project_id::text AND r.manifest#>>'{request,payloadHash}'=scheme_export_requests.request_hash
   AND r.manifest->>'sourceHash'=scheme_export_requests.body->>'sourceHash' AND scheme_export_requests.receipt->>'revisionId'=r.id::text
   AND scheme_export_requests.receipt->>'contentHash'=r.content_hash AND scheme_export_requests.receipt->>'sourceRevision'=r.source_revision)));
CREATE FUNCTION public.reject_scheme_export_request_update() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Retained export outcomes cannot be updated.' USING ERRCODE='42501';END;
$$;
REVOKE ALL ON FUNCTION public.reject_scheme_export_request_update() FROM PUBLIC;
CREATE TRIGGER scheme_export_request_immutable BEFORE UPDATE ON public.scheme_export_requests FOR EACH ROW EXECUTE FUNCTION public.reject_scheme_export_request_update();
-- Application delete/truncate are revoked. Complete own-project lifecycle can
-- remove its graph; former actors cannot erase transferred project receipts.
-- DOWN: Preserve outcomes and bytes. Use a reviewed forward correction.
DO $$ BEGIN RAISE EXCEPTION '120 must retain export and cancellation receipts.';END $$;
