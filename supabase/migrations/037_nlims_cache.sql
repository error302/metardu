CREATE TABLE nlims_cache (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  parcel_number text NOT NULL,
  county        text NOT NULL,
  data          jsonb NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(parcel_number, county)
);

ALTER TABLE nlims_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read nlims cache" ON nlims_cache
  FOR SELECT USING (true);

CREATE POLICY "write nlims cache" ON nlims_cache
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX idx_nlims_cache_parcel ON nlims_cache(parcel_number);
CREATE INDEX idx_nlims_cache_county ON nlims_cache(county);
CREATE INDEX idx_nlims_cache_fetched ON nlims_cache(fetched_at);

-- Parcel Vault - Personal (private per user)
CREATE TABLE parcel_vault (
  id                     uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                uuid REFERENCES auth.users(id),
  parcel_number          text NOT NULL,
  county                 text NOT NULL,
  registration_section   text,
  area_sqm               float8,
  title_deed_number      text,
  owner_type             text,
  encumbrances           jsonb DEFAULT '[]',
  status                 text,
  certificate_date       date NOT NULL,
  expires_at             date GENERATED ALWAYS AS (certificate_date + INTERVAL '90 days') STORED,
  freshness              text GENERATED ALWAYS AS (
                            CASE
                              WHEN certificate_date > CURRENT_DATE - 30 THEN 'FRESH'
                              WHEN certificate_date > CURRENT_DATE - 90 THEN 'VERIFY'
                              ELSE 'STALE'
                            END
                          ) STORED,
  pdf_path              text,
  shared                boolean DEFAULT false,
  parsed_data           jsonb NOT NULL,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE(user_id, parcel_number)
);

-- Parcel Vault - Community Shared Pool
CREATE TABLE parcel_vault_shared (
  id                     uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  parcel_number          text NOT NULL UNIQUE,
  county                 text NOT NULL,
  registration_section   text,
  area_sqm               float8,
  title_deed_number      text,
  encumbrances_count     integer DEFAULT 0,
  status                 text,
  certificate_date       date NOT NULL,
  freshness              text,
  contributor_count     integer DEFAULT 1,
  last_updated          timestamptz DEFAULT now()
);

ALTER TABLE parcel_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcel_vault_shared ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own vault" ON parcel_vault
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "read shared" ON parcel_vault_shared
  FOR SELECT USING (true);

CREATE POLICY "write shared" ON parcel_vault_shared
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX idx_parcel_vault_user ON parcel_vault(user_id);
CREATE INDEX idx_parcel_vault_parcel ON parcel_vault(parcel_number);
CREATE INDEX idx_parcel_vault_freshness ON parcel_vault(freshness);
CREATE INDEX idx_parcel_vault_shared_parcel ON parcel_vault_shared(parcel_number);
