-- Version every user's NextAuth JWT sessions so account owners can revoke all
-- active browser sessions immediately without a process-local token blacklist.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS session_version BIGINT NOT NULL DEFAULT 1;
