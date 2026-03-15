-- Enable Realtime for survey tables
-- Run this migration to enable Supabase Realtime subscriptions

-- Enable realtime on survey_points table
ALTER PUBLICATION supabase_realtime ADD TABLE survey_points;

-- Enable realtime on traverses table
ALTER PUBLICATION supabase_realtime ADD TABLE traverses;

-- Enable realtime on projects table
ALTER PUBLICATION supabase_realtime ADD TABLE projects;

-- Create a function to enable realtime for specific tables (for dynamic use)
CREATE OR REPLACE FUNCTION enable_realtime_for_table(table_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', table_name);
END;
$$;

-- Create presence tracking table for cursor positions
CREATE TABLE IF NOT EXISTS presence_cursors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  cursor_x DOUBLE PRECISION,
  cursor_y DOUBLE PRECISION,
  active_tool TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_presence_cursors_project ON presence_cursors(project_id);
CREATE INDEX idx_presence_cursors_user ON presence_cursors(user_id);

-- Add unique constraint for ON CONFLICT
ALTER TABLE presence_cursors
ADD CONSTRAINT presence_project_user_unique
UNIQUE (project_id, user_id);

-- Function to update cursor position
CREATE OR REPLACE FUNCTION update_cursor_position(
  p_project_id UUID,
  p_cursor_x DOUBLE PRECISION,
  p_cursor_y DOUBLE PRECISION,
  p_active_tool TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  p_user_id UUID;
BEGIN
  p_user_id := auth.uid();
  
  INSERT INTO presence_cursors (project_id, user_id, cursor_x, cursor_y, active_tool)
  VALUES (p_project_id, p_user_id, p_cursor_x, p_cursor_y, p_active_tool)
  ON CONFLICT (project_id, user_id) 
  DO UPDATE SET 
    cursor_x = EXCLUDED.cursor_x,
    cursor_y = EXCLUDED.cursor_y,
    active_tool = EXCLUDED.active_tool,
    updated_at = now();
END;
$$;

-- Grant necessary permissions
GRANT ALL ON presence_cursors TO service_role;
GRANT ALL ON presence_cursors TO authenticated;
GRANT EXECUTE ON FUNCTION enable_realtime_for_table TO service_role;
GRANT EXECUTE ON FUNCTION update_cursor_position TO authenticated;
