-- Migration: setout_source_metadata
-- Created: 2026-10-06

-- UP: Preserve the source and station context for field targets generated
-- from engineering schedules. Existing set-out rows receive empty metadata.
ALTER TABLE setout_definitions
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE setout_points
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- DOWN: Intentionally retain metadata. It is evidence about generated field
-- targets and dropping it would erase source provenance.

