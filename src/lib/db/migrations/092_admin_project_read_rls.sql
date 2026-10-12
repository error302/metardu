-- Admin dashboard aggregates need platform-wide read access after the app
-- stops connecting as a PostgreSQL superuser. Writes remain project-scoped.
DROP POLICY IF EXISTS platform_admin_read_projects ON public.projects;
CREATE POLICY platform_admin_read_projects ON public.projects
  FOR SELECT
  USING (current_setting('request.access_role', true) = 'platform_admin');
