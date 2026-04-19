-- Update existing projects table to add missing columns
-- This script updates the projects table structure

-- Add status column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='projects' 
        AND column_name='status'
    ) THEN
        ALTER TABLE projects ADD COLUMN status VARCHAR(20) DEFAULT 'active';
    END IF;
END $$;

-- Add uuid column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='projects' 
        AND column_name='uuid'
    ) THEN
        ALTER TABLE projects ADD COLUMN uuid UUID UNIQUE DEFAULT gen_random_uuid();
    END IF;
END $$;

-- Add created_at and updated_at columns if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='projects' 
        AND column_name='created_at'
    ) THEN
        ALTER TABLE projects ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='projects' 
        AND column_name='updated_at'
    ) THEN
        ALTER TABLE projects ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- Update existing records to have default values
UPDATE projects 
SET status = 'active' 
WHERE status IS NULL;

UPDATE projects 
SET uuid = gen_random_uuid() 
WHERE uuid IS NULL;

UPDATE projects 
SET created_at = NOW() 
WHERE created_at IS NULL;

UPDATE projects 
SET updated_at = NOW() 
WHERE updated_at IS NULL;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_parcel_number ON projects(parcel_number);
CREATE INDEX IF NOT EXISTS idx_projects_county ON projects(county);

-- Enable Row Level Security if not already enabled
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own projects" ON projects;
DROP POLICY IF EXISTS "Users can insert own projects" ON projects;
DROP POLICY IF EXISTS "Users can update own projects" ON projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON projects;

-- Create RLS policies
CREATE POLICY "Users can view own projects" ON projects
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects" ON projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects" ON projects
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects" ON projects
    FOR DELETE USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON projects TO authenticated_users;
GRANT SELECT ON projects TO public;
