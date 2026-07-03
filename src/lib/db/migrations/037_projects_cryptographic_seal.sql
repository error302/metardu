-- Migration 037: Add cryptographic_seal column to projects
-- Date: 2026-07-03
--
-- The /api/projects/[id]/approve route sets projects.cryptographic_seal
-- when a licensed surveyor locks a project. The column didn't exist,
-- causing the UPDATE to fail with a SQL error — which meant the
-- cryptographic seal was never produced and the project was never
-- actually locked.
--
-- This migration adds the column so the approve-and-lock workflow
-- works end-to-end.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS cryptographic_seal VARCHAR(64);

COMMENT ON COLUMN projects.cryptographic_seal IS 'SHA-256 hash of canonical JSON (control points + parcels) set when a licensed surveyor approves & locks the project. NULL until locked.';
