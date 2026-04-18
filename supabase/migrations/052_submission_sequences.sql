-- Submission sequence counter (replaces Supabase RPC)
CREATE TABLE IF NOT EXISTS submission_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surveyor_profile_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  current_sequence INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(surveyor_profile_id, year)
);
