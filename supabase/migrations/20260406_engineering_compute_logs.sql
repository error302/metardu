-- Engineering Compute Audit Log
-- Tracks all engineering computations for Director of Surveys compliance
-- Per Kenya RDM 1.1 and professional standards

CREATE TABLE IF NOT EXISTS engineering_compute_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  computation_type TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  input JSONB NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Audit fields
  computation_hash TEXT,
  duration_ms INTEGER,
  error_message TEXT
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_engineering_compute_logs_user ON engineering_compute_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_engineering_compute_logs_project ON engineering_compute_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_engineering_compute_logs_type ON engineering_compute_logs(computation_type);
CREATE INDEX IF NOT EXISTS idx_engineering_compute_logs_created ON engineering_compute_logs(created_at DESC);

-- RLS for privacy
ALTER TABLE engineering_compute_logs ENABLE ROW LEVEL SECURITY;

-- Engineers can view their own computations
CREATE POLICY "Users can view own engineering logs" ON engineering_compute_logs
  FOR SELECT USING (auth.uid() = user_id);

-- System can insert
CREATE POLICY "System can insert engineering logs" ON engineering_compute_logs
  FOR INSERT WITH CHECK (true);
