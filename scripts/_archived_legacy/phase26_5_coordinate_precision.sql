-- Phase 26.5: Add coordinate precision checks
-- Easting/Northing: max 3 decimal places (mm precision)
-- Area: max 6 decimal places
-- Bearing: max 4 decimal places

-- Traverse coordinates precision
ALTER TABLE traverse_coordinates 
  ALTER COLUMN easting TYPE NUMERIC(12,3),
  ALTER COLUMN northing TYPE NUMERIC(12,3),
  ALTER COLUMN elevation TYPE NUMERIC(10,3);

-- Parcel area precision
ALTER TABLE parcels 
  ALTER COLUMN area_ha TYPE NUMERIC(12,6);

-- Block description length
ALTER TABLE blocks 
  ALTER COLUMN description TYPE TEXT;
