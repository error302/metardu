-- Phase 26.5: Add role column to users table for RBAC
-- Default all existing users to 'surveyor' role

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'surveyor';
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_users_updated_at ON users;
CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_users_updated_at();

-- Add index on role for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Add constraint to validate role values
ALTER TABLE users ADD CONSTRAINT users_role_check 
  CHECK (role IN ('admin', 'surveyor', 'viewer'));
