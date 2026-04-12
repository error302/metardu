CREATE TABLE geofusion_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  name VARCHAR(255) NOT NULL,
  description TEXT,
  source_srid INTEGER DEFAULT 4326,
  target_srid INTEGER DEFAULT 4326,
  status VARCHAR(50) DEFAULT 'pending',
  config JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fusion_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  geofusion_project_id UUID REFERENCES geofusion_projects(id) ON DELETE CASCADE,
  
  layer_name VARCHAR(255) NOT NULL,
  layer_type VARCHAR(50) NOT NULL,
  source_data JSONB,
  geometry_type VARCHAR(50),
  properties JSONB DEFAULT '{}',
  style_config JSONB DEFAULT '{}',
  visibility BOOLEAN DEFAULT true,
  opacity FLOAT DEFAULT 1.0,
  z_index INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fusion_alignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  geofusion_project_id UUID REFERENCES geofusion_projects(id) ON DELETE CASCADE,
  
  alignment_name VARCHAR(255) NOT NULL,
  source_layer_id UUID REFERENCES fusion_layers(id) ON DELETE SET NULL,
  target_layer_id UUID REFERENCES fusion_layers(id) ON DELETE SET NULL,
  
  transform_type VARCHAR(50) NOT NULL,
  transform_params JSONB,
  accuracy_score FLOAT,
  status VARCHAR(50) DEFAULT 'pending',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_geofusion_projects_project ON geofusion_projects(project_id);
CREATE INDEX idx_fusion_layers_project ON fusion_layers(geofusion_project_id);
CREATE INDEX idx_fusion_alignments_project ON fusion_alignments(geofusion_project_id);

ALTER TABLE geofusion_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE fusion_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fusion_alignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own geofusion projects" ON geofusion_projects
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage layers" ON fusion_layers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM geofusion_projects 
      WHERE geofusion_projects.id = fusion_layers.geofusion_project_id 
      AND geofusion_projects.user_id = auth.uid()
    )
  );
