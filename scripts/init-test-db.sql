-- =============================================================================
-- METARDU Test Database Initialization
-- Creates schema + seed data for Docker-based testing
-- =============================================================================

-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- CORE TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(255),
    isk_number VARCHAR(50),
    verified_isk BOOLEAN DEFAULT FALSE,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255),
    firm_name VARCHAR(255),
    isk_number VARCHAR(50),
    phone VARCHAR(50),
    address TEXT,
    bio TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    survey_type VARCHAR(100),
    client_name VARCHAR(255),
    location TEXT,
    lr_number VARCHAR(100),
    folio_number VARCHAR(100),
    register_number VARCHAR(100),
    fir_number VARCHAR(100),
    registration_block VARCHAR(100),
    registration_district VARCHAR(100),
    locality VARCHAR(255),
    computations_no VARCHAR(100),
    field_book_no VARCHAR(100),
    file_reference VARCHAR(100),
    ref_no VARCHAR(100),
    survey_date TIMESTAMPTZ,
    area_ha DOUBLE PRECISION,
    utm_zone INTEGER DEFAULT 37,
    hemisphere VARCHAR(1) DEFAULT 'S',
    datum VARCHAR(50) DEFAULT 'Arc 1960',
    boundary_data JSONB,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    last_fieldbook_update TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_fieldbook_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    station VARCHAR(100),
    bearing DOUBLE PRECISION DEFAULT 0,
    distance DOUBLE PRECISION DEFAULT 0,
    raw_data JSONB,
    import_session_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, row_index)
);

CREATE TABLE IF NOT EXISTS survey_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    point_name VARCHAR(100),
    easting DOUBLE PRECISION,
    northing DOUBLE PRECISION,
    elevation DOUBLE PRECISION,
    description TEXT,
    geom GEOMETRY(Point, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS benchmarks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    easting DOUBLE PRECISION,
    northing DOUBLE PRECISION,
    elevation DOUBLE PRECISION,
    datum VARCHAR(50),
    description TEXT,
    geom GEOMETRY(Point, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100),
    serial_number VARCHAR(255),
    last_calibration_date TIMESTAMPTZ,
    interval_days INTEGER DEFAULT 365,
    calibration_date TIMESTAMPTZ,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SURVEY-SPECIFIC TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS network_adjustments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    stations JSONB,
    observations JSONB,
    adjusted_stations JSONB,
    summary JSONB,
    status VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mining_surveys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    mine_type VARCHAR(100),
    sections JSONB,
    grid_points JSONB,
    material_density_tm3 DOUBLE PRECISION DEFAULT 1.8,
    material_type VARCHAR(100),
    volume_result JSONB,
    status VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hydro_surveys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    sounding_data JSONB,
    water_level DOUBLE PRECISION,
    chart_datum DOUBLE PRECISION,
    survey_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gnss_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    status VARCHAR(50),
    input_files JSONB,
    results JSONB,
    error_msg TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS import_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_name VARCHAR(255),
    format VARCHAR(50),
    row_count INTEGER,
    status VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- BUSINESS TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS signatures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    signature_data TEXT,
    document_type VARCHAR(100),
    signed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action VARCHAR(255),
    table_name VARCHAR(255),
    record_id UUID,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS online_service_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    project_id UUID,
    service VARCHAR(100),
    input_summary TEXT,
    status VARCHAR(50) DEFAULT 'success',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_standards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country VARCHAR(10),
    standard_name VARCHAR(255),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    plan_id VARCHAR(50) DEFAULT 'free',
    status VARCHAR(50) DEFAULT 'active',
    trial_ends_at TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    payment_method VARCHAR(50),
    currency VARCHAR(10) DEFAULT 'KES',
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'viewer',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_fieldbook_project_id ON project_fieldbook_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_survey_points_project_id ON survey_points(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_equipment_user_id ON equipment(user_id);
CREATE INDEX IF NOT EXISTS idx_mining_surveys_project_id ON mining_surveys(project_id);

-- =============================================================================
-- LEAST-PRIVILEGE TEST ROLE
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'metardu_app_role') THEN
        CREATE ROLE metardu_app_role WITH LOGIN PASSWORD 'app_role_password';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE metardu_test TO metardu_app_role;
GRANT USAGE ON SCHEMA public TO metardu_app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO metardu_app_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO metardu_app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO metardu_app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO metardu_app_role;

-- =============================================================================
-- SEED DATA
-- =============================================================================

-- Test user: test@metardu.com / TestPass123!
-- bcrypt hash of 'TestPass123!' with 10 rounds
INSERT INTO users (id, email, password_hash, full_name, isk_number, verified_isk)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'test@metardu.com',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    'Test Surveyor',
    'ISK/1234/2024',
    TRUE
) ON CONFLICT (email) DO NOTHING;

INSERT INTO profiles (id, full_name, firm_name, isk_number)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Test Surveyor',
    'Metardu Test Firm',
    'ISK/1234/2024'
) ON CONFLICT (id) DO NOTHING;

-- Test project
INSERT INTO projects (id, name, survey_type, client_name, location, lr_number, utm_zone, hemisphere, user_id, survey_date)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'Test Cadastral Project',
    'cadastral',
    'Test Client Ltd',
    'Nairobi, Kenya',
    'LR 12345/67',
    37,
    'S',
    'a0000000-0000-0000-0000-000000000001',
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- Test fieldbook entries (traverse legs)
INSERT INTO project_fieldbook_entries (project_id, row_index, station, bearing, distance, raw_data)
VALUES
    ('b0000000-0000-0000-0000-000000000001', 0, 'A', 45.0, 100.0,
     '{"from":"A","to":"B","bearing":45.0,"distance":100.0,"easting":500000,"northing":9900000,"beaconNo":"B1"}'),
    ('b0000000-0000-0000-0000-000000000001', 1, 'B', 135.0, 80.0,
     '{"from":"B","to":"C","bearing":135.0,"distance":80.0,"easting":500070.71,"northing":9900070.71,"beaconNo":"B2"}'),
    ('b0000000-0000-0000-0000-000000000001', 2, 'C', 225.0, 100.0,
     '{"from":"C","to":"D","bearing":225.0,"distance":100.0,"easting":500127.28,"northing":9900014.14,"beaconNo":"B3"}'),
    ('b0000000-0000-0000-0000-000000000001', 3, 'D', 315.0, 80.0,
     '{"from":"D","to":"A","bearing":315.0,"distance":80.0,"easting":500056.57,"northing":9899943.43,"beaconNo":"B4"}')
ON CONFLICT (project_id, row_index) DO NOTHING;

-- Test benchmarks
INSERT INTO benchmarks (name, easting, northing, elevation, datum, description)
VALUES
    ('KN_BM_001', 500000, 9900000, 1674.5, 'Arc 1960', 'Nairobi CBD benchmark'),
    ('KN_BM_002', 500500, 9900500, 1680.2, 'Arc 1960', 'Westlands benchmark')
ON CONFLICT DO NOTHING;

-- Test equipment
INSERT INTO equipment (name, type, serial_number, last_calibration_date, interval_days, user_id)
VALUES
    ('Leica TS16', 'total_station', 'TS16-TEST-001', NOW() - INTERVAL '30 days', 365,
     'a0000000-0000-0000-0000-000000000001'),
    ('Trimble R12i', 'gnss', 'R12i-TEST-001', NOW() - INTERVAL '60 days', 365,
     'a0000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Survey standards
INSERT INTO survey_standards (country, standard_name, description)
VALUES
    ('KE', 'Survey Act Cap. 299', 'Kenya Survey Regulations 1994'),
    ('KE', 'RDM Volume 1.1', 'Road Design Manual - Kenya'),
    ('UG', 'Survey Act', 'Uganda Survey Standards')
ON CONFLICT DO NOTHING;

-- Log initialization
INSERT INTO audit_logs (action, table_name, details)
VALUES ('INIT', 'database', '{"message": "Test database initialized with sample data"}');

-- Verify
DO $$
DECLARE
    user_count INTEGER;
    project_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM users;
    SELECT COUNT(*) INTO project_count FROM projects;
    RAISE NOTICE 'Test DB initialized: % users, % projects', user_count, project_count;
END
$$;
