-- Phase 10: Critical indexes for performance and audit

-- Audit logs indexes (should match Phase 9 table)
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- RBAC indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_org ON user_roles(organization_id) WHERE organization_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_unique ON user_roles(user_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_resource_permissions_lookup ON resource_permissions(user_id, permission, resource_type, resource_id) WHERE revoked_at IS NULL;

-- Government licenses indexes
CREATE INDEX IF NOT EXISTS idx_gov_licenses_active ON government_licenses(active, expires_at) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_license_seats_license ON license_seats(license_id);
CREATE INDEX IF NOT EXISTS idx_license_seats_user ON license_seats(user_id) WHERE active = TRUE;

-- Projects performance indexes
CREATE INDEX IF NOT EXISTS idx_projects_surveyor ON projects(surveyor_id);
CREATE INDEX IF NOT EXISTS idx_projects_county ON projects(county_code);
CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at DESC);

-- Sync queue performance (for offline sync)
CREATE INDEX IF NOT EXISTS idx_sync_queue_pending ON sync_queue(projectId, timestamp) WHERE retries < 3;

-- Partial indexes for common queries
CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_traverse_obs_project ON traverse_obs(project_id);

-- Enable pg_stat_statements if available (for slow query detection)
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_stat_statements not available (superuser required)';
END $$;
