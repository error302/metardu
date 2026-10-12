-- A project parcel must retain its own projected SRID and original input coordinates.
-- Existing 21037 geometries keep that SRID; the new type accepts other declared
-- project SRIDs. This migration must run before the project parcel batch route.
ALTER TABLE parcels
  ALTER COLUMN geom TYPE geometry(Polygon)
  USING geom::geometry(Polygon);

CREATE TABLE IF NOT EXISTS parcel_import_sources (
  parcel_id       UUID PRIMARY KEY REFERENCES parcels(id) ON DELETE CASCADE,
  source_crs      VARCHAR(32) NOT NULL,
  project_crs     VARCHAR(32) NOT NULL,
  source_vertices JSONB NOT NULL CHECK (jsonb_typeof(source_vertices) = 'array'),
  source_owner_name VARCHAR(255),
  source_owner_id   VARCHAR(100),
  transformed     BOOLEAN NOT NULL,
  imported_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  imported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION reject_parcel_import_source_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Original parcel import coordinates cannot be changed';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS parcel_import_source_immutable ON parcel_import_sources;
CREATE TRIGGER parcel_import_source_immutable
  BEFORE UPDATE ON parcel_import_sources
  FOR EACH ROW EXECUTE FUNCTION reject_parcel_import_source_update();

ALTER TABLE parcel_import_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parcel_import_sources_owner ON parcel_import_sources;
DROP POLICY IF EXISTS parcel_import_sources_owner_read ON parcel_import_sources;
DROP POLICY IF EXISTS parcel_import_sources_owner_insert ON parcel_import_sources;
CREATE POLICY parcel_import_sources_owner_read ON parcel_import_sources
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM parcels p
      JOIN projects project ON project.id = p.project_id
      WHERE p.id = parcel_import_sources.parcel_id
        AND project.user_id = NULLIF(current_setting('request.user_id', true), '')::uuid
    )
  );
CREATE POLICY parcel_import_sources_owner_insert ON parcel_import_sources
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM parcels p
      JOIN projects project ON project.id = p.project_id
      WHERE p.id = parcel_import_sources.parcel_id
        AND project.user_id = NULLIF(current_setting('request.user_id', true), '')::uuid
    )
  );

-- DOWN: DROP TABLE IF EXISTS parcel_import_sources; ALTER TABLE parcels
--       ALTER COLUMN geom TYPE geometry(Polygon, 21037);
-- Downcasting is only safe if every stored parcel still has SRID 21037.
