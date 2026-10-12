-- Bring document generation tracking onto the canonical document table.
-- Existing uploaded documents retain their content and nullable tracking key.
ALTER TABLE submission_documents ADD COLUMN IF NOT EXISTS document_id TEXT;
ALTER TABLE submission_documents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE submission_documents ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE submission_documents ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE submission_documents ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS submission_documents_project_document_key
  ON submission_documents(project_id, document_id);
