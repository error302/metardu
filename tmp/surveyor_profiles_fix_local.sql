-- Local metardu DB migration (NextAuth/users-based stack)
ALTER TABLE surveyor_profiles
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS isk_active boolean DEFAULT true;

UPDATE surveyor_profiles
SET
  registration_number = COALESCE(registration_number, isk_number, ''),
  isk_active = COALESCE(isk_active, verified_isk, true)
WHERE registration_number IS NULL OR isk_active IS NULL;

-- Ensure the earliest user has a profile row (idempotent).
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
  gen_random_uuid(),
  u.id,
  COALESCE(NULLIF(u.full_name, ''), 'Metardu Surveyor'),
  COALESCE(NULLIF(u.isk_number, ''), 'LSK/001/2024'),
  COALESCE(NULLIF(u.isk_number, ''), 'LSK/001/2024'),
  'Metardu Survey Firm',
  true,
  true,
  true,
  now(),
  now()
FROM users u
WHERE u.id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
  AND NOT EXISTS (
    SELECT 1 FROM surveyor_profiles sp WHERE sp.user_id = u.id
  );

-- Normalize the same user's profile fields.
UPDATE surveyor_profiles
SET
  registration_number = COALESCE(NULLIF(registration_number, ''), COALESCE(NULLIF(isk_number, ''), 'LSK/001/2024')),
  full_name = COALESCE(NULLIF(full_name, ''), 'Mohammed Test Surveyor'),
  firm_name = COALESCE(NULLIF(firm_name, ''), 'Metardu Survey Firm'),
  isk_active = COALESCE(isk_active, true),
  verified_isk = COALESCE(verified_isk, true),
  updated_at = now()
WHERE user_id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1);

SELECT user_id, registration_number, full_name, firm_name, isk_active
FROM surveyor_profiles
ORDER BY updated_at DESC
LIMIT 5;
