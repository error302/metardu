-- UP: Explicit, expiring capabilities for retained geographic boundary drafts.
-- Existing project IDs never imply public access. No existing record is shared.
CREATE TABLE public.parcel_draft_shares (
 id UUID PRIMARY KEY,
 project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
 actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
 export_request_id UUID NOT NULL,
 revision_id UUID NOT NULL REFERENCES public.deliverable_revisions(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
 token_hash TEXT NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 command_hash TEXT NOT NULL CHECK(command_hash ~ '^[a-f0-9]{64}$'),
 snapshot_hash TEXT NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
 snapshot TEXT NOT NULL CHECK(octet_length(snapshot)<=4194304 AND jsonb_typeof(snapshot::jsonb)='object' AND snapshot::jsonb->>'protocol'='parcel-draft-share-v1'),
 duration_days INTEGER NOT NULL CHECK(duration_days IN(1,7,30)),
 created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
 expires_at TIMESTAMPTZ NOT NULL,
 revoked_at TIMESTAMPTZ,
 CHECK(snapshot_hash=encode(public.digest(snapshot,'sha256'),'hex')),
 CHECK(expires_at=created_at+duration_days*INTERVAL '24 hours'),
 CHECK(revoked_at IS NULL OR revoked_at>=created_at)
);
CREATE INDEX parcel_draft_share_register ON public.parcel_draft_shares(project_id,actor_id,created_at DESC,id DESC);
ALTER TABLE public.parcel_draft_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.parcel_draft_shares FROM PUBLIC,authenticated;
GRANT SELECT,INSERT ON public.parcel_draft_shares TO authenticated;
GRANT UPDATE(revoked_at) ON public.parcel_draft_shares TO authenticated;
CREATE POLICY parcel_draft_share_owner_read ON public.parcel_draft_shares FOR SELECT TO authenticated USING(
 actor_id::text=NULLIF(current_setting('request.user_id',true),'') AND EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.user_id=actor_id));
CREATE POLICY parcel_draft_share_owner_create ON public.parcel_draft_shares FOR INSERT TO authenticated WITH CHECK(
 actor_id::text=NULLIF(current_setting('request.user_id',true),'') AND revoked_at IS NULL AND created_at=transaction_timestamp()
 AND EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.user_id=actor_id)
 AND EXISTS(SELECT 1 FROM public.deliverable_revisions r JOIN public.deliverables d ON d.id=r.deliverable_id
 WHERE r.id=revision_id AND d.project_id=parcel_draft_shares.project_id AND r.generated_by=actor_id AND r.generator='scheme-boundary-geojson'
 AND r.manifest#>>'{request,id}'=export_request_id::text AND r.manifest#>>'{request,userId}'=actor_id::text
 AND r.manifest#>>'{request,projectId}'=parcel_draft_shares.project_id::text AND r.content_hash=snapshot::jsonb->>'artifactHash'
 AND r.source_revision=snapshot::jsonb->>'sourceRevision' AND r.manifest->>'sourceHash'=snapshot::jsonb->>'sourceHash'
 AND r.manifest#>>'{source,crs}'=snapshot::jsonb->>'sourceCrs' AND r.revision=(snapshot::jsonb->>'exportRevision')::integer));
CREATE POLICY parcel_draft_share_owner_revoke ON public.parcel_draft_shares FOR UPDATE TO authenticated USING(
 actor_id::text=NULLIF(current_setting('request.user_id',true),'') AND EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.user_id=actor_id)) WITH CHECK(
 actor_id::text=NULLIF(current_setting('request.user_id',true),'') AND EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.user_id=actor_id));
CREATE FUNCTION public.guard_parcel_draft_share_update() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF (to_jsonb(NEW)-'revoked_at') IS DISTINCT FROM (to_jsonb(OLD)-'revoked_at') OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR NEW.revoked_at<>transaction_timestamp() THEN
  RAISE EXCEPTION 'Only first revocation of an immutable sharing record is allowed.' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_parcel_draft_share_update() FROM PUBLIC;
CREATE TRIGGER parcel_draft_share_revoke_only BEFORE UPDATE ON public.parcel_draft_shares FOR EACH ROW EXECUTE FUNCTION public.guard_parcel_draft_share_update();
-- This one capability lookup is deliberately callable without an account.
-- It never returns access-key hashes, raw observations, profiles or project metadata.
CREATE FUNCTION public.read_parcel_draft_share(share_id UUID,key_hash TEXT) RETURNS JSONB
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('id',s.id,'createdAt',to_char(s.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'expiresAt',to_char(s.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'snapshotHash',s.snapshot_hash,'snapshot',s.snapshot::jsonb)
 FROM public.parcel_draft_shares s JOIN public.projects p ON p.id=s.project_id AND p.user_id=s.actor_id
 WHERE s.id=share_id AND key_hash ~ '^[a-f0-9]{64}$' AND s.token_hash=key_hash AND s.revoked_at IS NULL AND s.expires_at>statement_timestamp()
 AND NOT EXISTS(SELECT 1 FROM public.surveyor_profiles profile WHERE profile.user_id=s.actor_id AND profile.is_suspended=TRUE);
$$;
REVOKE ALL ON FUNCTION public.read_parcel_draft_share(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_parcel_draft_share(UUID,TEXT) TO PUBLIC;
-- DOWN: Do not erase retained sharing/revocation history. Use a forward correction.
DO $$ BEGIN RAISE EXCEPTION '121 must retain sharing and revocation history.';END $$;
