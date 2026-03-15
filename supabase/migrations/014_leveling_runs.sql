-- Create leveling_runs table for storing leveling observations

CREATE TABLE IF NOT EXISTS leveling_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_point TEXT,
  end_point TEXT,
  start_rl DOUBLE PRECISION,
  end_rl DOUBLE PRECISION,
  method TEXT DEFAULT 'rise_fall', -- rise_fall | hoc
  error_closure DOUBLE PRECISION,
  tolerance DOUBLE PRECISION,
  adjusted BOOLEAN DEFAULT false,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_leveling_runs_project ON leveling_runs(project_id);
CREATE INDEX idx_leveling_runs_created_by ON leveling_runs(created_by);

-- Leveling observations table
CREATE TABLE IF NOT EXISTS leveling_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES leveling_runs(id) ON DELETE CASCADE,
  point_id TEXT NOT NULL,
  point_type TEXT NOT NULL, -- bs | fs | is
  distance DOUBLE PRECISION,
  rl DOUBLE PRECISION,
  elevation DOUBLE PRECISION,
  backsight_rl DOUBLE PRECISION,
  foresight_rl DOUBLE PRECISION,
  remarks TEXT,
  sequence_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_leveling_observations_run ON leveling_observations(run_id);
CREATE INDEX idx_leveling_observations_sequence ON leveling_observations(run_id, sequence_order);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE leveling_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE leveling_observations;

-- Grant permissions
GRANT ALL ON leveling_runs TO service_role;
GRANT ALL ON leveling_runs TO authenticated;
GRANT ALL ON leveling_observations TO service_role;
GRANT ALL ON leveling_observations TO authenticated;
