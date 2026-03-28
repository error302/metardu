-- CPD Tables

CREATE TABLE cpd_records (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id),
  activity      text NOT NULL,
  points        integer NOT NULL,
  earned_at     timestamptz DEFAULT now(),
  reference_id  uuid,
  description   text NOT NULL,
  verifiable    boolean DEFAULT true,
  supporting_doc text
);

CREATE TABLE cpd_certificates (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid REFERENCES auth.users(id),
  year              integer NOT NULL,
  total_points      integer NOT NULL,
  generated_at      timestamptz DEFAULT now(),
  verification_code text UNIQUE NOT NULL,
  pdf_path          text,
  UNIQUE(user_id, year)
);

ALTER TABLE cpd_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE cpd_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own cpd" ON cpd_records
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "own certs" ON cpd_certificates
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "verify certs" ON cpd_certificates
  FOR SELECT USING (true);

-- Indexes
CREATE INDEX idx_cpd_user ON cpd_records(user_id);
CREATE INDEX idx_cpd_year ON cpd_certificates(user_id, year);
