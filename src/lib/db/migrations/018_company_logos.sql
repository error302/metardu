/**
 * Migration 018: Company Logos Table
 *
 * Stores uploaded company logos for Pro/Enterprise users.
 * Free tier users cannot upload logos — METARDU watermark is used instead.
 */

CREATE TABLE IF NOT EXISTS company_logos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename      VARCHAR(255) NOT NULL,
  mime_type     VARCHAR(64) NOT NULL,
  file_size     INTEGER NOT NULL,
  logo_data     BYTEA NOT NULL,
  width_px      INTEGER,
  height_px     INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_logos_user_id ON company_logos(user_id);
