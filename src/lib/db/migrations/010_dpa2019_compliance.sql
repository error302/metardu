-- Migration 010: Kenya Data Protection Act 2019 compliance tables
--
-- Creates tables for:
-- - Data Subject Access Requests (DSAR)
-- - User consents
-- - Data breach notifications
--
-- References: Kenya Data Protection Act, 2019
-- - Section 25: Right of access to personal data
-- - Section 27: Right to correction/deletion
-- - Section 33: Data breach notification (72 hours to ODPC)
-- - Section 43: Registration with Office of the Data Protection Commissioner

BEGIN;

-- Data Subject Access Requests
CREATE TABLE IF NOT EXISTS data_subject_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            VARCHAR(30) NOT NULL CHECK (type IN ('access', 'correction', 'deletion', 'portability', 'objection')),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'in_progress', 'completed', 'rejected')),
    description     TEXT NOT NULL,
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    response        TEXT,
    rejection_reason TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dsar_user ON data_subject_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_dsar_status ON data_subject_requests(status);
CREATE INDEX IF NOT EXISTS idx_dsar_type ON data_subject_requests(type);

-- User Consents (DPA 2019 consent management)
CREATE TABLE IF NOT EXISTS user_consents (
    id             SERIAL PRIMARY KEY,
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_type   VARCHAR(50) NOT NULL CHECK (consent_type IN ('marketing', 'analytics', 'third_party_sharing', 'cookies', 'profiling')),
    granted        BOOLEAN NOT NULL DEFAULT false,
    granted_at     TIMESTAMPTZ,
    revoked_at     TIMESTAMPTZ,
    version        VARCHAR(10) NOT NULL DEFAULT '1.0',
    UNIQUE(user_id, consent_type)
);

CREATE INDEX IF NOT EXISTS idx_consents_user ON user_consents(user_id);

-- Data Breach Notifications (DPA 2019 Section 33)
CREATE TABLE IF NOT EXISTS data_breach_notifications (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reported_by                 UUID NOT NULL REFERENCES users(id),
    description                 TEXT NOT NULL,
    affected_data_types         TEXT[] NOT NULL DEFAULT '{}',
    estimated_affected_users    INTEGER NOT NULL DEFAULT 0,
    severity                    VARCHAR(10) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    containment_measures        TEXT NOT NULL,
    reported_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    commissioner_notified       BOOLEAN NOT NULL DEFAULT false,
    commissioner_notified_at    TIMESTAMPTZ,
    user_notification_sent      BOOLEAN NOT NULL DEFAULT false,
    user_notification_sent_at   TIMESTAMPTZ,
    resolved_at                 TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_breach_reported ON data_breach_notifications(reported_at);
CREATE INDEX IF NOT EXISTS idx_breach_severity ON data_breach_notifications(severity) WHERE resolved_at IS NULL;

-- RLS policies for DPA tables
ALTER TABLE data_subject_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_breach_notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own DSARs
CREATE POLICY dsar_user_policy ON data_subject_requests
    FOR ALL USING (user_id = current_user_id());

-- Admins can see all DSARs
CREATE POLICY dsar_admin_policy ON data_subject_requests
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = current_user_id() AND role IN ('super_admin', 'org_admin') AND revoked_at IS NULL)
    );

-- Users can only see their own consents
CREATE POLICY consents_user_policy ON user_consents
    FOR ALL USING (user_id = current_user_id());

-- Breach notifications are admin-only
CREATE POLICY breach_admin_policy ON data_breach_notifications
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = current_user_id() AND role IN ('super_admin', 'org_admin') AND revoked_at IS NULL)
    );

COMMIT;
