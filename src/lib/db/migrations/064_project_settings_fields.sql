-- Fields already exposed by project settings. Keep road metadata distinct from
-- canonical cadastral computation evidence in boundary_data.computation.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS terrain_type VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS road_name VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_chainage DOUBLE PRECISION;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS traverse JSONB;
