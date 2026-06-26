-- Phase 10: Critical indexes for performance and audit

-- Audit logs indexes (should match Phase 9 table)
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- RBAC indexes (Note: moved/created in 009_rbac_tables.sql when the tables are actually defined)

-- Government licenses indexes (Note: Commented out because government_licenses and license_seats tables do not exist in the schema)
-- CREATE INDEX IF NOT EXISTS idx_gov_licenses_active ON government_licenses(active, expires_at) WHERE active = TRUE;
-- CREATE INDEX IF NOT EXISTS idx_license_seats_license ON license_seats(license_id);
-- CREATE INDEX IF NOT EXISTS idx_license_seats_user ON license_seats(user_id) WHERE active = TRUE;

-- Projects performance indexes
CREATE INDEX IF NOT EXISTS idx_projects_surveyor ON projects(user_id);
-- CREATE INDEX IF NOT EXISTS idx_projects_county ON projects(county_code); -- Note: county_code is on field_projects, not projects
CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at DESC);

-- Sync queue performance (for offline sync)
-- CREATE INDEX IF NOT EXISTS idx_sync_queue_pending ON sync_queue(projectId, timestamp) WHERE retries < 3; -- Note: sync_queue is client-side IndexedDB

-- Partial indexes for common queries
CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(status) WHERE status = 'active';
-- CREATE INDEX IF NOT EXISTS idx_traverse_obs_project ON traverse_obs(project_id); -- Note: traverse_obs is client-side IndexedDB

-- Enable pg_stat_statements if available (for slow query detection)
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_stat_statements not available (superuser required)';
END $$;
