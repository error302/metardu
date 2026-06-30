-- Migration 013: Add missing columns to projects table
-- The API route /api/projects inserts surveyor_name and country but the schema lacks them.
-- This fixes the 500 error on project creation.

DO $$
BEGIN
  -- Add surveyor_name column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'surveyor_name'
  ) THEN
    ALTER TABLE projects ADD COLUMN surveyor_name VARCHAR(255);
  END IF;

  -- Add country column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'country'
  ) THEN
    ALTER TABLE projects ADD COLUMN country VARCHAR(100);
  END IF;
END $$;
