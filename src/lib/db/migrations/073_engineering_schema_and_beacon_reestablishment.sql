-- Alignment/schema reconciliation for the engineering + cadastral workflows.
--
-- The engineering routes (src/app/api/engineering/alignment, /ips, /data) were
-- written against a richer schema than the database actually has. In practice
-- this meant a road surveyor could design an alignment, press save, and get a
-- 500: every one of these columns was never migrated. A road survey that cannot
-- be saved is a road survey done on paper, so this migration closes that gap.
--
-- It also opens the beacon re-establishment path (Survey of Kenya Regulations
-- 1994 reg. 45: a damaged beacon cannot be repaired, it must be re-established
-- with a new observation and a recorded supersession of the old coordinate).

-- ─── road_alignments: the columns the alignment route already writes ────────

ALTER TABLE road_alignments ADD COLUMN IF NOT EXISTS road_name            VARCHAR(255);
ALTER TABLE road_alignments ADD COLUMN IF NOT EXISTS datum                VARCHAR(100);
ALTER TABLE road_alignments ADD COLUMN IF NOT EXISTS coordinate_system    VARCHAR(100);
ALTER TABLE road_alignments ADD COLUMN IF NOT EXISTS road_class           VARCHAR(100);
ALTER TABLE road_alignments ADD COLUMN IF NOT EXISTS terrain_type         VARCHAR(100);
ALTER TABLE road_alignments ADD COLUMN IF NOT EXISTS standard             VARCHAR(100);
ALTER TABLE road_alignments ADD COLUMN IF NOT EXISTS cross_section_template VARCHAR(100);
ALTER TABLE road_alignments ADD COLUMN IF NOT EXISTS road_reserve_width   NUMERIC(12,3);
ALTER TABLE road_alignments ADD COLUMN IF NOT EXISTS status               VARCHAR(20) NOT NULL DEFAULT 'DRAFT';

UPDATE road_alignments
   SET road_name = COALESCE(road_name, alignment_name)
 WHERE road_name IS NULL;

-- The route upserts on (project_id); a road may carry several alignments, so
-- the natural key is the alignment's own name.
CREATE UNIQUE INDEX IF NOT EXISTS idx_road_alignments_project_name
  ON road_alignments(project_id, road_name);

-- ─── alignment_ips: the columns the IP/geometry route already writes ───────

ALTER TABLE alignment_ips ADD COLUMN IF NOT EXISTS name                  VARCHAR(255);
ALTER TABLE alignment_ips ADD COLUMN IF NOT EXISTS sort_order            INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alignment_ips ADD COLUMN IF NOT EXISTS deflection_angle      NUMERIC(12,6);
ALTER TABLE alignment_ips ADD COLUMN IF NOT EXISTS tangent_length        NUMERIC(12,3);
ALTER TABLE alignment_ips ADD COLUMN IF NOT EXISTS arc_length            NUMERIC(12,3);
ALTER TABLE alignment_ips ADD COLUMN IF NOT EXISTS chainage_tc           NUMERIC(14,3);
ALTER TABLE alignment_ips ADD COLUMN IF NOT EXISTS chainage_mc           NUMERIC(14,3);
ALTER TABLE alignment_ips ADD COLUMN IF NOT EXISTS chainage_ct           NUMERIC(14,3);
ALTER TABLE alignment_ips ADD COLUMN IF NOT EXISTS has_transition        BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE alignment_ips ADD COLUMN IF NOT EXISTS transition_length_in  NUMERIC(12,3);
ALTER TABLE alignment_ips ADD COLUMN IF NOT EXISTS transition_length_out NUMERIC(12,3);
ALTER TABLE alignment_ips ADD COLUMN IF NOT EXISTS spiral_parameters     JSONB;
ALTER TABLE alignment_ips ADD COLUMN IF NOT EXISTS updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_alignment_ips_alignment_order
  ON alignment_ips(alignment_id, sort_order);

-- ─── engineering_survey_data: generic per-project engineering payloads ─────

ALTER TABLE engineering_survey_data ADD COLUMN IF NOT EXISTS subtype VARCHAR(60);
ALTER TABLE engineering_survey_data ADD COLUMN IF NOT EXISTS data    JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_engineering_survey_data_project
  ON engineering_survey_data(project_id);

-- ─── Beacon / monument re-establishment (reg. 45) ──────────────────────────
-- A destroyed beacon is never "edited" in place: the old coordinate stays in
-- the register as history and the new one supersedes it, so every document
-- that cited the old coordinate can still be explained.

ALTER TABLE beacon_registry ADD COLUMN IF NOT EXISTS re_established_at        TIMESTAMPTZ;
ALTER TABLE beacon_registry ADD COLUMN IF NOT EXISTS re_established_by        UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE beacon_registry ADD COLUMN IF NOT EXISTS re_established_from_id   UUID REFERENCES beacon_registry(id) ON DELETE SET NULL;
ALTER TABLE beacon_registry ADD COLUMN IF NOT EXISTS superseded_by_id        UUID REFERENCES beacon_registry(id) ON DELETE SET NULL;
ALTER TABLE beacon_registry ADD COLUMN IF NOT EXISTS status                   VARCHAR(20) NOT NULL DEFAULT 'ESTABLISHED';
ALTER TABLE beacon_registry ADD COLUMN IF NOT EXISTS reestablishment_note    TEXT;

ALTER TABLE boundary_monuments ADD COLUMN IF NOT EXISTS re_established        BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE boundary_monuments ADD COLUMN IF NOT EXISTS re_established_at      TIMESTAMPTZ;
ALTER TABLE boundary_monuments ADD COLUMN IF NOT EXISTS re_established_by      UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE boundary_monuments ADD COLUMN IF NOT EXISTS re_establishment_note TEXT;

CREATE INDEX IF NOT EXISTS idx_beacon_registry_status ON beacon_registry(status);

-- Only a live beacon may be superseded, and a superseded beacon keeps its
-- coordinates for the record (blueprint §2.3: never overwrite the evidence).
CREATE OR REPLACE FUNCTION enforce_beacon_supersession()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.superseded_by_id IS NOT NULL AND NEW.easting IS DISTINCT FROM OLD.easting THEN
    RAISE EXCEPTION 'A superseded beacon keeps its published coordinates; re-establish by inserting a new beacon that supersedes this one';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS beacon_registry_supersession ON beacon_registry;
CREATE TRIGGER beacon_registry_supersession
  BEFORE UPDATE ON beacon_registry
  FOR EACH ROW EXECUTE FUNCTION enforce_beacon_supersession();
