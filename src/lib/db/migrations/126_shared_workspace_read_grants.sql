-- UP: Align retained child reads with existing canonical personal/firm project grants.
-- These are SELECT policies only. Preserve every existing mutation/revocation policy.
DO $$ BEGIN
 IF to_regprocedure('public.field_observation_project_access(uuid,boolean)') IS NULL THEN
  RAISE EXCEPTION 'Established project role access is required before shared workspace reads.';
 END IF;
 IF (SELECT COUNT(*) FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
     WHERE namespace.nspname='public' AND relation.relname IN ('survey_points','project_fieldbook_entries')
       AND relation.relrowsecurity)=2 THEN
  NULL;
 ELSE
  RAISE EXCEPTION 'Shared source tables must already have RLS enabled; inspect before applying 126.';
 END IF;
END $$;

CREATE POLICY survey_points_shared_project_read ON public.survey_points FOR SELECT TO authenticated
 USING(public.field_observation_project_access(project_id,FALSE));
CREATE POLICY fieldbook_shared_project_read ON public.project_fieldbook_entries FOR SELECT TO authenticated
 USING(public.field_observation_project_access(project_id,FALSE));

-- DOWN: Remove only the two new read policies. Retain all rows and original policies.
DROP POLICY IF EXISTS survey_points_shared_project_read ON public.survey_points;
DROP POLICY IF EXISTS fieldbook_shared_project_read ON public.project_fieldbook_entries;
