-- Metardu Platform — Engineering Sub-type Data Storage
-- Migration 021: Engineering survey sub-type structured data

-- Add engineering_subtype column to projects if not present
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS engineering_subtype text
    CHECK (engineering_subtype IN (
      'road', 'bridge', 'dam', 'pipeline', 'railway', 'building', 'tunnel'
    ));

-- Store sub-type computation data as JSONB — flexible per sub-type
CREATE TABLE IF NOT EXISTS engineering_survey_data (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subtype       text NOT NULL CHECK (subtype IN (
                  'road', 'bridge', 'dam', 'pipeline', 'railway', 'building', 'tunnel'
                )),
  data          jsonb NOT NULL DEFAULT '{}',
  computed_at   timestamptz DEFAULT now(),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(project_id)
);

-- RLS
ALTER TABLE engineering_survey_data ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Users can read own engineering data"
    ON engineering_survey_data FOR SELECT
    USING (
      project_id IN (
        SELECT id FROM projects WHERE created_by = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Users can insert own engineering data"
    ON engineering_survey_data FOR INSERT
    WITH CHECK (
      project_id IN (
        SELECT id FROM projects WHERE created_by = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Users can update own engineering data"
    ON engineering_survey_data FOR UPDATE
    USING (
      project_id IN (
        SELECT id FROM projects WHERE created_by = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_engineering_survey_data_project_id
  ON engineering_survey_data(project_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_engineering_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS engineering_survey_data_updated_at ON engineering_survey_data;

CREATE TRIGGER engineering_survey_data_updated_at
  BEFORE UPDATE ON engineering_survey_data
  FOR EACH ROW EXECUTE FUNCTION update_engineering_updated_at();

-- Grant permissions
GRANT ALL ON engineering_survey_data TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION update_engineering_updated_at TO service_role;