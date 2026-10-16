-- Application RBAC already recognizes explicit project_members read grants,
-- but projects RLS hid the parent before RBAC could read that membership.
-- Restore SELECT only for recognized grants on owned PERSONAL projects.
-- Firm access remains governed by active organization roles (migration 094).
-- SECURITY DEFINER avoids a projects <-> project_members policy recursion;
-- like the existing role helpers, it reads only the current request identity.
CREATE OR REPLACE FUNCTION public.has_personal_project_read_grant(target_project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.projects AS project
      JOIN public.project_members AS member ON member.project_id = project.id
     WHERE project.id = target_project_id
       AND project.organization_id IS NULL
       AND project.user_id IS NOT NULL
       AND member.user_id::text = NULLIF(current_setting('request.user_id', true), '')
       AND member.role IN ('super_admin', 'org_admin', 'project_manager', 'surveyor', 'viewer')
  );
$$;

DROP POLICY IF EXISTS personal_project_member_read ON public.projects;
CREATE POLICY personal_project_member_read ON public.projects
  FOR SELECT
  USING (
    organization_id IS NULL
    AND user_id IS NOT NULL
    AND public.has_personal_project_read_grant(id)
  );

-- Only the caller's membership is required by canAccessProject(). Do not
-- expose other members or grant membership-management/write permissions.
DROP POLICY IF EXISTS personal_project_member_self_read ON public.project_members;
CREATE POLICY personal_project_member_self_read ON public.project_members
  FOR SELECT
  USING (
    user_id::text = NULLIF(current_setting('request.user_id', true), '')
    AND public.has_personal_project_read_grant(project_id)
  );

-- DOWN (manual rollback only): remove these additive personal read policies.
DROP POLICY IF EXISTS personal_project_member_self_read ON public.project_members;
DROP POLICY IF EXISTS personal_project_member_read ON public.projects;
DROP FUNCTION IF EXISTS public.has_personal_project_read_grant(UUID);
