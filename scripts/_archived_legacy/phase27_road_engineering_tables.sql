-- ============================================================
-- Phase 27: Road Engineering Tables
-- Persists road design, horizontal/vertical alignment,
-- cross-sections, earthworks, and road-reserve parcels
-- Self-hosted PostgreSQL on GCP VM — plain DDL, no RLS
-- ============================================================

-- 1. Road alignments — one per project road design
CREATE TABLE IF NOT EXISTS road_alignments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  road_name               TEXT NOT NULL,
  start_chainage          NUMERIC(10,3) NOT NULL DEFAULT 0,
  datum                   TEXT NOT NULL DEFAULT 'WGS-84',
  coordinate_system       TEXT NOT NULL DEFAULT 'UTM Zone 37S',
  design_speed            INTEGER NOT NULL,
  road_class              TEXT NOT NULL CHECK (road_class IN ('A','B','C','D','E','F','G','H','J','K','L','M','N','P')),
  terrain_type            TEXT CHECK (terrain_type IN ('flat','rolling','mountainous','escarpment')),
  standard                TEXT NOT NULL DEFAULT 'KRDM2017' CHECK (standard IN ('KRDM2017','KeRRA')),
  cross_section_template  JSONB,
  road_reserve_width      NUMERIC(8,2) DEFAULT 40,
  total_length            NUMERIC(10,3),
  status                  TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','final','as_built')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_road_alignments_project_id ON road_alignments(project_id);
CREATE INDEX IF NOT EXISTS idx_road_alignments_status    ON road_alignments(status);
CREATE INDEX IF NOT EXISTS idx_road_alignments_road_class ON road_alignments(road_class);

COMMENT ON TABLE road_alignments IS 'Road design header — one per project road, stores design parameters and cross-section template';
COMMENT ON COLUMN road_alignments.cross_section_template IS '{carriagewayWidth, shoulderWidth, cutSlope, fillSlope, camber, subgradeDepth}';
COMMENT ON COLUMN road_alignments.road_reserve_width IS 'Road reserve width in metres (default 40 for Class A)';
COMMENT ON COLUMN road_alignments.status IS 'draft | final | as_built';

-- 2. Alignment IPs — horizontal intersection points
CREATE TABLE IF NOT EXISTS alignment_ips (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alignment_id          UUID NOT NULL REFERENCES road_alignments(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  easting               NUMERIC(12,4) NOT NULL,
  northing              NUMERIC(12,4) NOT NULL,
  radius                NUMERIC(10,3),
  deflection_angle      NUMERIC(10,6),
  tangent_length        NUMERIC(10,3),
  arc_length            NUMERIC(10,3),
  chainage_tc           NUMERIC(10,3),
  chainage_mc           NUMERIC(10,3),
  chainage_ct           NUMERIC(10,3),
  sort_order            INTEGER NOT NULL,
  has_transition        BOOLEAN NOT NULL DEFAULT FALSE,
  transition_length_in  NUMERIC(10,3),
  transition_length_out NUMERIC(10,3),
  spiral_parameters     JSONB,
  computed              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alignment_ips_alignment_id ON alignment_ips(alignment_id);
CREATE INDEX IF NOT EXISTS idx_alignment_ips_sort_order   ON alignment_ips(alignment_id, sort_order);

COMMENT ON TABLE alignment_ips IS 'Horizontal alignment intersection points (PIs/IPs) with circular and spiral curve parameters';
COMMENT ON COLUMN alignment_ips.spiral_parameters IS '{Ls, A_param, tau, Xs, Ys, q, p}';

-- 3. Alignment vertical IPs — vertical intersection points
CREATE TABLE IF NOT EXISTS alignment_vertical_ips (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alignment_id  UUID NOT NULL REFERENCES road_alignments(id) ON DELETE CASCADE,
  chainage      NUMERIC(10,3) NOT NULL,
  reduced_level NUMERIC(10,4) NOT NULL,
  k_value       NUMERIC(10,3),
  gradient_in   NUMERIC(10,6),
  gradient_out  NUMERIC(10,6),
  curve_length  NUMERIC(10,3),
  sort_order    INTEGER NOT NULL,
  computed      BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alignment_vertical_ips_alignment_id ON alignment_vertical_ips(alignment_id);
CREATE INDEX IF NOT EXISTS idx_alignment_vertical_ips_sort_order   ON alignment_vertical_ips(alignment_id, sort_order);

COMMENT ON TABLE alignment_vertical_ips IS 'Vertical alignment intersection points (VIPs) defining grade lines and vertical curves';

-- 4. Cross-section stations — ground and design levels per chainage
CREATE TABLE IF NOT EXISTS cross_section_stations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alignment_id  UUID NOT NULL REFERENCES road_alignments(id) ON DELETE CASCADE,
  chainage      NUMERIC(10,3) NOT NULL,
  ground_level  NUMERIC(10,4) NOT NULL,
  design_level  NUMERIC(10,4),
  cut_area      NUMERIC(10,3),
  fill_area     NUMERIC(10,3),
  sort_order    INTEGER NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cross_section_stations_alignment_id ON cross_section_stations(alignment_id);
CREATE INDEX IF NOT EXISTS idx_cross_section_stations_sort_order   ON cross_section_stations(alignment_id, sort_order);

COMMENT ON TABLE cross_section_stations IS 'Cross-section ground levels at each chainage along the road alignment';

-- 5. Earthworks results — computed volumes per chainage interval
CREATE TABLE IF NOT EXISTS earthworks_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alignment_id    UUID NOT NULL REFERENCES road_alignments(id) ON DELETE CASCADE,
  chainage        NUMERIC(10,3) NOT NULL,
  cut_area        NUMERIC(10,3),
  fill_area       NUMERIC(10,3),
  cut_volume      NUMERIC(12,3),
  fill_volume     NUMERIC(12,3),
  method          TEXT NOT NULL DEFAULT 'end_area'
                  CHECK (method IN ('end_area','prismoidal')),
  cumulative_cut  NUMERIC(14,3),
  cumulative_fill NUMERIC(14,3),
  net_volume      NUMERIC(14,3),
  mass_ordinate   NUMERIC(14,3),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_earthworks_results_alignment_id ON earthworks_results(alignment_id);
CREATE INDEX IF NOT EXISTS idx_earthworks_results_chainage     ON earthworks_results(alignment_id, chainage);

COMMENT ON TABLE earthworks_results IS 'Computed earthworks quantities per chainage interval — end-area or prismoidal method';

-- 6. Road reserve parcels — affected properties within road reserve
CREATE TABLE IF NOT EXISTS road_reserve_parcels (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alignment_id        UUID NOT NULL REFERENCES road_alignments(id) ON DELETE CASCADE,
  parcel_ref          TEXT NOT NULL,
  owner_name          TEXT NOT NULL,
  area_affected_sqm   NUMERIC(12,2),
  acquisition_type    TEXT NOT NULL DEFAULT 'full'
                      CHECK (acquisition_type IN ('full','partial','wayleave')),
  status              TEXT NOT NULL DEFAULT 'identified'
                      CHECK (status IN ('identified','surveyed','acquired','compensated')),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_road_reserve_parcels_alignment_id ON road_reserve_parcels(alignment_id);
CREATE INDEX IF NOT EXISTS idx_road_reserve_parcels_status       ON road_reserve_parcels(status);
CREATE INDEX IF NOT EXISTS idx_road_reserve_parcels_parcel_ref  ON road_reserve_parcels(parcel_ref);

COMMENT ON TABLE road_reserve_parcels IS 'Properties/parcels affected by road reserve — land acquisition tracking';
COMMENT ON COLUMN road_reserve_parcels.acquisition_type IS 'full | partial | wayleave';
COMMENT ON COLUMN road_reserve_parcels.status IS 'identified | surveyed | acquired | compensated';

-- 7. Auto-update triggers for tables with updated_at
-- (update_updated_at_column() defined in phase25_scheme_tables.sql)

DROP TRIGGER IF EXISTS trg_road_alignments_updated_at ON road_alignments;
CREATE TRIGGER trg_road_alignments_updated_at
  BEFORE UPDATE ON road_alignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_alignment_ips_updated_at ON alignment_ips;
CREATE TRIGGER trg_alignment_ips_updated_at
  BEFORE UPDATE ON alignment_ips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_alignment_vertical_ips_updated_at ON alignment_vertical_ips;
CREATE TRIGGER trg_alignment_vertical_ips_updated_at
  BEFORE UPDATE ON alignment_vertical_ips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_cross_section_stations_updated_at ON cross_section_stations;
CREATE TRIGGER trg_cross_section_stations_updated_at
  BEFORE UPDATE ON cross_section_stations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_earthworks_results_updated_at ON earthworks_results;
CREATE TRIGGER trg_earthworks_results_updated_at
  BEFORE UPDATE ON earthworks_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
