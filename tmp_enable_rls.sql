-- Enable RLS on all user tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE surveyor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_beacons ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE peer_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE leveling_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gnss_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcel_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE deed_plans ENABLE ROW LEVEL SECURITY;

-- Create policies for key tables
CREATE POLICY IF NOT EXISTS "Users access own projects" ON projects FOR ALL USING (created_by = auth.uid());
CREATE POLICY IF NOT EXISTS "Users access own surveyor profile" ON surveyor_profiles FOR ALL USING (user_id = auth.uid());
CREATE POLICY IF NOT EXISTS "Users access own documents" ON documents FOR ALL USING (project_id IN (SELECT id FROM projects WHERE created_by = auth.uid()));
CREATE POLICY IF NOT EXISTS "Users access own field books" ON field_books FOR ALL USING (project_id IN (SELECT id FROM projects WHERE created_by = auth.uid()));
CREATE POLICY IF NOT EXISTS "Users access own survey points" ON survey_points FOR ALL USING (project_id IN (SELECT id FROM projects WHERE created_by = auth.uid()));
CREATE POLICY IF NOT EXISTS "Users access own project beacons" ON project_beacons FOR ALL USING (project_id IN (SELECT id FROM projects WHERE created_by = auth.uid()));
CREATE POLICY IF NOT EXISTS "Users access own project submissions" ON project_submissions FOR ALL USING (project_id IN (SELECT id FROM projects WHERE created_by = auth.uid()));
CREATE POLICY IF NOT EXISTS "Users access own project members" ON project_members FOR ALL USING (project_id IN (SELECT id FROM projects WHERE created_by = auth.uid()));
CREATE POLICY IF NOT EXISTS "Users access own audit logs" ON audit_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY IF NOT EXISTS "Users access own community posts" ON community_posts FOR ALL USING (user_id = auth.uid());
CREATE POLICY IF NOT EXISTS "Users access own community comments" ON community_comments FOR ALL USING (user_id = auth.uid());
CREATE POLICY IF NOT EXISTS "Users access own peer reviews" ON peer_reviews FOR ALL USING (requester_id = auth.uid());
CREATE POLICY IF NOT EXISTS "Users access own jobs" ON jobs FOR ALL USING (created_by = auth.uid());
CREATE POLICY IF NOT EXISTS "Users access own job applications" ON job_applications FOR ALL USING (applicant_id = auth.uid());
CREATE POLICY IF NOT EXISTS "Users access own equipment" ON equipment FOR ALL USING (user_id = auth.uid());
CREATE POLICY IF NOT EXISTS "Users access own benchmarks" ON benchmarks FOR ALL USING (project_id IN (SELECT id FROM projects WHERE created_by = auth.uid()));
CREATE POLICY IF NOT EXISTS "Users access own leveling runs" ON leveling_runs FOR ALL USING (project_id IN (SELECT id FROM projects WHERE created_by = auth.uid()));
CREATE POLICY IF NOT EXISTS "Users access own gnss sessions" ON gnss_sessions FOR ALL USING (project_id IN (SELECT id FROM projects WHERE created_by = auth.uid()));
CREATE POLICY IF NOT EXISTS "Users access own parcels" ON parcels FOR ALL USING (project_id IN (SELECT id FROM projects WHERE created_by = auth.uid()));
CREATE POLICY IF NOT EXISTS "Users access own deed plans" ON deed_plans FOR ALL USING (project_id IN (SELECT id FROM projects WHERE created_by = auth.uid()));

-- Verify RLS status
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
