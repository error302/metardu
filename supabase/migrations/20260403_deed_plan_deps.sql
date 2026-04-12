-- Phase 19: Deed Plan dependencies
-- Run in Supabase Dashboard > SQL Editor

-- Add client_name to projects (required for Form No. 4 title block)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS client_name   text,
  ADD COLUMN IF NOT EXISTS survey_date   date,
  ADD COLUMN IF NOT EXISTS area_ha       numeric(12, 4),
  ADD COLUMN IF NOT EXISTS area_acres    numeric(12, 4);

-- Surveyor profiles — ISK number and name for the certificate block
CREATE TABLE IF NOT EXISTS profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text,
  isk_number  text,
  firm_name   text,
  phone       text,
  email       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own profile"
  ON profiles FOR ALL
  USING (id = auth.uid());

-- Auto-create a profile row when a new user signs up
CREATE OR REPLACE FUNCTION create_profile_on_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_profile_on_signup();
