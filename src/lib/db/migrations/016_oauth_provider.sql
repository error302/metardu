-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 016: Add OAuth provider tracking to users table
-- ═══════════════════════════════════════════════════════════════════════════════
-- Adds a `provider` column to track which authentication provider was used
-- when the account was created (credentials, google, azure-ad).
-- Also relaxes the NOT NULL constraint on password_hash since OAuth users
-- will have a sentinel value instead of a real hash.

-- Add provider column (nullable for backwards compat, defaults to 'credentials')
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'credentials';

-- Add OAuth account metadata columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_avatar_url TEXT;

-- Create index for OAuth lookups
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider);
CREATE INDEX IF NOT EXISTS idx_users_oauth_provider_id ON users(oauth_provider_id) WHERE oauth_provider_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN users.provider IS 'Authentication provider: credentials, google, azure-ad';
COMMENT ON COLUMN users.oauth_provider_id IS 'Provider-specific user ID (sub claim for OAuth)';
COMMENT ON COLUMN users.oauth_avatar_url IS 'Avatar URL from OAuth provider';
