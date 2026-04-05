SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'surveyor_profiles'
ORDER BY ordinal_position;

ALTER TABLE surveyor_profiles
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS isk_active boolean DEFAULT true;

UPDATE surveyor_profiles
SET
  registration_number = COALESCE(registration_number, isk_number, ''),
  isk_active = COALESCE(isk_active, verified_isk, true)
WHERE registration_number IS NULL
   OR isk_active IS NULL;

WITH target_user AS (
  SELECT id, COALESCE(full_name, 'Mohammed Test Surveyor') AS full_name
  FROM users
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO surveyor_profiles (
  id,
  user_id,
  registration_number,
  full_name,
  firm_name,
  isk_active,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  t.id,
  'LSK/001/2024',
  t.full_name,
  'Metardu Survey Firm',
  true,
  now(),
  now()
FROM target_user t
WHERE NOT EXISTS (
  SELECT 1
  FROM surveyor_profiles sp
  WHERE sp.user_id = t.id
);

UPDATE surveyor_profiles
SET
  registration_number = COALESCE(NULLIF(registration_number, ''), 'LSK/001/2024'),
  full_name = COALESCE(NULLIF(full_name, ''), 'Mohammed Test Surveyor'),
  firm_name = COALESCE(NULLIF(firm_name, ''), 'Metardu Survey Firm'),
  isk_active = COALESCE(isk_active, true),
  updated_at = now()
WHERE user_id IN (
  SELECT id
  FROM users
  ORDER BY created_at ASC
  LIMIT 1
);

SELECT user_id, registration_number, full_name, firm_name, isk_active
FROM surveyor_profiles
ORDER BY updated_at DESC;
