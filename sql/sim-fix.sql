-- Critical fixes for Licensed Surveyor Simulation
ALTER TABLE users ADD COLUMN IF NOT EXISTS isk_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_isk BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS submission_sequence (
  id SERIAL PRIMARY KEY,
  current_val BIGINT NOT NULL,
  prefix TEXT
);

-- Seed admin with required surveyor fields
UPDATE users 
SET isk_number = 'ISK-5592', 
    verified_isk = true,
    full_name = 'Mohamed Dosho'
WHERE email = 'mohameddosho20@gmail.com';
