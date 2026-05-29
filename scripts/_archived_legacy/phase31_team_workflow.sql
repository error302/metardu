-- ============================================================
-- Phase 31: Team Workflow & Audit Trail
-- Multi-surveyor block assignment, activity logging
-- Self-hosted PostgreSQL on GCP VM
-- ============================================================

-- 1. Block assignments (surveyor → block mapping)
CREATE TABLE IF NOT EXISTS block_assignments (
  id              SERIAL PRIMARY KEY,
  block_id        INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assigned_to     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(block_id)
);

CREATE INDEX IF NOT EXISTS idx_block_assignments_project_id ON block_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_block_assignments_assigned_to ON block_assignments(assigned_to);

-- 2. Scheme activity log
CREATE TABLE IF NOT EXISTS scheme_activity_log (
  id              SERIAL PRIMARY KEY,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action          VARCHAR(50) NOT NULL,
  -- Actions: block_created, block_updated, block_deleted,
  --          parcel_created, parcel_updated, parcel_deleted, parcel_computed,
  --          traverse_saved, deed_plan_generated, form_generated,
  --          batch_generated, rim_generated, block_assigned, status_changed
  entity_type     VARCHAR(30) NOT NULL,
  -- entity_type: block, parcel, traverse, scheme, project
  entity_id       INTEGER,
  details         JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheme_activity_log_project_id ON scheme_activity_log(project_id);
CREATE INDEX IF NOT EXISTS idx_scheme_activity_log_user_id ON scheme_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_scheme_activity_log_action ON scheme_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_scheme_activity_log_created_at ON scheme_activity_log(created_at DESC);
