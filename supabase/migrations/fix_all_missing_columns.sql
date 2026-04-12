-- ============================================================================
-- METARDU Fix Migration: Add ALL missing columns to projects table
-- Run this on your live PostgreSQL database to fix the "survey_type does not exist" error
-- ============================================================================
--
-- This migration fixes the following issues:
-- 1. survey_type column missing from projects table
-- 2. client_name column missing
-- 3. surveyor_name column missing  
-- 4. country column missing
-- 5. datum column missing
-- 6. description column missing
-- 7. status column missing
-- 8. is_active column missing
-- 9. engineering_subtype column missing
-- 10. metadata column missing
-- 11. updated_at column missing
-- 12. Conflicting CHECK constraints on survey_type
-- ============================================================================

-- Step 1: Drop ALL existing check constraints on survey_type (they conflict)
DO $$
BEGIN
  ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_survey_type_check;
  ALTER TABLE projects DROP CONSTRAINT IF EXISTS survey_type_check;
  -- Drop by OID if named differently
  DECLARE
    r RECORD;
  BEGIN
    FOR r IN (
      SELECT conname FROM pg_constraint 
      WHERE conrelid = 'projects'::regclass 
      AND contype = 'c'
      AND consrc LIKE '%survey_type%'
    ) LOOP
      EXECUTE format('ALTER TABLE projects DROP CONSTRAINT %I', r.conname);
    END LOOP;
  END;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Step 2: Add missing columns (IF NOT EXISTS is safe)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS survey_type text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS engineering_subtype text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS datum text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS surveyor_name text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS beacon_count integer DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Step 3: Add the CORRECT survey_type CHECK constraint (matches TypeScript types)
ALTER TABLE projects
  ADD CONSTRAINT projects_survey_type_check
  CHECK (survey_type IS NULL OR survey_type IN (
    'cadastral',
    'engineering',
    'topographic',
    'geodetic',
    'mining',
    'hydrographic',
    'drone',
    'deformation',
    -- Also allow legacy values for backward compatibility
    'boundary',
    'road',
    'construction',
    'control',
    'leveling',
    'gnss',
    'other'
  ));

-- Step 4: Add engineering_subtype CHECK constraint
DO $$
BEGIN
  ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_engineering_subtype_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE projects
  ADD CONSTRAINT projects_engineering_subtype_check
  CHECK (engineering_subtype IS NULL OR engineering_subtype IN (
    'road',
    'bridge',
    'dam',
    'pipeline',
    'railway',
    'building',
    'tunnel',
    'general'
  ));

-- Step 5: Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Step 6: Migrate any existing rows with old survey_type values
UPDATE projects SET survey_type = 'cadastral' WHERE survey_type = 'boundary';
UPDATE projects SET survey_type = 'engineering' WHERE survey_type = 'road';
UPDATE projects SET survey_type = 'engineering' WHERE survey_type = 'construction';
UPDATE projects SET survey_type = 'geodetic' WHERE survey_type = 'control';
UPDATE projects SET survey_type = 'topographic' WHERE survey_type = 'leveling';
UPDATE projects SET survey_type = 'deformation' WHERE survey_type = 'gnss';

-- Verify
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'projects' 
ORDER BY ordinal_position;
