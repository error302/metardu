-- GeoNova PostGIS Spatial Indexing
-- Run this in Supabase SQL Editor

-- Enable PostGIS extension
create extension if not exists postgis;

-- Add geometry column (SRID 21037 = UTM Zone 37S, change for other zones)
alter table survey_points 
add column if not exists geom geometry(Point, 21037);

-- Create spatial index for fast spatial queries
create index if not exists survey_points_geom_idx
on survey_points using gist(geom);

-- Create function to auto-update geom on insert/update
create or replace function update_survey_point_geom()
returns trigger as $$
begin
  -- Only update if we have valid coordinates
  if new.easting is not null and new.northing is not null then
    -- Store as geometry for spatial queries
    -- Note: Using UTM Zone 37S (21037) - adjust for your zone
    new.geom = ST_SetSRID(
      ST_MakePoint(new.easting, new.northing), 
      21037
    );
  end if;
  return new;
end;
$$ language plpgsql;

-- Create trigger to auto-update geometry
drop trigger if exists survey_points_geom_trigger on survey_points;
create trigger survey_points_geom_trigger
before insert or update on survey_points
for each row execute function update_survey_point_geom();

-- Update existing points
update survey_points 
set geom = ST_SetSRID(ST_MakePoint(easting, northing), 21037)
where easting is not null and northing is not null;

-- Example spatial queries:

-- Find all points within 100m of a given point
-- SELECT * FROM survey_points 
-- WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint(500000, 4500000), 21037), 100);

-- Find nearest point to a given location
-- SELECT * FROM survey_points 
-- ORDER BY geom <-> ST_SetSRID(ST_MakePoint(500000, 4500000), 21037) 
-- LIMIT 1;

-- Find points within a bounding box
-- SELECT * FROM survey_points 
-- WHERE geom && ST_MakeEnvelope(499000, 4499000, 501000, 4501000, 21037);
