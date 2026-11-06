-- UP: Append-only, source-bound internal field-to-office reviews.
-- Existing applied migrations, observations, surfaces and registered files are unchanged.
CREATE FUNCTION public.surface_review_project_access(target UUID, require_write BOOLEAN DEFAULT FALSE)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.field_observation_project_access(target,require_write)
   AND NOT EXISTS(SELECT 1 FROM public.surveyor_profiles sp
     WHERE sp.user_id::text=NULLIF(current_setting('request.user_id',true),'') AND sp.is_suspended=TRUE);
$$;
REVOKE ALL ON FUNCTION public.surface_review_project_access(UUID,BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.surface_review_project_access(UUID,BOOLEAN) TO authenticated;

CREATE TABLE public.surface_source_reviews (
 id UUID PRIMARY KEY,
 project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
 source_revision_id UUID NOT NULL REFERENCES public.surface_revisions(id) ON DELETE RESTRICT,
 source_hash TEXT NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 source_reference_hash TEXT NOT NULL CHECK(source_reference_hash ~ '^[a-f0-9]{64}$'),
 source_output_hash TEXT NOT NULL CHECK(source_output_hash ~ '^[a-f0-9]{64}$'),
 source_output_evidence TEXT NOT NULL CHECK(octet_length(source_output_evidence)<=8192
   AND jsonb_typeof(source_output_evidence::jsonb)='object'
   AND source_output_hash=encode(public.digest(source_output_evidence,'sha256'),'hex')),
 actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
 request_id UUID NOT NULL,
 command_hash TEXT NOT NULL CHECK(command_hash ~ '^[a-f0-9]{64}$'),
 outcome TEXT NOT NULL CHECK(outcome IN ('changes_requested','reviewed_for_draft')),
 note TEXT NOT NULL CHECK(length(btrim(note))>0 AND length(note)<=4000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
 UNIQUE(project_id,actor_id,request_id)
);
CREATE INDEX surface_source_review_history ON public.surface_source_reviews(project_id,source_revision_id,created_at DESC,id DESC);
ALTER TABLE public.surface_source_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.surface_source_reviews FROM PUBLIC,authenticated;
GRANT SELECT,INSERT ON public.surface_source_reviews TO authenticated;
-- Existing default ACLs may grant direct runtime DML independently of authenticated.
-- Remove mutation grants only on this new evidence table; preserve its owner and unrelated privileges.
DO $review_acl$
DECLARE runtime_grantee RECORD;
BEGIN
 FOR runtime_grantee IN
   SELECT DISTINCT role.rolname
   FROM pg_class relation
   CROSS JOIN LATERAL aclexplode(COALESCE(relation.relacl,acldefault('r',relation.relowner))) privilege
   JOIN pg_roles role ON role.oid=privilege.grantee
   WHERE relation.oid='public.surface_source_reviews'::regclass AND privilege.grantee<>relation.relowner
     AND privilege.privilege_type IN ('UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
 LOOP
   EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.surface_source_reviews FROM %I',runtime_grantee.rolname);
 END LOOP;
END
$review_acl$;
CREATE POLICY surface_source_review_read ON public.surface_source_reviews FOR SELECT TO authenticated
 USING(public.surface_review_project_access(project_id,FALSE));
CREATE POLICY surface_source_review_create ON public.surface_source_reviews FOR INSERT TO authenticated WITH CHECK(
 actor_id::text=NULLIF(current_setting('request.user_id',true),'') AND created_at=transaction_timestamp()
 AND public.surface_review_project_access(project_id,TRUE)
 AND EXISTS(SELECT 1 FROM public.surface_revisions r JOIN public.surfaces s ON s.id=r.surface_id
   WHERE r.id=source_revision_id AND s.project_id=surface_source_reviews.project_id AND s.current_revision_id=r.id
     AND r.input_hash=source_hash AND r.result#>>'{snapshot,referenceHash}'=source_reference_hash
     AND r.result->'outputIntegrity'=source_output_evidence::jsonb));
CREATE FUNCTION public.reject_surface_source_review_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Internal source reviews are append-only; record a new attributed decision.' USING ERRCODE='42501'; END;
$$;
REVOKE ALL ON FUNCTION public.reject_surface_source_review_mutation() FROM PUBLIC;
CREATE TRIGGER surface_source_review_immutable BEFORE UPDATE OR DELETE ON public.surface_source_reviews
 FOR EACH ROW EXECUTE FUNCTION public.reject_surface_source_review_mutation();
-- DOWN: Retain review history; an older app may ignore the additive table/functions.
DO $$ BEGIN RAISE EXCEPTION '125 retains source-review evidence. Use a forward correction.'; END $$;
