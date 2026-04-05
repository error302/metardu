-- Add missing columns for Phase 13 submission pipeline

-- Add columns to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS subtype VARCHAR(50);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS lr_number VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS county VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS district VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS locality VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS area_m2 DECIMAL(15,4);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS perimeter_m DECIMAL(15,4);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS precision_ratio VARCHAR(50);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS angular_misclosure DECIMAL(10,4);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS linear_misclosure DECIMAL(15,4);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS closing_error_e DECIMAL(15,4);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS closing_error_n DECIMAL(15,4);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';

-- Add columns to survey_points table
ALTER TABLE survey_points ADD COLUMN IF NOT EXISTS adjusted_easting DECIMAL(15,4);
ALTER TABLE survey_points ADD COLUMN IF NOT EXISTS adjusted_northing DECIMAL(15,4);
ALTER TABLE survey_points ADD COLUMN IF NOT EXISTS observed_bearing DECIMAL(15,6);
ALTER TABLE survey_points ADD COLUMN IF NOT EXISTS observed_distance DECIMAL(15,4);
ALTER TABLE survey_points ADD COLUMN IF NOT EXISTS point_type VARCHAR(50) DEFAULT 'beacon';
ALTER TABLE survey_points ADD COLUMN IF NOT EXISTS utm_zone VARCHAR(10) DEFAULT '37S';

-- Rename surveyor_profiles column if needed
-- isk_number is the registration number column - that's fine

-- Seed data with correct column names
INSERT INTO projects (id, user_id, name, subtype, lr_number, county, district, locality, area_m2, perimeter_m, precision_ratio, angular_misclosure, linear_misclosure, closing_error_e, closing_error_n, status) 
VALUES ('11111111-1111-1111-1111-111111111111', 'a3f4e6dd-57d5-4930-9209-a008ba9213fe', 'Test Cadastral Project — Karen Estate', 'cadastral_subdivision', 'LR 7896/1', 'Nairobi', 'Westlands', 'Karen', 12430.00, 448.70, '1:14200', 2.4, 0.038, 0.021, -0.031, 'active');

INSERT INTO survey_points (id, project_id, name, easting, northing, adjusted_easting, adjusted_northing, observed_bearing, observed_distance, point_type, utm_zone) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'A', 258430.000, 9859120.000, 258430.021, 9859120.031, 45.123456, 89.234, 'beacon', '37S'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'B', 258562.000, 9859098.000, 258562.019, 9859097.972, 135.456789, 134.567, 'beacon', '37S'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'C', 258701.000, 9859234.000, 258701.022, 9859234.028, 225.789012, 178.901, 'beacon', '37S'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', 'D', 258654.000, 9859401.000, 258654.020, 9859401.030, 315.012345, 167.890, 'beacon', '37S'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '11111111-1111-1111-1111-111111111111', 'E', 258523.000, 9859389.000, 258523.021, 9859389.029, 10.234567, 134.567, 'beacon', '37S');

INSERT INTO supporting_documents (id, project_id, type, label, required, file_url) VALUES
('11111111-1111-1111-1111-111111111110', '11111111-1111-1111-1111-111111111111', 'ppa2', 'Planning Permission (PPA2)', true, NULL),
('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'lcb_consent', 'Land Control Board Consent', false, NULL),
('11111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111111', 'beacon_cert', 'Beacon Certificate', true, NULL);
