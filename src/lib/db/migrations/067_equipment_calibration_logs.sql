-- Migration 067: Extend equipment table and add equipment_calibration

ALTER TABLE equipment
ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(255),
ADD COLUMN IF NOT EXISTS model VARCHAR(255),
ADD COLUMN IF NOT EXISTS purchase_date DATE,
ADD COLUMN IF NOT EXISTS purchase_cost NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active',
ADD COLUMN IF NOT EXISTS location VARCHAR(255),
ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE TABLE IF NOT EXISTS equipment_calibration (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  calibration_date DATE,
  next_calibration_date DATE,
  calibrated_by VARCHAR(255),
  calibration_lab VARCHAR(255),
  certificate_number VARCHAR(255),
  results VARCHAR(50),
  notes TEXT,
  report_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_calibration_equipment_id ON equipment_calibration(equipment_id);
