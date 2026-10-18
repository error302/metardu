-- Migration 068 used CREATE TABLE IF NOT EXISTS. A pre-existing observation
-- table therefore kept its legacy shape while the migration was recorded.
-- Add the missing contract without rewriting, renaming or deleting any
-- historical column, row, status, source hash or timestamp. Unknown counts
-- and instrument/source sizes remain NULL; no field verification is inferred.

DO $$
DECLARE column_info RECORD;
BEGIN
  -- Do not silently coerce an unexpected partial/custom schema.
  FOR column_info IN
    SELECT column_name, udt_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='observation_batches'
      AND column_name IN ('source_file_name','source_file_size','operator',
        'instrument_id','instrument_name','station','backsight',
        'instrument_height','target_height','prism_constant',
        'quality_metadata','point_count','observation_count')
  LOOP
    IF (column_info.column_name IN ('source_file_name','operator','instrument_name','station','backsight')
          AND column_info.udt_name NOT IN ('text','varchar'))
      OR (column_info.column_name IN ('source_file_size','point_count','observation_count')
          AND column_info.udt_name <> 'int4')
      OR (column_info.column_name='instrument_id' AND column_info.udt_name <> 'uuid')
      OR (column_info.column_name IN ('instrument_height','target_height','prism_constant')
          AND column_info.udt_name <> 'numeric')
      OR (column_info.column_name='quality_metadata' AND column_info.udt_name <> 'jsonb')
    THEN
      RAISE EXCEPTION 'Unexpected observation_batches column type for %. Review the schema before migration.', column_info.column_name;
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.observation_batches
  ADD COLUMN IF NOT EXISTS source_file_name TEXT,
  ADD COLUMN IF NOT EXISTS source_file_size INTEGER,
  ADD COLUMN IF NOT EXISTS operator TEXT,
  ADD COLUMN IF NOT EXISTS instrument_id UUID REFERENCES public.equipment(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS instrument_name TEXT,
  ADD COLUMN IF NOT EXISTS station TEXT,
  ADD COLUMN IF NOT EXISTS backsight TEXT,
  ADD COLUMN IF NOT EXISTS instrument_height NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS target_height NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS prism_constant NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS quality_metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS point_count INTEGER,
  ADD COLUMN IF NOT EXISTS observation_count INTEGER;
