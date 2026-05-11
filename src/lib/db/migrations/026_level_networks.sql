-- Migration 026: Level Network Tables
-- Stores leveling network data: observations, control points, and adjustment results.
-- Supports Kenya survey regulations compliance (misclosure checks per order).

-- Level network projects
CREATE TABLE IF NOT EXISTS level_networks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    survey_order VARCHAR(20) NOT NULL DEFAULT 'third',
        -- 'first', 'second', 'third', 'fourth'
    instrument VARCHAR(100),
    staff_a VARCHAR(100),
    staff_b VARCHAR(100),
    operator_id UUID REFERENCES auth.users(id),
    total_distance_m DOUBLE PRECISION NOT NULL DEFAULT 0,
    misclosure_mm DOUBLE PRECISION,
    allowable_misclosure_mm DOUBLE PRECISION,
    passed BOOLEAN,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
        -- 'pending', 'adjusted', 'approved', 'rejected'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Control points (benchmarks) used in leveling networks
CREATE TABLE IF NOT EXISTS level_control_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    network_id UUID NOT NULL REFERENCES level_networks(id) ON DELETE CASCADE,
    point_id VARCHAR(50) NOT NULL,
    description TEXT,
    original_rl DOUBLE PRECISION NOT NULL,
        -- Original known RL (before adjustment)
    adjusted_rl DOUBLE PRECISION,
        -- RL after LSQ adjustment
    sigma_rl DOUBLE PRECISION,
        -- Standard deviation of adjusted RL
    is_fixed BOOLEAN NOT NULL DEFAULT FALSE,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    order_class VARCHAR(20),
        -- Order classification of the benchmark itself
    UNIQUE(network_id, point_id)
);

-- Level observations (height differences between control points)
CREATE TABLE IF NOT EXISTS level_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    network_id UUID NOT NULL REFERENCES level_networks(id) ON DELETE CASCADE,
    from_point_id VARCHAR(50) NOT NULL,
    to_point_id VARCHAR(50) NOT NULL,
    observed_height_diff DOUBLE PRECISION NOT NULL,
        -- Observed height difference in metres
    distance DOUBLE PRECISION NOT NULL DEFAULT 30,
        -- Sight distance in metres
    weight DOUBLE PRECISION NOT NULL DEFAULT 1,
        -- Weight for LSQ (typically 1/d^2 where d in km)
    residual_mm DOUBLE PRECISION,
        -- Residual after adjustment (mm)
    standardized_residual DOUBLE PRECISION,
    reading_sequence INTEGER,
        -- Order of observation in the leveling run
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Adjustment results (stored for audit trail)
CREATE TABLE IF NOT EXISTS level_adjustment_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    network_id UUID NOT NULL REFERENCES level_networks(id) ON DELETE CASCADE,
    reference_variance DOUBLE PRECISION,
    degrees_of_freedom INTEGER,
    chi_square DOUBLE PRECISION,
    misclosure_mm DOUBLE PRECISION,
    allowable_misclosure_mm DOUBLE PRECISION,
    total_distance_km DOUBLE PRECISION,
    passed BOOLEAN,
    adjusted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_level_networks_project ON level_networks(project_id);
CREATE INDEX IF NOT EXISTS idx_level_control_points_network ON level_control_points(network_id);
CREATE INDEX IF NOT EXISTS idx_level_observations_network ON level_observations(network_id);
CREATE INDEX IF NOT EXISTS idx_level_adjustment_results_network ON level_adjustment_results(network_id);

-- RLS policies
ALTER TABLE level_networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE level_control_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE level_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE level_adjustment_results ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own project's level networks
CREATE POLICY "Users can view level networks in their projects"
    ON level_networks FOR SELECT
    USING (project_id IN (SELECT id FROM projects WHERE created_by = auth.uid()));

CREATE POLICY "Users can create level networks in their projects"
    ON level_networks FOR INSERT
    WITH CHECK (project_id IN (SELECT id FROM projects WHERE created_by = auth.uid()));

CREATE POLICY "Users can update level networks in their projects"
    ON level_networks FOR UPDATE
    USING (project_id IN (SELECT id FROM projects WHERE created_by = auth.uid()));

-- Same pattern for control points and observations
CREATE POLICY "Users can view level control points"
    ON level_control_points FOR SELECT
    USING (network_id IN (SELECT id FROM level_networks WHERE project_id IN (SELECT id FROM projects WHERE created_by = auth.uid())));

CREATE POLICY "Users can create level control points"
    ON level_control_points FOR INSERT
    WITH CHECK (network_id IN (SELECT id FROM level_networks WHERE project_id IN (SELECT id FROM projects WHERE created_by = auth.uid())));

CREATE POLICY "Users can view level observations"
    ON level_observations FOR SELECT
    USING (network_id IN (SELECT id FROM level_networks WHERE project_id IN (SELECT id FROM projects WHERE created_by = auth.uid())));

CREATE POLICY "Users can create level observations"
    ON level_observations FOR INSERT
    WITH CHECK (network_id IN (SELECT id FROM level_networks WHERE project_id IN (SELECT id FROM projects WHERE created_by = auth.uid())));

CREATE POLICY "Users can view adjustment results"
    ON level_adjustment_results FOR SELECT
    USING (network_id IN (SELECT id FROM level_networks WHERE project_id IN (SELECT id FROM projects WHERE created_by = auth.uid())));

CREATE POLICY "Users can create adjustment results"
    ON level_adjustment_results FOR INSERT
    WITH CHECK (network_id IN (SELECT id FROM level_networks WHERE project_id IN (SELECT id FROM projects WHERE created_by = auth.uid())));
