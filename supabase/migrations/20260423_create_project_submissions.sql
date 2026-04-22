-- Migration: Create Project Submissions Table
-- Phase 13: Canonical Submission Domain Model
-- Date: 2026-04-23

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create project_submissions table
CREATE TABLE IF NOT EXISTS project_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    surveyor_profile_id UUID REFERENCES surveyor_profiles(id),
    submission_number TEXT NOT NULL,
    revision_code TEXT NOT NULL DEFAULT 'R00',
    submission_year INTEGER NOT NULL,
    package_status TEXT NOT NULL DEFAULT 'draft'
        CHECK (package_status IN ('draft', 'incomplete', 'ready', 'submitted')),
    required_sections JSONB NOT NULL DEFAULT '[]',
    generated_artifacts JSONB NOT NULL DEFAULT '{}',
    supporting_attachments JSONB NOT NULL DEFAULT '{}',
    validation_results JSONB NOT NULL DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_submissions_project_id ON project_submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_submissions_surveyor_id ON project_submissions(surveyor_profile_id);
CREATE INDEX IF NOT EXISTS idx_project_submissions_number ON project_submissions(submission_number);
CREATE INDEX IF NOT EXISTS idx_project_submissions_status ON project_submissions(package_status);

-- Enable RLS
ALTER TABLE project_submissions ENABLE ROW LEVEL SECURITY;

-- Create RLS policy: Owner access
CREATE POLICY "owner_access_project_submissions" ON project_submissions
    FOR ALL
    USING (
        project_id IN (
            SELECT id FROM projects WHERE user_id = auth.uid()
        )
    );

-- Create submission_sequence table for atomic numbering
CREATE TABLE IF NOT EXISTS submission_sequence (
    surveyor_profile_id UUID NOT NULL REFERENCES surveyor_profiles(id),
    year INTEGER NOT NULL,
    last_sequence INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (surveyor_profile_id, year)
);

-- Enable RLS on sequence table
ALTER TABLE submission_sequence ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for sequence
CREATE POLICY "owner_access_submission_sequence" ON submission_sequence
    FOR ALL
    USING (
        surveyor_profile_id IN (
            SELECT id FROM surveyor_profiles WHERE user_id = auth.uid()
        )
    );

-- Create function to atomically increment submission sequence
CREATE OR REPLACE FUNCTION increment_submission_sequence(
    p_surveyor_profile_id UUID,
    p_year INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_seq INTEGER;
BEGIN
    INSERT INTO submission_sequence (surveyor_profile_id, year, last_sequence)
    VALUES (p_surveyor_profile_id, p_year, 1)
    ON CONFLICT (surveyor_profile_id, year)
    DO UPDATE SET last_sequence = submission_sequence.last_sequence + 1
    RETURNING last_sequence INTO v_seq;
    RETURN v_seq;
END;
$$;

-- Add submission-related columns to projects table if they don't exist
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS lr_number TEXT,
    ADD COLUMN IF NOT EXISTS folio_number TEXT,
    ADD COLUMN IF NOT EXISTS register_number TEXT,
    ADD COLUMN IF NOT EXISTS fir_number TEXT,
    ADD COLUMN IF NOT EXISTS registration_block TEXT,
    ADD COLUMN IF NOT EXISTS registration_district TEXT,
    ADD COLUMN IF NOT EXISTS locality TEXT,
    ADD COLUMN IF NOT EXISTS computations_no TEXT,
    ADD COLUMN IF NOT EXISTS field_book_no TEXT,
    ADD COLUMN IF NOT EXISTS file_reference TEXT,
    ADD COLUMN IF NOT EXISTS current_submission_id UUID REFERENCES project_submissions(id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_submission_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_project_submissions_timestamp
    BEFORE UPDATE ON project_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_submission_timestamp();

-- Grant permissions
GRANT ALL ON project_submissions TO authenticated;
GRANT ALL ON submission_sequence TO authenticated;
GRANT EXECUTE ON FUNCTION increment_submission_sequence(UUID, INTEGER) TO authenticated;
