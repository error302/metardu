-- Survey Reports Table for RDM 1.1 Table 5.4 Compliant Reports
CREATE TABLE survey_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  report_number text NOT NULL,
  report_title text NOT NULL,
  revision text NOT NULL DEFAULT 'Rev 0',
  status text NOT NULL DEFAULT 'draft'
    CONSTRAINT status_values CHECK (status IN ('draft','review','finalised')),
  input_data jsonb NOT NULL DEFAULT '{}',
  sections jsonb NOT NULL DEFAULT '[]',
  completeness integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_survey_reports_project ON survey_reports(project_id);
CREATE INDEX idx_survey_reports_user ON survey_reports(user_id);

ALTER TABLE survey_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own reports" ON survey_reports
  FOR ALL USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_survey_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER survey_reports_updated_at
  BEFORE UPDATE ON survey_reports
  FOR EACH ROW EXECUTE FUNCTION update_survey_reports_updated_at();
