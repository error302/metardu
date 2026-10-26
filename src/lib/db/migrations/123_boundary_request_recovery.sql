-- UP: Final boundary outcomes, including durable cancellation. Historical JSON is retained exactly.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.parcel_boundary_drafts d WHERE
    (d.receipt->>'protocol') IS DISTINCT FROM 'reviewed-parcel-boundary-v1' OR
    (d.receipt->>'receiptId') IS DISTINCT FROM d.id::text OR
    (d.receipt->>'requestId') IS DISTINCT FROM d.request_id::text OR
    (d.receipt->>'projectId') IS DISTINCT FROM d.project_id::text OR
    (d.receipt->>'parcelId') IS DISTINCT FROM d.parcel_id::text OR
    (d.receipt->>'traverseId') IS DISTINCT FROM d.traverse_id::text OR
    (d.receipt->>'inputHash') IS DISTINCT FROM d.input_hash OR
    (d.receipt->>'evidenceHash') IS DISTINCT FROM d.evidence_hash OR
    (d.receipt ? 'actorId' AND (d.receipt->>'actorId') IS DISTINCT FROM d.actor_id::text))
  THEN RAISE EXCEPTION 'Historical boundary receipt identity is inconsistent; review before upgrading.' USING ERRCODE='23514'; END IF;
END $$;
CREATE TABLE public.parcel_boundary_requests (
  actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  request_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  parcel_id UUID NOT NULL REFERENCES public.parcels(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  input_hash TEXT NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
  state TEXT NOT NULL CHECK(state IN ('committed','cancelled')),
  draft_id UUID REFERENCES public.parcel_boundary_drafts(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  receipt JSONB NOT NULL CHECK(jsonb_typeof(receipt)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(actor_id,request_id),
  CHECK((state='committed')=(draft_id IS NOT NULL)),
  CHECK((receipt->>'requestId') IS NOT DISTINCT FROM request_id::text AND
    (receipt->>'projectId') IS NOT DISTINCT FROM project_id::text AND
    (receipt->>'parcelId') IS NOT DISTINCT FROM parcel_id::text AND
    (receipt->>'inputHash') IS NOT DISTINCT FROM input_hash AND
    CASE WHEN state='committed' THEN (receipt->>'receiptId') IS NOT DISTINCT FROM draft_id::text
    ELSE (receipt->>'state') IS NOT DISTINCT FROM 'cancelled' AND (receipt->>'actorId') IS NOT DISTINCT FROM actor_id::text END)
);
ALTER TABLE public.parcel_boundary_requests ENABLE ROW LEVEL SECURITY;
INSERT INTO public.parcel_boundary_requests(actor_id,request_id,project_id,parcel_id,input_hash,state,draft_id,receipt)
SELECT actor_id,request_id,project_id,parcel_id,input_hash,'committed',id,receipt FROM public.parcel_boundary_drafts;
ALTER TABLE public.parcel_boundary_drafts ADD CONSTRAINT boundary_draft_final_request
  FOREIGN KEY(actor_id,request_id) REFERENCES public.parcel_boundary_requests(actor_id,request_id) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION public.check_boundary_request_graph() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.parcel_boundary_requests%ROWTYPE; d public.parcel_boundary_drafts%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.parcel_boundary_requests WHERE actor_id=NEW.actor_id AND request_id=NEW.request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Boundary final request is missing.' USING ERRCODE='23514'; END IF;
  SELECT * INTO d FROM public.parcel_boundary_drafts WHERE actor_id=NEW.actor_id AND request_id=NEW.request_id;
  IF r.state='cancelled' THEN
    IF FOUND THEN RAISE EXCEPTION 'Cancelled boundary cannot acquire a draft.' USING ERRCODE='23514'; END IF;
  ELSIF NOT FOUND OR d.id IS DISTINCT FROM r.draft_id OR d.project_id IS DISTINCT FROM r.project_id OR
    d.parcel_id IS DISTINCT FROM r.parcel_id OR d.input_hash IS DISTINCT FROM r.input_hash OR d.receipt IS DISTINCT FROM r.receipt THEN
    RAISE EXCEPTION 'Boundary final request and retained draft disagree.' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.check_boundary_request_graph() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER boundary_request_graph AFTER INSERT ON public.parcel_boundary_requests DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_boundary_request_graph();
CREATE CONSTRAINT TRIGGER boundary_draft_graph AFTER INSERT ON public.parcel_boundary_drafts DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_boundary_request_graph();
CREATE FUNCTION public.guard_boundary_request_immutable() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.projects WHERE id=OLD.project_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Final boundary requests cannot be changed or independently deleted.' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION public.guard_boundary_request_immutable() FROM PUBLIC;
CREATE TRIGGER boundary_request_immutable BEFORE UPDATE OR DELETE ON public.parcel_boundary_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_boundary_request_immutable();
REVOKE ALL ON public.parcel_boundary_requests FROM PUBLIC,authenticated;
GRANT SELECT,INSERT ON public.parcel_boundary_requests TO authenticated;
CREATE POLICY boundary_request_read ON public.parcel_boundary_requests FOR SELECT TO authenticated
  USING(actor_id::text=NULLIF(current_setting('request.user_id',true),'') AND EXISTS(
    SELECT 1 FROM public.projects p WHERE p.id=parcel_boundary_requests.project_id AND p.user_id::text=NULLIF(current_setting('request.user_id',true),'')));
CREATE POLICY boundary_request_append ON public.parcel_boundary_requests FOR INSERT TO authenticated
  WITH CHECK(actor_id::text=NULLIF(current_setting('request.user_id',true),'') AND EXISTS(
    SELECT 1 FROM public.projects p JOIN public.parcels r ON r.project_id=p.id WHERE p.id=parcel_boundary_requests.project_id
      AND r.id=parcel_boundary_requests.parcel_id AND p.user_id::text=NULLIF(current_setting('request.user_id',true),'')) AND
    (state='cancelled' OR EXISTS(SELECT 1 FROM public.parcel_boundary_drafts d WHERE d.id=draft_id AND
      d.actor_id=parcel_boundary_requests.actor_id AND d.request_id=parcel_boundary_requests.request_id AND
      d.project_id=parcel_boundary_requests.project_id AND d.parcel_id=parcel_boundary_requests.parcel_id AND
      d.input_hash=parcel_boundary_requests.input_hash AND d.receipt=parcel_boundary_requests.receipt)));
-- DOWN: Final cancellation is evidence; use a reviewed forward correction.
DO $$ BEGIN RAISE EXCEPTION '123 must retain boundary request outcomes.'; END $$;
