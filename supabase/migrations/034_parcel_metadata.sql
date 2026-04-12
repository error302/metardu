-- Parcel metadata columns for Kenya land registration
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS parcel_number text,
ADD COLUMN IF NOT EXISTS registration_section text,
ADD COLUMN IF NOT EXISTS county_code text,
ADD COLUMN IF NOT EXISTS block_number integer,
ADD COLUMN IF NOT EXISTS parcel_ref integer;

CREATE INDEX IF NOT EXISTS idx_projects_parcel 
ON projects(registration_section, block_number, parcel_ref);

COMMENT ON COLUMN projects.parcel_number IS 'Full parcel number (e.g., NAIROBI BLOCK 2/1234)';
COMMENT ON COLUMN projects.registration_section IS 'Registration section code (e.g., NRBN, KIAMBU)';
COMMENT ON COLUMN projects.county_code IS 'County code (e.g., NBI, KBU)';
COMMENT ON COLUMN projects.block_number IS 'Block number if applicable';
COMMENT ON COLUMN projects.parcel_ref IS 'Parcel reference number';
