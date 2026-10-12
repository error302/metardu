-- Persist the authored report content used by the existing report editor.
ALTER TABLE survey_reports ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE survey_reports ADD COLUMN IF NOT EXISTS input_data JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE survey_reports ADD COLUMN IF NOT EXISTS sections JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE survey_reports sr SET user_id = p.user_id
FROM projects p WHERE p.id = sr.project_id AND sr.user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_survey_reports_owner ON survey_reports(user_id);
