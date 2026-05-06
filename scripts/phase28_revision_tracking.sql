-- Phase 28: Revision tracking for submissions

-- Add revision number to parcels
ALTER TABLE parcels ADD COLUMN IF NOT EXISTS revision_number INT DEFAULT 1;

-- Submission tracking table
CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  submission_number INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' 
    CHECK (status IN ('draft', 'submitted', 'under_review', 'resubmission_required', 'approved', 'rejected')),
  submitted_by TEXT NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  documents JSONB DEFAULT '[]'::jsonb,
  parcel_count INT DEFAULT 0,
  deed_plan_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, submission_number)
);

CREATE INDEX IF NOT EXISTS idx_submissions_project ON submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);

-- Auto-increment revision_number on parcel update
CREATE OR REPLACE FUNCTION increment_parcel_revision()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parcel_number != OLD.parcel_number 
     OR NEW.area_ha != OLD.area_ha
     OR NEW.lr_number_proposed != OLD.lr_number_proposed
     OR NEW.lr_number_confirmed != OLD.lr_number_confirmed
     OR NEW.status != OLD.status THEN
    NEW.revision_number := OLD.revision_number + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_parcel_revision ON parcels;
CREATE TRIGGER set_parcel_revision
  BEFORE UPDATE ON parcels
  FOR EACH ROW
  EXECUTE FUNCTION increment_parcel_revision();
