-- Create/update a deterministic test user for authenticated submission checks.
WITH upsert_user AS (
  INSERT INTO users (id, email, password_hash, full_name, isk_number)
  VALUES (
    '22222222-2222-2222-2222-222222222222'::uuid,
    'submission.test@metardu.local',
    crypt('MetarduTest@123', gen_salt('bf')),
    'Submission Test Surveyor',
    'LSK/001/2024'
  )
  ON CONFLICT (email) DO UPDATE
  SET
    password_hash = crypt('MetarduTest@123', gen_salt('bf')),
    full_name = EXCLUDED.full_name,
    isk_number = EXCLUDED.isk_number,
    updated_at = now()
  RETURNING id
)
INSERT INTO surveyor_profiles (
  id,
  user_id,
  full_name,
  isk_number,
  registration_number,
  firm_name,
  verified_isk,
  isk_active,
  profile_public,
  created_at,
  updated_at
)
SELECT
  '33333333-3333-3333-3333-333333333333'::uuid,
  id,
  'Submission Test Surveyor',
  'LSK/001/2024',
  'LSK/001/2024',
  'Metardu Survey Firm',
  true,
  true,
  true,
  now(),
  now()
FROM upsert_user
ON CONFLICT (id) DO UPDATE
SET
  user_id = EXCLUDED.user_id,
  full_name = EXCLUDED.full_name,
  isk_number = EXCLUDED.isk_number,
  registration_number = EXCLUDED.registration_number,
  firm_name = EXCLUDED.firm_name,
  verified_isk = EXCLUDED.verified_isk,
  isk_active = EXCLUDED.isk_active,
  updated_at = now();

SELECT id, email, full_name, isk_number FROM users WHERE email = 'submission.test@metardu.local';
SELECT user_id, registration_number, full_name, firm_name, isk_active FROM surveyor_profiles WHERE id = '33333333-3333-3333-3333-333333333333'::uuid;
