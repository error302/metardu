-- Professional Bodies Tables

CREATE TABLE professional_memberships (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             uuid REFERENCES auth.users(id),
  body                text NOT NULL,
  membership_number   text NOT NULL,
  membership_grade    text,
  verification_status text DEFAULT 'PENDING',
  verified_at         timestamptz,
  expires_at          date,
  verification_method text DEFAULT 'MANUAL',
  supporting_doc      text,
  created_at          timestamptz DEFAULT now(),
  UNIQUE(user_id, body)
);

ALTER TABLE professional_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own memberships" ON professional_memberships
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "read verified" ON professional_memberships
  FOR SELECT USING (verification_status = 'VERIFIED');

-- Admin policy (check role in application)
CREATE POLICY "admin manage memberships" ON professional_memberships
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Index
CREATE INDEX idx_professional_user ON professional_memberships(user_id);
CREATE INDEX idx_professional_status ON professional_memberships(verification_status);
