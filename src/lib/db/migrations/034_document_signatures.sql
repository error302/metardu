-- Migration 034: Create document_signatures table
-- Date: 2026-07-03
-- Audit finding: Digital signatures were generated but never persisted.
-- Refreshing the page lost the signature. This table stores signed documents.

CREATE TABLE IF NOT EXISTS document_signatures (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_hash   VARCHAR(255) NOT NULL,
  document_type   VARCHAR(50),
  document_name   VARCHAR(255),
  signature       TEXT NOT NULL,
  algorithm       VARCHAR(50) DEFAULT 'HMAC-SHA256',
  signed_at       TIMESTAMPTZ DEFAULT NOW(),
  metadata        JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_signatures_user ON document_signatures(user_id);
CREATE INDEX IF NOT EXISTS idx_signatures_hash ON document_signatures(document_hash);

ALTER TABLE document_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_signatures" ON document_signatures;
CREATE POLICY "owner_signatures" ON document_signatures
  FOR ALL USING (user_id::text = current_setting('request.user_id', true))
  WITH CHECK (user_id::text = current_setting('request.user_id', true));

COMMENT ON TABLE document_signatures IS 'Digital document signatures — HMAC-SHA256 signed documents';
