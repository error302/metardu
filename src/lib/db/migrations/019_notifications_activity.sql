-- ──────────────────────────────────────────────────────────────────────────
-- Migration 019: User Notifications System
--
-- Creates the notifications table for in-app notifications:
-- - Peer review requests
-- - Payment confirmations
-- - Project shares
-- - System alerts
-- - Calibration reminders
-- - Submission status updates
--
-- Per Kenya DPA 2019: notifications are user-scoped with RLS.
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            VARCHAR(50) NOT NULL DEFAULT 'info',
    category        VARCHAR(50) NOT NULL DEFAULT 'general',
    title           TEXT NOT NULL,
    message         TEXT NOT NULL,
    action_url      TEXT,
    action_label    VARCHAR(100),
    metadata        JSONB DEFAULT '{}',
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications(user_id, created_at DESC)
    WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_all
    ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_category
    ON notifications(category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_expires
    ON notifications(expires_at)
    WHERE expires_at IS NOT NULL;

-- Row Level Security — users can only see their own notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_user_policy ON notifications
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', true)::UUID);

-- ─── Activity Feed Table ───────────────────────────────────────────────────
-- Tracks user actions for the dashboard activity feed

CREATE TABLE IF NOT EXISTS user_activity (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
    activity_type   VARCHAR(100) NOT NULL,
    entity_type     VARCHAR(50),
    entity_id       UUID,
    description     TEXT NOT NULL,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_user_date
    ON user_activity(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_project
    ON user_activity(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_type
    ON user_activity(activity_type, created_at DESC);

ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_user_policy ON user_activity
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', true)::UUID);

-- ─── Helper: create notification ───────────────────────────────────────────
-- Usage: SELECT create_notification(
--   'user-uuid', 'info', 'peer_review', 'New Review Request',
--   'John requested peer review of your deed plan',
--   '/peer-review?id=123', 'View Request'
-- );

CREATE OR REPLACE FUNCTION create_notification(
    p_user_id       UUID,
    p_title         TEXT,
    p_message       TEXT,
    p_type          VARCHAR(50) DEFAULT 'info',
    p_category      VARCHAR(50) DEFAULT 'general',
    p_action_url    TEXT DEFAULT NULL,
    p_action_label  VARCHAR(100) DEFAULT NULL,
    p_metadata      JSONB DEFAULT '{}'::JSONB
) RETURNS UUID AS $$
DECLARE
    notif_id UUID;
BEGIN
    INSERT INTO notifications (user_id, type, category, title, message, action_url, action_label, metadata)
    VALUES (p_user_id, p_type, p_category, p_title, p_message, p_action_url, p_action_label, p_metadata)
    RETURNING id INTO notif_id;
    RETURN notif_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Helper: log activity ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION log_activity(
    p_user_id       UUID,
    p_activity_type VARCHAR(100),
    p_description   TEXT,
    p_project_id    UUID DEFAULT NULL,
    p_entity_type   VARCHAR(50) DEFAULT NULL,
    p_entity_id     UUID DEFAULT NULL,
    p_metadata      JSONB DEFAULT '{}'::JSONB
) RETURNS UUID AS $$
DECLARE
    activity_id UUID;
BEGIN
    INSERT INTO user_activity (user_id, project_id, activity_type, entity_type, entity_id, description, metadata)
    VALUES (p_user_id, p_project_id, p_activity_type, p_entity_type, p_entity_id, p_description, p_metadata)
    RETURNING id INTO activity_id;
    RETURN activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
