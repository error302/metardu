-- Migration 009: Create RBAC tables (user_roles, resource_permissions)
--
-- These tables are referenced by src/lib/auth/rbac.ts but were never
-- created in any previous migration.

BEGIN;

CREATE TABLE IF NOT EXISTS user_roles (
    id             SERIAL PRIMARY KEY,
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID,
    role           VARCHAR(30) NOT NULL DEFAULT 'surveyor',
    granted_by     UUID REFERENCES users(id),
    granted_at     TIMESTAMPTZ DEFAULT NOW(),
    revoked_at     TIMESTAMPTZ,
    UNIQUE(user_id, organization_id),
    CONSTRAINT chk_user_roles_role CHECK (
        role IN ('super_admin', 'org_admin', 'project_manager', 'surveyor', 'viewer')
    )
);

CREATE TABLE IF NOT EXISTS resource_permissions (
    id             SERIAL PRIMARY KEY,
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission     VARCHAR(100) NOT NULL,
    resource_type  VARCHAR(50) NOT NULL,
    resource_id    UUID NOT NULL,
    granted_by     UUID REFERENCES users(id),
    granted_at     TIMESTAMPTZ DEFAULT NOW(),
    revoked_at     TIMESTAMPTZ,
    UNIQUE(user_id, permission, resource_type, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_roles_org ON user_roles(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_resource_permissions_lookup
    ON resource_permissions(user_id, permission, resource_type, resource_id) WHERE revoked_at IS NULL;

COMMIT;
