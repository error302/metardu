-- Bind each server-hosted offline map file to an authenticated owner lookup.
-- A tile URL is not an access token; the API checks this key together with
-- the signed-in user's id before opening any MBTiles file.
-- UP:
ALTER TABLE field_basemaps
  ADD COLUMN IF NOT EXISTS storage_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_field_basemaps_storage_key
  ON field_basemaps(storage_key)
  WHERE storage_key IS NOT NULL;

-- DOWN
DROP INDEX IF EXISTS idx_field_basemaps_storage_key;
ALTER TABLE field_basemaps DROP COLUMN IF EXISTS storage_key;
