-- Forward-only repair: preserve complete templates and source input identity.
-- Invalid legacy template JSON deliberately aborts; inspect/reconcile it rather
-- than replacing an unknown source record or altering an applied checksum.
ALTER TABLE public.road_alignments
  ALTER COLUMN cross_section_template TYPE JSONB USING cross_section_template::text::jsonb;
ALTER TABLE public.road_alignments
  ADD COLUMN IF NOT EXISTS vertical_station_interval_m DOUBLE PRECISION
  CHECK (vertical_station_interval_m > 0 AND vertical_station_interval_m < 'Infinity'::float8);
ALTER TABLE public.alignment_ips ADD COLUMN IF NOT EXISTS source_id TEXT;
ALTER TABLE public.alignment_vertical_ips ADD COLUMN IF NOT EXISTS source_id TEXT;
COMMENT ON COLUMN public.alignment_ips.source_id IS 'Original project input identity; distinct from the relational row UUID.';
