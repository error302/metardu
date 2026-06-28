-- ──────────────────────────────────────────────────────────────────────────
-- Migration 021: Historic Field Record (F/R) Index Vault
--
-- Crowdsourced spatial index of historic survey field records.
-- Surveyors can search by area, parcel number, or F/R number to find
-- old field records that have touched a neighborhood.
--
-- This saves hundreds of collective hours of archival research at
-- Ardhi House and the Survey of Kenya records office.
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS field_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fr_number       VARCHAR(100) NOT NULL,
    fr_type         VARCHAR(50) DEFAULT 'cadastral',
    -- Location (approximate centroid of the survey area)
    easting         DOUBLE PRECISION NOT NULL,
    northing        DOUBLE PRECISION NOT NULL,
    utm_zone        INTEGER NOT NULL DEFAULT 37,
    datum           VARCHAR(50) NOT NULL DEFAULT 'Arc 1960',
    -- Area details
    county          VARCHAR(100),
    sub_county      VARCHAR(100),
    locality        TEXT,
    registry_block  VARCHAR(50),
    sheet_number    VARCHAR(50),
    -- Survey details
    survey_type     VARCHAR(50),
    surveyor_name   VARCHAR(200),
    survey_year     INTEGER,
    parcel_numbers  TEXT[],  -- Array of parcel numbers referenced
    -- Metadata
    description     TEXT,
    source          VARCHAR(50) DEFAULT 'manual',  -- manual, ardhi_house, crowdsourced
    is_verified     BOOLEAN DEFAULT FALSE,
    -- Contributor
    contributed_by  UUID REFERENCES users(id),
    contributed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Full-text search
    search_vector   tsvector
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_fr_number ON field_records(fr_number);
CREATE INDEX IF NOT EXISTS idx_fr_coords ON field_records(easting, northing);
CREATE INDEX IF NOT EXISTS idx_fr_county ON field_records(county, sub_county);
CREATE INDEX IF NOT EXISTS idx_fr_year ON field_records(survey_year);
CREATE INDEX IF NOT EXISTS idx_fr_search ON field_records USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_fr_parcels ON field_records USING gin(parcel_numbers);

-- Auto-update search vector on insert/update
CREATE OR REPLACE FUNCTION update_fr_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('english',
        coalesce(NEW.fr_number, '') || ' ' ||
        coalesce(NEW.locality, '') || ' ' ||
        coalesce(NEW.county, '') || ' ' ||
        coalesce(NEW.sub_county, '') || ' ' ||
        coalesce(NEW.registry_block, '') || ' ' ||
        coalesce(NEW.surveyor_name, '') || ' ' ||
        coalesce(NEW.description, '') || ' ' ||
        coalesce(array_to_string(NEW.parcel_numbers, ' '), '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fr_search_vector_trigger
    BEFORE INSERT OR UPDATE ON field_records
    FOR EACH ROW EXECUTE FUNCTION update_fr_search_vector();

-- Row Level Security — readable by all authenticated, writable by contributor
ALTER TABLE field_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY fr_read_all ON field_records
    FOR SELECT USING (true);

CREATE POLICY fr_write_contributor ON field_records
    FOR ALL USING (contributed_by = auth.uid() OR contributed_by = current_setting('app.current_user_id', true)::UUID);

-- ─── Helper: find nearby field records ─────────────────────────────────────

CREATE OR REPLACE FUNCTION find_nearby_field_records(
    p_easting   DOUBLE PRECISION,
    p_northing  DOUBLE PRECISION,
    p_radius_m  INTEGER DEFAULT 5000,
    p_limit     INTEGER DEFAULT 20
) RETURNS TABLE (
    id UUID,
    fr_number VARCHAR,
    fr_type VARCHAR,
    easting DOUBLE PRECISION,
    northing DOUBLE PRECISION,
    distance_m DOUBLE PRECISION,
    county VARCHAR,
    locality TEXT,
    survey_year INTEGER,
    surveyor_name VARCHAR,
    parcel_numbers TEXT[],
    description TEXT,
    is_verified BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id,
        f.fr_number,
        f.fr_type,
        f.easting,
        f.northing,
        ROUND(SQRT(POWER(f.easting - p_easting, 2) + POWER(f.northing - p_northing, 2))::numeric, 1)::DOUBLE PRECISION AS distance_m,
        f.county,
        f.locality,
        f.survey_year,
        f.surveyor_name,
        f.parcel_numbers,
        f.description,
        f.is_verified
    FROM field_records f
    WHERE SQRT(POWER(f.easting - p_easting, 2) + POWER(f.northing - p_northing, 2)) <= p_radius_m
    ORDER BY distance_m ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
