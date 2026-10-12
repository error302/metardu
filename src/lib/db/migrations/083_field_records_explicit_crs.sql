-- Field-record coordinates have historically inherited Arc 1960 / UTM 37S
-- defaults. Those values are not evidence of the source CRS, so preserve old
-- rows as CRS-unknown and only spatially index records with an explicit CRS.

ALTER TABLE field_records
  ADD COLUMN IF NOT EXISTS horizontal_crs VARCHAR(20),
  ADD COLUMN IF NOT EXISTS location_geom geometry(Point, 4326);

ALTER TABLE field_records
  ALTER COLUMN utm_zone DROP DEFAULT,
  ALTER COLUMN utm_zone DROP NOT NULL,
  ALTER COLUMN datum DROP DEFAULT,
  ALTER COLUMN datum DROP NOT NULL;

ALTER TABLE field_records
  DROP CONSTRAINT IF EXISTS field_records_horizontal_crs_check;

ALTER TABLE field_records
  ADD CONSTRAINT field_records_horizontal_crs_check
  CHECK (horizontal_crs IS NULL OR horizontal_crs IN (
    'EPSG:21036', 'EPSG:21037', 'EPSG:32736', 'EPSG:32737'
  ));

CREATE INDEX IF NOT EXISTS idx_field_records_location_geom
  ON field_records USING GIST (location_geom)
  WHERE location_geom IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_field_records_location_geography
  ON field_records USING GIST ((location_geom::geography))
  WHERE location_geom IS NOT NULL;

CREATE OR REPLACE FUNCTION set_field_record_location_geom()
RETURNS TRIGGER AS $$
DECLARE
  v_srid INTEGER;
BEGIN
  IF NEW.horizontal_crs IS NULL THEN
    -- Historic rows stay searchable by text, but must never be plotted or
    -- compared spatially until a contributor verifies their source CRS.
    NEW.location_geom := NULL;
    RETURN NEW;
  END IF;

  CASE NEW.horizontal_crs
    WHEN 'EPSG:21036' THEN v_srid := 21036;
    WHEN 'EPSG:21037' THEN v_srid := 21037;
    WHEN 'EPSG:32736' THEN v_srid := 32736;
    WHEN 'EPSG:32737' THEN v_srid := 32737;
    ELSE RAISE EXCEPTION 'Unsupported field-record CRS: %', NEW.horizontal_crs
      USING ERRCODE = '22023';
  END CASE;

  NEW.location_geom := ST_Transform(
    ST_SetSRID(ST_MakePoint(NEW.easting, NEW.northing), v_srid), 4326
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS field_record_location_geom_trigger ON field_records;
CREATE TRIGGER field_record_location_geom_trigger
  BEFORE INSERT OR UPDATE OF easting, northing, horizontal_crs ON field_records
  FOR EACH ROW EXECUTE FUNCTION set_field_record_location_geom();

-- Rebuild geometry only where an earlier version already stored explicit CRS
-- evidence. Rows with no CRS remain untouched and non-spatial.
UPDATE field_records
SET horizontal_crs = horizontal_crs
WHERE horizontal_crs IS NOT NULL AND location_geom IS NULL;

-- Drop the CRS-blind planar-distance overload. A query coordinate now carries
-- its CRS and is compared geodesically after both locations reach EPSG:4326.
DROP FUNCTION IF EXISTS find_nearby_field_records(
  DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, INTEGER
);
DROP FUNCTION IF EXISTS find_nearby_field_records(
  DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INTEGER, INTEGER
);

CREATE FUNCTION find_nearby_field_records(
  p_easting       DOUBLE PRECISION,
  p_northing      DOUBLE PRECISION,
  p_horizontal_crs TEXT,
  p_radius_m      INTEGER DEFAULT 5000,
  p_limit         INTEGER DEFAULT 20
) RETURNS TABLE (
  id UUID,
  fr_number VARCHAR,
  fr_type VARCHAR,
  easting DOUBLE PRECISION,
  northing DOUBLE PRECISION,
  horizontal_crs VARCHAR,
  distance_m DOUBLE PRECISION,
  county VARCHAR,
  locality TEXT,
  survey_year INTEGER,
  surveyor_name VARCHAR,
  parcel_numbers TEXT[],
  description TEXT,
  is_verified BOOLEAN
) AS $$
DECLARE
  v_srid INTEGER;
  v_query geography;
BEGIN
  CASE p_horizontal_crs
    WHEN 'EPSG:21036' THEN v_srid := 21036;
    WHEN 'EPSG:21037' THEN v_srid := 21037;
    WHEN 'EPSG:32736' THEN v_srid := 32736;
    WHEN 'EPSG:32737' THEN v_srid := 32737;
    ELSE RAISE EXCEPTION 'Unsupported field-record CRS: %', p_horizontal_crs
      USING ERRCODE = '22023';
  END CASE;

  IF p_easting IS NULL OR p_northing IS NULL OR
     p_radius_m IS NULL OR p_radius_m < 1 OR p_radius_m > 100000 OR
     p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Invalid field-record proximity search parameters'
      USING ERRCODE = '22023';
  END IF;

  v_query := ST_Transform(
    ST_SetSRID(ST_MakePoint(p_easting, p_northing), v_srid), 4326
  )::geography;

  RETURN QUERY
  SELECT f.id, f.fr_number, f.fr_type, f.easting, f.northing,
         f.horizontal_crs,
         ROUND(ST_Distance(f.location_geom::geography, v_query)::numeric, 1)::DOUBLE PRECISION,
         f.county, f.locality, f.survey_year, f.surveyor_name,
         f.parcel_numbers, f.description, f.is_verified
  FROM field_records AS f
  WHERE f.location_geom IS NOT NULL
    AND ST_DWithin(f.location_geom::geography, v_query, p_radius_m)
  ORDER BY f.location_geom::geography <-> v_query
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE
   SET search_path = public, pg_temp;

-- DOWN
-- Manual rollback only: dropping horizontal_crs would erase the CRS evidence
-- required to locate records added after this migration. Preserve that evidence
-- and forward-fix the application instead of automatically reverting it.
