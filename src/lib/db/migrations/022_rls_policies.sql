-- ─── Section 2.1: Row Level Security — Full Audit ───

-- Enable RLS on all core tables
DO $$ DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND tablename NOT IN ('spatial_ref_sys', 'geography_columns', 'geometry_columns', 'raster_columns', 'raster_overviews')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

-- Projects: owner + team member access
DO $$ BEGIN
  CREATE POLICY "owner_all" ON projects
    FOR ALL USING (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "team_member_select" ON projects
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM project_members WHERE project_id = projects.id AND user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- project_submissions: only via project ownership
DO $$ BEGIN
  CREATE POLICY "owner_all" ON project_submissions
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = project_submissions.project_id AND owner_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- surveyor_profiles: self read/write + admin read all
DO $$ BEGIN
  CREATE POLICY "self_read_write" ON surveyor_profiles
    FOR ALL USING (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin_read_all" ON surveyor_profiles
    FOR SELECT USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users: self read only
DO $$ BEGIN
  CREATE POLICY "self_read" ON users
    FOR SELECT USING (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Public tables: authenticated read
DO $$ BEGIN
  CREATE POLICY "authenticated_read" ON public_beacons
    FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
