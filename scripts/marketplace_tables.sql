-- Marketplace: Instrument Listings & Inquiries
-- Replaces localStorage-based persistence with proper DB tables.
-- Run this migration on the production database.

BEGIN;

-- ── Instrument Listings ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS instrument_listings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('sale', 'rent', 'wanted')),
  category      TEXT NOT NULL CHECK (category IN ('total_station','gnss','level','theodolite','edm','drone','accessories','software','other')),
  title         TEXT NOT NULL,
  brand         TEXT NOT NULL DEFAULT '',
  model         TEXT NOT NULL DEFAULT '',
  condition     TEXT NOT NULL CHECK (condition IN ('new','excellent','good','fair','for_parts')),
  year          INTEGER,
  description   TEXT NOT NULL DEFAULT '',
  price         NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'KES' CHECK (currency IN ('KES','UGX','TZS','NGN','USD','GHS','ZAR')),
  rent_period   TEXT CHECK (rent_period IN ('day','week','month')),
  location      TEXT NOT NULL DEFAULT '',
  country       TEXT NOT NULL DEFAULT 'Kenya',
  seller_name   TEXT NOT NULL DEFAULT '',
  seller_contact TEXT NOT NULL DEFAULT '',
  images        TEXT[] NOT NULL DEFAULT '{}',    -- array of public URLs (not base64)
  verified      BOOLEAN NOT NULL DEFAULT false,
  sold          BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instrument_listings_user ON instrument_listings(user_id);
CREATE INDEX IF NOT EXISTS idx_instrument_listings_type ON instrument_listings(type) WHERE NOT sold;
CREATE INDEX IF NOT EXISTS idx_instrument_listings_category ON instrument_listings(category) WHERE NOT sold;
CREATE INDEX IF NOT EXISTS idx_instrument_listings_country ON instrument_listings(country) WHERE NOT sold;
CREATE INDEX IF NOT EXISTS idx_instrument_listings_created ON instrument_listings(created_at DESC) WHERE NOT sold;

-- ── Instrument Inquiries ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS instrument_inquiries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    UUID NOT NULL REFERENCES instrument_listings(id) ON DELETE CASCADE,
  buyer_name    TEXT NOT NULL,
  buyer_contact TEXT NOT NULL,
  message       TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instrument_inquiries_listing ON instrument_inquiries(listing_id);

COMMIT;
