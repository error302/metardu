-- Remove project-creator bypasses from firm project access. In a firm
-- workspace, the active organization role is authoritative; user_id records
-- who created the project and must not preserve access after demotion/removal.

CREATE OR REPLACE FUNCTION public.can_read_project_data(target_project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN project.organization_id IS NULL THEN TRUE
    ELSE public.has_active_organization_role(project.organization_id)
  END
    FROM public.projects AS project
   WHERE project.id = target_project_id;
$$;

CREATE OR REPLACE FUNCTION public.can_write_project_data(target_project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN project.organization_id IS NULL THEN TRUE
    ELSE public.has_active_organization_role(
      project.organization_id,
      ARRAY['org_admin', 'project_manager', 'surveyor']
    )
  END
    FROM public.projects AS project
   WHERE project.id = target_project_id;
$$;

-- Personal projects remain owner-scoped by owner_all_projects. Firm projects
-- are visible only through the selected active organization membership.
-- Reassert the personal-only owner policy here as well: permissive project
-- policies are ORed, so a broad historical owner policy would bypass the
-- firm role policy even if the organization-specific policy were correct.
DROP POLICY IF EXISTS "owner_all_projects" ON public.projects;
CREATE POLICY "owner_all_projects" ON public.projects
  FOR ALL
  USING (
    organization_id IS NULL
    AND user_id::text = NULLIF(current_setting('request.user_id', true), '')
  )
  WITH CHECK (
    organization_id IS NULL
    AND user_id::text = NULLIF(current_setting('request.user_id', true), '')
  );

DROP POLICY IF EXISTS "org_member_read_projects" ON public.projects;
CREATE POLICY "org_member_read_projects" ON public.projects
  FOR SELECT
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.current_org_id()
    AND public.has_active_organization_role(organization_id)
  );

DROP POLICY IF EXISTS "org_member_update_projects" ON public.projects;
CREATE POLICY "org_member_update_projects" ON public.projects
  FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.current_org_id()
    AND public.can_manage_organization_projects(organization_id)
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.current_org_id()
    AND public.can_manage_organization_projects(organization_id)
  );

DROP POLICY IF EXISTS "org_member_delete_projects" ON public.projects;
CREATE POLICY "org_member_delete_projects" ON public.projects
  FOR DELETE
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.current_org_id()
    AND public.can_manage_organization_projects(organization_id)
  );

-- Changing a project's organization could turn a firm project into a
-- personal project, where the personal-owner policy would otherwise apply.
-- METARDU has no audited transfer workflow, so keep this scope immutable.
CREATE OR REPLACE FUNCTION public.prevent_project_organization_scope_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Project organization scope cannot be changed without an audited transfer workflow.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_project_organization_scope ON public.projects;
CREATE TRIGGER protect_project_organization_scope
  BEFORE UPDATE OF organization_id ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_project_organization_scope_change();

-- DOWN (manual rollback only): restoring the previous creator bypass would
-- allow firm-project access after role downgrade/removal and could permit a
-- firm project to escape organization scope. Keep this migration applied;
-- correct any future issue with a forward security migration instead.
DO $$
BEGIN
  RAISE EXCEPTION 'Migration 094 is security-forward-only; do not restore the prior organization project policies.'
    USING ERRCODE = '55000';
END;
$$;
