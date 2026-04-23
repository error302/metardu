-- Migration: Create field data tables for mobile PWA
-- Supports offline data collection with sync capability

-- Field observations table (for GPS/total station data)
CREATE TABLE IF NOT EXISTS survey_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    point_name TEXT NOT NULL,
    point_id UUID REFERENCES survey_points(id),
    observation_type TEXT NOT NULL CHECK (observation_type IN ('gps', 'total_station', 'level', 'manual')),
    -- Coordinates (UTM)
    northing DECIMAL(12, 4),
    easting DECIMAL(12, 4),
    elevation DECIMAL(10, 4),
    -- Geographic coordinates
    latitude DECIMAL(12, 8),
    longitude DECIMAL(12, 8),
    -- GPS quality metrics
    accuracy DECIMAL(8, 4),
    satellites INTEGER,
    solution_type TEXT CHECK (solution_type IN ('fixed', 'float', 'dgps', 'single')),
    hdop DECIMAL(6, 3),
    vdop DECIMAL(6, 3),
    pdop DECIMAL(6, 3),
    -- Instrument data
    instrument_height DECIMAL(8, 4),
    rod_height DECIMAL(8, 4),
    backsight TEXT,
    foresight TEXT,
    horizontal_angle DECIMAL(10, 6),
    vertical_angle DECIMAL(10, 6),
    slope_distance DECIMAL(10, 4),
    -- Environmental conditions
    temperature DECIMAL(6, 2),
    pressure DECIMAL(8, 2),
    humidity DECIMAL(5, 2),
    weather TEXT,
    notes TEXT,
    -- Metadata
    observed_by UUID REFERENCES auth.users(id),
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE survey_observations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their project's observations"
    ON survey_observations FOR SELECT
    USING (
        project_id IN (
            SELECT id FROM projects WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert observations to their projects"
    ON survey_observations FOR INSERT
    WITH CHECK (
        project_id IN (
            SELECT id FROM projects WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their project's observations"
    ON survey_observations FOR UPDATE
    USING (
        project_id IN (
            SELECT id FROM projects WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their project's observations"
    ON survey_observations FOR DELETE
    USING (
        project_id IN (
            SELECT id FROM projects WHERE user_id = auth.uid()
        )
    );

-- Indexes for performance
CREATE INDEX idx_survey_observations_project ON survey_observations(project_id);
CREATE INDEX idx_survey_observations_point ON survey_observations(point_id);
CREATE INDEX idx_survey_observations_type ON survey_observations(observation_type);
CREATE INDEX idx_survey_observations_synced ON survey_observations(synced_at);
CREATE INDEX idx_survey_observations_observed ON survey_observations(observed_at);

-- Field photos table
CREATE TABLE IF NOT EXISTS field_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    point_id UUID REFERENCES survey_points(id),
    point_name TEXT,
    storage_path TEXT NOT NULL,
    thumbnail TEXT,
    caption TEXT,
    orientation TEXT CHECK (orientation IN ('portrait', 'landscape')),
    captured_by UUID REFERENCES auth.users(id),
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE field_photos ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their project's photos"
    ON field_photos FOR SELECT
    USING (
        project_id IN (
            SELECT id FROM projects WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert photos to their projects"
    ON field_photos FOR INSERT
    WITH CHECK (
        project_id IN (
            SELECT id FROM projects WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their project's photos"
    ON field_photos FOR UPDATE
    USING (
        project_id IN (
            SELECT id FROM projects WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their project's photos"
    ON field_photos FOR DELETE
    USING (
        project_id IN (
            SELECT id FROM projects WHERE user_id = auth.uid()
        )
    );

-- Indexes
CREATE INDEX idx_field_photos_project ON field_photos(project_id);
CREATE INDEX idx_field_photos_point ON field_photos(point_id);
CREATE INDEX idx_field_photos_synced ON field_photos(synced_at);

-- Sync tracking table (optional - for server-side sync monitoring)
CREATE TABLE IF NOT EXISTS sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    device_id TEXT,
    sync_type TEXT NOT NULL, -- 'observations', 'photos', 'points'
    records_synced INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sync logs"
    ON sync_logs FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own sync logs"
    ON sync_logs FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Indexes
CREATE INDEX idx_sync_logs_project ON sync_logs(project_id);
CREATE INDEX idx_sync_logs_user ON sync_logs(user_id);
CREATE INDEX idx_sync_logs_completed ON sync_logs(completed_at);

-- Function to update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER update_survey_observations_timestamp
    BEFORE UPDATE ON survey_observations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_field_photos_timestamp
    BEFORE UPDATE ON field_photos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON survey_observations TO authenticated;
GRANT ALL ON field_photos TO authenticated;
GRANT ALL ON sync_logs TO authenticated;
