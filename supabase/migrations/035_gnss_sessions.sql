-- GNSS Sessions Table
CREATE TABLE gnss_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'uploading',
  input_files jsonb NOT NULL DEFAULT '[]',
  results jsonb,
  error_msg text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE gnss_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own gnss sessions" ON gnss_sessions
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_gnss_sessions_project ON gnss_sessions(project_id);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_gnss_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER gnss_sessions_updated_at
  BEFORE UPDATE ON gnss_sessions
  FOR EACH ROW EXECUTE FUNCTION update_gnss_sessions_updated_at();
