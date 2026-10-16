-- PostgreSQL row-locking SELECT also applies UPDATE row-security policies.
-- A read-only member therefore cannot take the project's FOR SHARE lock
-- through a normal SELECT. Grant no UPDATE rights: lock through this narrow
-- request-scoped helper after checking the same project read rules instead.
CREATE OR REPLACE FUNCTION public.lock_project_for_read(target_project_id UUID)
RETURNS TABLE(user_id UUID)
LANGUAGE SQL
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT project.user_id
    FROM public.projects AS project
   WHERE project.id = target_project_id
     AND (
       (project.organization_id IS NULL AND project.user_id IS NOT NULL
         AND (project.user_id::text = NULLIF(current_setting('request.user_id', true), '')
           OR public.has_personal_project_read_grant(project.id)))
       OR (project.organization_id IS NOT NULL
         AND project.organization_id = public.current_org_id()
         AND public.has_active_organization_role(project.organization_id))
     )
   FOR SHARE OF project;
$$;

REVOKE ALL ON FUNCTION public.lock_project_for_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_project_for_read(UUID) TO authenticated;

-- DOWN (manual rollback only): dependent app reads require migration 112.
DROP FUNCTION IF EXISTS public.lock_project_for_read(UUID);
