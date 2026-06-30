-- ──────────────────────────────────────────────────────────────────────────
-- 022_profile_notification_preferences.sql
--
-- Adds notification_preferences JSONB column to profiles for per-user
-- notification channel control (email, sms, push, in-app).
--
-- Default preferences enable in-app + email notifications for project,
-- billing, and security events. SMS/push are off by default (opt-in).
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS notification_preferences JSONB
    DEFAULT '{
        "email": {
            "project_updates": true,
            "field_sync_complete": true,
            "document_generated": true,
            "billing_reminders": true,
            "security_alerts": true,
            "marketing": false,
            "weekly_digest": true
        },
        "sms": {
            "field_sync_complete": false,
            "billing_reminders": false,
            "security_alerts": true
        },
        "push": {
            "project_updates": false,
            "field_sync_complete": false,
            "document_generated": false,
            "security_alerts": true
        },
        "in_app": {
            "project_updates": true,
            "field_sync_complete": true,
            "document_generated": true,
            "billing_reminders": true,
            "security_alerts": true,
            "team_mentions": true
        }
    }'::jsonb;

-- Add audit fields for tracking when preferences were last changed
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS notification_preferences_updated_at TIMESTAMPTZ;

-- Backfill the audit timestamp for any existing rows
UPDATE profiles
SET notification_preferences_updated_at = NOW()
WHERE notification_preferences_updated_at IS NULL;

-- Index for fast lookups of who has a particular channel enabled
-- (used by notification dispatcher to filter recipients)
CREATE INDEX IF NOT EXISTS idx_profiles_notification_prefs
    ON profiles(id)
    WHERE notification_preferences IS NOT NULL;
