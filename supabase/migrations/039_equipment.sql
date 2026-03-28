CREATE TABLE equipment (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               uuid REFERENCES auth.users(id),
  name                  text NOT NULL,
  type                  text NOT NULL,
  make                  text NOT NULL,
  model                 text NOT NULL,
  serial_number         text NOT NULL,
  purchase_date         date,
  last_calibration      date NOT NULL,
  next_calibration_due  date NOT NULL,
  calibration_interval  integer NOT NULL DEFAULT 12,
  cert_number           text,
  calibration_lab       text,
  status                text NOT NULL DEFAULT 'CURRENT',
  notes                 text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE TABLE calibration_records (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id   uuid REFERENCES equipment(id) ON DELETE CASCADE,
  date           date NOT NULL,
  cert_number    text,
  lab            text,
  technician     text,
  result         text NOT NULL,
  findings       text,
  corrections    text,
  next_due_date  date NOT NULL,
  document_path  text,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own equipment" ON equipment
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "own cal records" ON calibration_records
  FOR ALL USING (
    equipment_id IN (
      SELECT id FROM equipment WHERE user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION update_equipment_status()
RETURNS TRIGGER AS $$
BEGIN
  NEW.status = CASE
    WHEN NEW.next_calibration_due < CURRENT_DATE THEN 'OVERDUE'
    WHEN NEW.next_calibration_due < CURRENT_DATE + INTERVAL '30 days' THEN 'DUE_SOON'
    ELSE 'CURRENT'
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER equipment_status_trigger
  BEFORE INSERT OR UPDATE ON equipment
  FOR EACH ROW EXECUTE FUNCTION update_equipment_status();

CREATE INDEX idx_equipment_user ON equipment(user_id);
CREATE INDEX idx_equipment_status ON equipment(status);
CREATE INDEX idx_cal_records_equipment ON calibration_records(equipment_id);
