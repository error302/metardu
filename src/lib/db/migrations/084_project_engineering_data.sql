-- Migration: project_engineering_data
-- Created: 2026-10-06

-- UP: Engineering workflows already persist `projects.engineering_data` from
-- the application. This column was missing from the canonical migration set,
-- which makes fresh/self-hosted databases unable to load or save that data.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS engineering_data JSONB;

-- DOWN: Intentionally retain the JSONB column. Dropping it would delete saved
-- road/drainage design records and is not a safe automated rollback.

