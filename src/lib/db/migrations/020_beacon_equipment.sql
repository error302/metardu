-- ──────────────────────────────────────────────────────────────────────────
-- Migration 020: Beacon Registry & Equipment Calibration
--
-- 1. beacon_registry — global searchable database of survey beacons
--    Surveyors can look up existing beacons by name, coordinate, or proximity
--    instead of re-entering beacon data from scratch for every project.
--
-- 2. equipment_calibration — tracks calibration dates for total stations,
--    levels, GNSS rovers. Alerts when calibration expires per Survey Act.
-- ──────────────────────────────────────────────────────────────────────────

-- ─── Beacon Registry ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS beacon_registry (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    beacon_number   VARCHAR(100) NOT NULL,
    beacon_type     VARCHAR(50) NOT NULL DEFAULT 'concrete',
    easting         DOUBLE PRECISION NOT NULL,
    northing        DOUBLE PRECISION NOT NULL,
    elevation       DOUBLE PRECISION,
    utm_zone        INTEGER NOT NULL DEFAULT 37,
    datum           VARCHAR(50) NOT NULL DEFAULT 'Arc 1960',
    projection      VARCHAR(50) NOT NULL DEFAULT 'UTM',
    county          VARCHAR(100),
    sub_county      VARCHAR(100),
    locality        TEXT,
    sheet_number    VARCHAR(50),
    established_by  VARCHAR(200),
    established_date DATE,
    condition       VARCHAR(50) DEFAULT 'good',
    description     TEXT,
    is_adopted      BOOLEAN DEFAULT FALSE,
    source          VARCHAR(50) DEFAULT 'manual',
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata        JSONB DEFAULT '{}'
);

-- Unique constraint on beacon number within a sheet
CREATE UNIQUE INDEX IF NOT EXISTS idx_beacon_number_sheet
    ON beacon_registry(beacon_number, sheet_number)
    WHERE sheet_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_beacon_coords
    ON beacon_registry(easting, northing);

CREATE INDEX IF NOT EXISTS idx_beacon_county
    ON beacon_registry(county, sub_county);

CREATE INDEX IF NOT EXISTS idx_beacon_type
    ON beacon_registry(beacon_type);

CREATE INDEX IF NOT EXISTS idx_beacon_number_trgm
    ON beacon_registry USING gin (beacon_number gin_trgm_ops);

-- ─── Equipment Calibration Tracking ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS equipment (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(200) NOT NULL,
    type            VARCHAR(50) NOT NULL,
    manufacturer    VARCHAR(200),
    model           VARCHAR(200),
    serial_number   VARCHAR(200),
    purchase_date   DATE,
    purchase_cost   DECIMAL(12, 2),
    status          VARCHAR(50) DEFAULT 'active',
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add missing columns if equipment table already existed (from earlier migration)
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(200);
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS model VARCHAR(200);
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS purchase_date DATE;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS purchase_cost DECIMAL(12, 2);
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_equipment_user
    ON equipment(user_id, status);

CREATE INDEX IF NOT EXISTS idx_equipment_type
    ON equipment(user_id, type);

CREATE TABLE IF NOT EXISTS equipment_calibration (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id    UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    calibration_date DATE NOT NULL,
    next_calibration_date DATE NOT NULL,
    calibrated_by   VARCHAR(200),
    calibration_lab VARCHAR(200),
    certificate_number VARCHAR(200),
    results         VARCHAR(50) DEFAULT 'pass',
    notes           TEXT,
    report_url      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calibration_equipment
    ON equipment_calibration(equipment_id, calibration_date DESC);

CREATE INDEX IF NOT EXISTS idx_calibration_user_dates
    ON equipment_calibration(user_id, next_calibration_date);

CREATE INDEX IF NOT EXISTS idx_calibration_overdue
    ON equipment_calibration(user_id, next_calibration_date);

-- ─── Row Level Security ────────────────────────────────────────────────────

ALTER TABLE beacon_registry ENABLE ROW LEVEL SECURITY;
-- Beacon registry is readable by all authenticated users, writable by owner/admin
CREATE POLICY beacon_read_all ON beacon_registry
    FOR SELECT USING (true);
CREATE POLICY beacon_write_owner ON beacon_registry
    FOR ALL USING (created_by = current_setting('app.current_user_id', true)::UUID);

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY equipment_user_policy ON equipment
    FOR ALL USING (user_id = current_setting('app.current_user_id', true)::UUID);

ALTER TABLE equipment_calibration ENABLE ROW LEVEL SECURITY;
CREATE POLICY calibration_user_policy ON equipment_calibration
    FOR ALL USING (user_id = current_setting('app.current_user_id', true)::UUID);

-- ─── Helper: find nearby beacons ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION find_nearby_beacons(
    p_easting   DOUBLE PRECISION,
    p_northing  DOUBLE PRECISION,
    p_radius_m  INTEGER DEFAULT 500,
    p_limit     INTEGER DEFAULT 20
) RETURNS TABLE (
    id UUID,
    beacon_number VARCHAR,
    beacon_type VARCHAR,
    easting DOUBLE PRECISION,
    northing DOUBLE PRECISION,
    distance_m DOUBLE PRECISION,
    county VARCHAR,
    locality TEXT,
    condition VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        b.id,
        b.beacon_number,
        b.beacon_type,
        b.easting,
        b.northing,
        ROUND(SQRT(POWER(b.easting - p_easting, 2) + POWER(b.northing - p_northing, 2))::numeric, 2)::DOUBLE PRECISION AS distance_m,
        b.county,
        b.locality,
        b.condition
    FROM beacon_registry b
    WHERE SQRT(POWER(b.easting - p_easting, 2) + POWER(b.northing - p_northing, 2)) <= p_radius_m
    ORDER BY distance_m ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Helper: get calibration status ────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_calibration_status(equip_id UUID)
RETURNS TABLE (
    last_calibrated DATE,
    next_calibration DATE,
    days_until_expiry INTEGER,
    is_overdue BOOLEAN,
    is_expiring_soon BOOLEAN
) AS $$
DECLARE
    latest_cal equipment_calibration%ROWTYPE;
BEGIN
    SELECT * INTO latest_cal
    FROM equipment_calibration
    WHERE equipment_id = equip_id
    ORDER BY calibration_date DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::DATE, NULL::DATE, NULL::INTEGER, FALSE, FALSE;
        RETURN;
    END IF;

    RETURN QUERY SELECT
        latest_cal.calibration_date,
        latest_cal.next_calibration_date,
        (latest_cal.next_calibration_date - CURRENT_DATE)::INTEGER,
        (latest_cal.next_calibration_date < CURRENT_DATE),
        (latest_cal.next_calibration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days');
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
