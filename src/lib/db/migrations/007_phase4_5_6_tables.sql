-- ═══════════════════════════════════════════════════════════════════════════════
-- METARDU Migration 007 — Phase 4/5/6 Missing Tables
-- ─────────────────────────────────────────────────────────────────────────────
-- Creates tables referenced by existing application code but absent from
-- migrations 000–006.  Fully idempotent (safe to re-run).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Ensure trigger function exists ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 1. submission_sequences ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS submission_sequences (
  surveyor_profile_id  UUID NOT NULL REFERENCES surveyor_profiles(id) ON DELETE CASCADE,
  year                 INT  NOT NULL,
  current_sequence     INT  NOT NULL DEFAULT 1,
  PRIMARY KEY (surveyor_profile_id, year)
);

-- ── 2. peer_reviews ─────────────────────────────────────────────────────────
-- If table exists but has different schema, add missing columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename='peer_reviews') THEN
    CREATE TABLE peer_reviews (
      id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id             UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      reviewer_id            UUID REFERENCES users(id) ON DELETE SET NULL,
      status                 VARCHAR(50) DEFAULT 'pending'
                             CHECK (status IN ('pending','in_progress','completed','rejected','failed')),
      payment_status         VARCHAR(50) DEFAULT 'pending'
                             CHECK (payment_status IN ('pending','paid','failed','refunded')),
      stripe_payment_intent_id VARCHAR(255),
      amount                 DECIMAL(10,2) DEFAULT 2500.00,
      currency               VARCHAR(3) DEFAULT 'KES',
      notes                  TEXT,
      review_submitted_at    TIMESTAMPTZ,
      created_at             TIMESTAMPTZ DEFAULT NOW(),
      updated_at             TIMESTAMPTZ DEFAULT NOW()
    );
  ELSE
    -- Add missing columns to existing peer_reviews
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='peer_reviews' AND column_name='project_id') THEN
      ALTER TABLE peer_reviews ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='peer_reviews' AND column_name='reviewer_id') THEN
      ALTER TABLE peer_reviews ADD COLUMN reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='peer_reviews' AND column_name='payment_status') THEN
      ALTER TABLE peer_reviews ADD COLUMN payment_status VARCHAR(50) DEFAULT 'pending'
        CHECK (payment_status IN ('pending','paid','failed','refunded'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='peer_reviews' AND column_name='amount') THEN
      ALTER TABLE peer_reviews ADD COLUMN amount DECIMAL(10,2) DEFAULT 2500.00;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_peer_reviews_project ON peer_reviews(project_id);
CREATE INDEX IF NOT EXISTS idx_peer_reviews_reviewer ON peer_reviews(reviewer_id);

-- ── 3. payment_intents ───────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename='payment_intents') THEN
    CREATE TABLE payment_intents (
      id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id         UUID REFERENCES projects(id) ON DELETE SET NULL,
      amount             DECIMAL(12,2) NOT NULL,
      currency           VARCHAR(3) DEFAULT 'KES',
      payment_method     VARCHAR(50) NOT NULL
                         CHECK (payment_method IN ('mpesa','stripe','paypal')),
      status             VARCHAR(50) DEFAULT 'pending'
                         CHECK (status IN ('pending','processing','completed','failed','refunded','expired')),
      provider_id        VARCHAR(255),
      checkout_request_id VARCHAR(255),
      phone_number       VARCHAR(20),
      metadata           JSONB DEFAULT '{}',
      created_at         TIMESTAMPTZ DEFAULT NOW(),
      updated_at         TIMESTAMPTZ DEFAULT NOW()
    );
  ELSE
    -- Add missing columns to existing payment_intents
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_intents' AND column_name='project_id') THEN
      ALTER TABLE payment_intents ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_intents' AND column_name='provider_id') THEN
      ALTER TABLE payment_intents ADD COLUMN provider_id VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_intents' AND column_name='phone_number') THEN
      ALTER TABLE payment_intents ADD COLUMN phone_number VARCHAR(20);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_intents' AND column_name='checkout_request_id') THEN
      ALTER TABLE payment_intents ADD COLUMN checkout_request_id VARCHAR(255);
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payment_intents_user ON payment_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_project ON payment_intents(project_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_provider ON payment_intents(provider_id);

-- ── 4. payment_logs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_logs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id       UUID NOT NULL REFERENCES payment_history(id) ON DELETE CASCADE,
  from_status      VARCHAR(50),
  to_status        VARCHAR(50),
  event_type       VARCHAR(50) NOT NULL
                   CHECK (event_type IN ('created','initiated','callback_received','verified','completed','failed','refunded','expired')),
  provider         VARCHAR(50),
  provider_tx_id   VARCHAR(255),
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_logs_payment ON payment_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_created ON payment_logs(created_at);

-- ── 5. background_jobs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS background_jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_type        VARCHAR(100) NOT NULL
                  CHECK (job_type IN ('pdf_generation','dxf_generation','shapefile_generation','report_processing','payment_verification','email_notification')),
  payload         JSONB NOT NULL DEFAULT '{}',
  status          VARCHAR(50) DEFAULT 'pending'
                  CHECK (status IN ('pending','queued','running','completed','failed','cancelled')),
  priority        INT DEFAULT 5,
  attempts        INT DEFAULT 0,
  max_attempts    INT DEFAULT 3,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  error_message   TEXT,
  result          JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status);
CREATE INDEX IF NOT EXISTS idx_background_jobs_type ON background_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_background_jobs_priority ON background_jobs(priority DESC, created_at ASC);

-- ── 6. form_c22_audits ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_c22_audits (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  generated_by    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  station_count   INT,
  area_ha         DECIMAL(12,4),
  precision_ratio DECIMAL(12,2),
  angular_misclosure_sec DECIMAL(10,2),
  linear_misclosure_m    DECIMAL(10,4),
  file_size_bytes INT,
  file_hash       VARCHAR(64),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_form_c22_audits_project ON form_c22_audits(project_id);

-- ── Updated-at triggers (idempotent with DROP IF EXISTS) ────────────────────
DROP TRIGGER IF EXISTS update_peer_reviews_updated_at ON peer_reviews;
CREATE TRIGGER update_peer_reviews_updated_at
  BEFORE UPDATE ON peer_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_intents_updated_at ON payment_intents;
CREATE TRIGGER update_payment_intents_updated_at
  BEFORE UPDATE ON payment_intents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_background_jobs_updated_at ON background_jobs;
CREATE TRIGGER update_background_jobs_updated_at
  BEFORE UPDATE ON background_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
