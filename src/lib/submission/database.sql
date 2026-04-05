-- Sprint 2: Phase 13 Close-Out Database Tables

-- Submissions audit table
CREATE TABLE IF NOT EXISTS submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  submission_ref text NOT NULL UNIQUE,
  revision integer NOT NULL DEFAULT 0,
  registration_number text NOT NULL,
  qa_passed boolean NOT NULL DEFAULT false,
  generated_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Supporting documents table
CREATE TABLE IF NOT EXISTS supporting_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'ppa2', 'lcb_consent', 'mutation_form', 'beacon_cert'
  )),
  label text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  file_url text,
  uploaded_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_submissions_registration_year ON submissions(registration_number, EXTRACT(YEAR FROM created_at));
CREATE INDEX IF NOT EXISTS idx_submissions_project ON submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_supporting_docs_project ON supporting_documents(project_id);
