-- Seed deterministic project data in local metardu DB for submission flow checks.
INSERT INTO projects (
  id,
  user_id,
  name,
  subtype,
  lr_number,
  county,
  district,
  locality,
  area_m2,
  perimeter_m,
  precision_ratio,
  angular_misclosure,
  linear_misclosure,
  closing_error_e,
  closing_error_n,
  status
)
VALUES (
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  'Test Cadastral Project - Karen Estate',
  'cadastral_subdivision',
  'LR 7896/1',
  'Nairobi',
  'Westlands',
  'Karen',
  12430.0000,
  448.7000,
  '1:14200',
  2.4000,
  0.0380,
  0.0210,
  -0.0310,
  'active'
)
ON CONFLICT (id) DO UPDATE
SET
  user_id = EXCLUDED.user_id,
  name = EXCLUDED.name,
  subtype = EXCLUDED.subtype,
  lr_number = EXCLUDED.lr_number,
  county = EXCLUDED.county,
  district = EXCLUDED.district,
  locality = EXCLUDED.locality,
  area_m2 = EXCLUDED.area_m2,
  perimeter_m = EXCLUDED.perimeter_m,
  precision_ratio = EXCLUDED.precision_ratio,
  angular_misclosure = EXCLUDED.angular_misclosure,
  linear_misclosure = EXCLUDED.linear_misclosure,
  closing_error_e = EXCLUDED.closing_error_e,
  closing_error_n = EXCLUDED.closing_error_n,
  status = EXCLUDED.status;

INSERT INTO survey_points (
  id,
  project_id,
  name,
  easting,
  northing,
  adjusted_easting,
  adjusted_northing,
  observed_bearing,
  observed_distance,
  point_type,
  utm_zone
)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'A', 258430.000, 9859120.000, 258430.0210, 9859120.0310, 45.123456, 89.2340, 'beacon', '37S'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'B', 258562.000, 9859098.000, 258562.0190, 9859097.9720, 135.456789, 134.5670, 'beacon', '37S'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'C', 258701.000, 9859234.000, 258701.0220, 9859234.0280, 225.789012, 178.9010, 'beacon', '37S'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'D', 258654.000, 9859401.000, 258654.0200, 9859401.0300, 315.012345, 167.8900, 'beacon', '37S'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'E', 258523.000, 9859389.000, 258523.0210, 9859389.0290, 10.234567, 134.5670, 'beacon', '37S')
ON CONFLICT (id) DO UPDATE
SET
  project_id = EXCLUDED.project_id,
  name = EXCLUDED.name,
  easting = EXCLUDED.easting,
  northing = EXCLUDED.northing,
  adjusted_easting = EXCLUDED.adjusted_easting,
  adjusted_northing = EXCLUDED.adjusted_northing,
  observed_bearing = EXCLUDED.observed_bearing,
  observed_distance = EXCLUDED.observed_distance,
  point_type = EXCLUDED.point_type,
  utm_zone = EXCLUDED.utm_zone;

INSERT INTO supporting_documents (
  id,
  project_id,
  type,
  label,
  required,
  file_url
)
VALUES
  ('11111111-1111-1111-1111-111111111110'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'ppa2', 'Planning Permission (PPA2)', true, NULL),
  ('11111111-1111-1111-1111-111111111111'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'lcb_consent', 'Land Control Board Consent', false, NULL),
  ('11111111-1111-1111-1111-111111111112'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'beacon_cert', 'Beacon Certificate', true, NULL)
ON CONFLICT (id) DO UPDATE
SET
  project_id = EXCLUDED.project_id,
  type = EXCLUDED.type,
  label = EXCLUDED.label,
  required = EXCLUDED.required,
  file_url = EXCLUDED.file_url;

SELECT id, user_id, lr_number, county, subtype
FROM projects
WHERE id = '11111111-1111-1111-1111-111111111111'::uuid;

SELECT count(*) AS beacon_count
FROM survey_points
WHERE project_id = '11111111-1111-1111-1111-111111111111'::uuid;

SELECT type, required, (file_url IS NOT NULL) AS has_file
FROM supporting_documents
WHERE project_id = '11111111-1111-1111-1111-111111111111'::uuid
ORDER BY type;
