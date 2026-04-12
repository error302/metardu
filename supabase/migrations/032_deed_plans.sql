-- supabase/migrations/032_deed_plans.sql

CREATE TABLE deed_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  survey_number TEXT NOT NULL,
  drawing_number TEXT NOT NULL,
  parcel_number TEXT NOT NULL,
  locality TEXT,
  area_sqm FLOAT8,
  scale INTEGER,
  datum TEXT,
  
  input_data JSONB NOT NULL,
  svg_content TEXT,
  closure_check JSONB,
  
  status TEXT DEFAULT 'draft',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deed_plans_project ON deed_plans(project_id);
CREATE INDEX idx_deed_plans_user ON deed_plans(user_id);

ALTER TABLE deed_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own deed plans" ON deed_plans
  FOR ALL USING (auth.uid() = user_id);
