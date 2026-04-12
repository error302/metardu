-- Parcels table for storing computed parcels/boundaries
CREATE TABLE IF NOT EXISTS parcels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  point_ids UUID[] DEFAULT '{}',
  boundary_points JSONB DEFAULT '[]',
  area_sqm NUMERIC(14,4),
  area_ha NUMERIC(14,6),
  area_acres NUMERIC(14,4),
  perimeter_m NUMERIC(14,4),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_parcels_project ON parcels(project_id);

-- Enable RLS
ALTER TABLE parcels ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view parcels in their projects" ON parcels
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert parcels in their projects" ON parcels
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update parcels in their projects" ON parcels
  FOR UPDATE USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete parcels in their projects" ON parcels
  FOR DELETE USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );
