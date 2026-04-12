-- supabase/migrations/20260410_phase19_hydrographic.sql
-- Phase 19: Hydrographic Survey Module

-- Hydrographic survey sessions
CREATE TABLE IF NOT EXISTS hydro_surveys (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- Survey metadata
  hydro_type          text NOT NULL DEFAULT 'inland',
  vessel_name         text,
  sounder_model       text,
  survey_datum        text NOT NULL DEFAULT 'MSL',
  tide_gauge_ref      text,

  -- Raw soundings [{x, y, depth_m, timestamp}]
  soundings           jsonb NOT NULL DEFAULT '[]',

  -- Tide observations [{timestamp, water_level_m}]
  tide_observations   jsonb NOT NULL DEFAULT '[]',

  -- Reduced soundings (after tidal correction)
  reduced_soundings   jsonb DEFAULT NULL,

  -- Computed surface
  bathymetric_grid    jsonb DEFAULT NULL,

  -- Report of Survey fields
  ros_start_date      date,
  ros_end_date        date,
  ros_weather_summary text,
  ros_equipment_notes text,
  ros_interruptions   text,

  status              text NOT NULL DEFAULT 'pending'
);

ALTER TABLE hydro_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own hydro surveys"
  ON hydro_surveys FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE created_by = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS hydro_surveys_project_id_idx
  ON hydro_surveys(project_id);

-- Tide gauge reference stations (Kenya-specific)
CREATE TABLE IF NOT EXISTS tide_gauge_stations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id  text UNIQUE NOT NULL,
  name        text NOT NULL,
  county      text,
  latitude    numeric(10,6),
  longitude   numeric(10,6),
  datum       text DEFAULT 'MSL'
);

-- Seed Kenya tide gauge stations
INSERT INTO tide_gauge_stations (station_id, name, county, latitude, longitude)
VALUES
  ('KMD-MSA', 'Mombasa Tide Gauge', 'Mombasa', -4.0614, 39.6662),
  ('KMD-MLD', 'Malindi Tide Gauge', 'Kilifi', -3.2128, 40.1169),
  ('KMD-LMU', 'Lamu Tide Gauge', 'Lamu', -2.2694, 40.9020),
  ('KMD-KSM', 'Kisumu Gauge — Lake Victoria', 'Kisumu', -0.0917, 34.7500),
  ('KMD-HOM', 'Homa Bay Gauge', 'Homa Bay', -0.5267, 34.4571)
ON CONFLICT (station_id) DO NOTHING;
