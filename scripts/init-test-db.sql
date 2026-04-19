-- Initialize Test Database
-- Creates clean test data for automated testing

-- Enable PostGIS extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_tiger_loader;

-- Create test user with least-privilege permissions
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'metardu_test_user') THEN
        CREATE ROLE metardu_test_user WITH LOGIN PASSWORD 'test_user_password';
    END IF;
END
$$;

-- Grant minimal required permissions
GRANT CONNECT ON DATABASE metardu_test TO metardu_test_user;
GRANT USAGE ON SCHEMA public TO metardu_test_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO metardu_test_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO metardu_test_user;

-- Create test data schema marker
COMMENT ON DATABASE metardu_test IS 'Test database - auto-initialized, can be dropped/recreated freely';

-- Insert test authentication data (passwords are hashed test values)
-- Default test user: test@metardu.com / testpass123
INSERT INTO users (email, password_hash, name, created_at)
VALUES 
    ('test@metardu.com', '$2b$10$test_hash_placeholder', 'Test User', NOW())
ON CONFLICT (email) DO NOTHING;

-- Insert test survey types data
INSERT INTO survey_standards (country, standard_name, description, created_at)
VALUES 
    ('KE', 'RDM Volume 1.1', 'Road Design Manual - Kenya', NOW()),
    ('KE', 'Survey Act Cap. 299', 'Survey Regulations 1994', NOW()),
    ('UG', 'UAVS Survey Standards', 'Uganda Survey Standards', NOW())
ON CONFLICT DO NOTHING;

-- Insert test benchmarks
INSERT INTO benchmarks (name, easting, northing, elevation, datum, description)
VALUES 
    ('TEST_BM_001', 500000, 100000, 1500.5, 'WGS84', 'Test benchmark 1'),
    ('TEST_BM_002', 500100, 100100, 1502.3, 'WGS84', 'Test benchmark 2')
ON CONFLICT DO NOTHING;

-- Create test projects
INSERT INTO projects (name, survey_type, client_name, location, created_at, user_id)
SELECT 
    'Test Project - Cadastral',
    'cadastral',
    'Test Client',
    'Test Location, Kenya',
    NOW(),
    (SELECT id FROM users WHERE email = 'test@metardu.com' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE name = 'Test Project - Cadastral');

-- Add test survey points
INSERT INTO survey_points (project_id, point_name, easting, northing, elevation, description)
SELECT 
    p.id,
    'P1',
    500123.456,
    100234.567,
    1501.234,
    'Test point 1'
FROM projects p
WHERE p.name = 'Test Project - Cadastral'
ON CONFLICT DO NOTHING;

-- Create test equipment records
INSERT INTO equipment (name, type, serial_number, calibration_date, owner_id)
VALUES 
    ('Test Total Station', 'total_station', 'TS-TEST-001', NOW(), NULL),
    ('Test GNSS Receiver', 'gnss', 'GNSS-TEST-001', NOW(), NULL)
ON CONFLICT DO NOTHING;

-- Log initialization
INSERT INTO audit_logs (action, table_name, user_id, details, created_at)
VALUES 
    ('INIT', 'database', NULL, 'Test database initialized with sample data', NOW());

-- Output initialization summary
SELECT 'Test database initialized successfully' AS status,
       COUNT(*) FILTER (WHERE schemaname = 'public') AS tables_count,
       COUNT(*) FILTER (WHERE rolname = 'metardu_test_user') AS test_users
FROM information_schema.tables
LEFT JOIN pg_roles ON 1=1
WHERE table_schema = 'public';
