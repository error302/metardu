-- Raw field observations/photos require a real recording role. The previous
-- all-operation policy admitted personal viewers and omitted firm-only crews.
-- Preserve every existing row and source value; change authorization only.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policy policy JOIN pg_class relation ON relation.oid=policy.polrelid
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='public' AND relation.relname IN ('survey_observations','field_photos')
      -- Existing restrictive organization/revocation guards remain in force.
      -- Any unrecognized permissive policy could bypass the new role boundary.
      AND policy.polpermissive
      AND policy.polname NOT IN ('project_child_survey_observations','project_child_field_photos')) THEN
    RAISE EXCEPTION 'Unexpected field-record policy; review before applying 114.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='public' AND relation.relname IN ('survey_observations','field_photos') AND NOT relation.relrowsecurity) THEN
    RAISE EXCEPTION 'Field-record RLS must already be enabled; review before applying 114.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.field_observation_project_access(target_project_id UUID, write_access BOOLEAN DEFAULT FALSE)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
  SELECT COALESCE(EXISTS (
    SELECT 1 FROM public.projects project
    WHERE project.id=target_project_id AND project.user_id IS NOT NULL
      AND CASE WHEN project.organization_id IS NULL THEN
        project.user_id::text=NULLIF(current_setting('request.user_id',true),'')
        OR EXISTS (SELECT 1 FROM public.project_members member
          WHERE member.project_id=project.id
            AND member.user_id::text=NULLIF(current_setting('request.user_id',true),'')
            AND member.role=ANY(CASE WHEN write_access
              THEN ARRAY['super_admin','org_admin','project_manager','surveyor']
              ELSE ARRAY['super_admin','org_admin','project_manager','surveyor','viewer'] END))
      ELSE project.organization_id=public.current_org_id()
        AND public.has_active_organization_role(project.organization_id,
          CASE WHEN write_access THEN ARRAY['org_admin','project_manager','surveyor']
          ELSE ARRAY['org_admin','project_manager','surveyor','viewer'] END)
      END
  ),FALSE);
$$;
REVOKE ALL ON FUNCTION public.field_observation_project_access(UUID,BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.field_observation_project_access(UUID,BOOLEAN) TO authenticated;

DROP POLICY IF EXISTS project_child_survey_observations ON public.survey_observations;
CREATE POLICY field_observations_read ON public.survey_observations FOR SELECT
  USING (public.field_observation_project_access(project_id,FALSE));
CREATE POLICY field_observations_insert ON public.survey_observations FOR INSERT
  WITH CHECK (public.field_observation_project_access(project_id,TRUE));
CREATE POLICY field_observations_update ON public.survey_observations FOR UPDATE
  USING (public.field_observation_project_access(project_id,TRUE))
  WITH CHECK (public.field_observation_project_access(project_id,TRUE));
CREATE POLICY field_observations_delete ON public.survey_observations FOR DELETE
  USING (public.field_observation_project_access(project_id,TRUE));

DROP POLICY IF EXISTS project_child_field_photos ON public.field_photos;
CREATE POLICY field_photos_read ON public.field_photos FOR SELECT
  USING (public.field_observation_project_access(project_id,FALSE));
CREATE POLICY field_photos_insert ON public.field_photos FOR INSERT
  WITH CHECK (public.field_observation_project_access(project_id,TRUE));
CREATE POLICY field_photos_update ON public.field_photos FOR UPDATE
  USING (public.field_observation_project_access(project_id,TRUE))
  WITH CHECK (public.field_observation_project_access(project_id,TRUE));
CREATE POLICY field_photos_delete ON public.field_photos FOR DELETE
  USING (public.field_observation_project_access(project_id,TRUE));

-- Once a receipt binds a raw observation, another generic upsert must not
-- alter that source row. Unreceipted legacy records are not reclassified.
CREATE OR REPLACE FUNCTION public.guard_receipted_field_observation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
BEGIN
  IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)
    AND EXISTS (SELECT 1 FROM public.observation_batches batch
      WHERE batch.project_id=OLD.project_id
        AND batch.quality_metadata->>'kind'='offline_field_observation'
        AND batch.quality_metadata->>'observationId'=OLD.id::text) THEN
    RAISE EXCEPTION 'Receipted raw field observations are immutable; record a new capture for corrections.'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_receipted_field_observation() FROM PUBLIC;
CREATE TRIGGER receipted_field_observation_immutable
  BEFORE UPDATE ON public.survey_observations FOR EACH ROW
  EXECUTE FUNCTION public.guard_receipted_field_observation();

-- DOWN: security-forward-only; restoring viewer writes or creator bypasses is unsafe.
DO $$ BEGIN RAISE EXCEPTION '114 is security-forward-only; use a reviewed forward correction.'; END $$;
