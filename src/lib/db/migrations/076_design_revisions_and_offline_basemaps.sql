-- Real design revisions (blueprint §28, §19, §14.3).
--
-- Projects faked a revision: `SELECT updated_at::text AS revision` dressed a
-- timestamp as a revision number, so "which design is this drawing from?" had
-- no answer and alignment edits (which DELETE and re-insert IPs) left no audit
-- trail at all. A professional set-out and a Cap. 299 submission both need to
-- name the design revision they were produced from.
--
-- design_revisions is that register: append-only, per project, per discipline,
-- carrying the revision label, the source data it came from and a content hash.
-- The old pseudo-revision stays readable as `legacy_updated_at` so optimistic
-- concurrency checks keep working, but it is no longer called a revision.

CREATE TABLE IF NOT EXISTS design_revisions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  discipline        VARCHAR(40) NOT NULL DEFAULT 'general'
                    CHECK (discipline IN ('general', 'road', 'cadastral', 'topographic', 'construction', 'structural')),
  entity_type       VARCHAR(60) NOT NULL,          -- alignment | surface | parcel_grid | plan_set | profile
  entity_id         VARCHAR(255),                 -- nullable for whole-project revisions
  revision          VARCHAR(20) NOT NULL,         -- R01, R02, ... (human-facing)
  revision_number   INTEGER NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED', 'VOID')),
  supersedes_id     UUID REFERENCES design_revisions(id) ON DELETE SET NULL,
  source_revision   VARCHAR(60),                  -- data revision this design was derived from
  summary           TEXT,
  content_hash      VARCHAR(128),                 -- hash of the design payload
  crs               VARCHAR(32),
  payload           JSONB NOT NULL DEFAULT '{}',  -- the design as stored, for diffing/reconstruction
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_design_revisions_project
  ON design_revisions(project_id, discipline, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_design_revisions_entity
  ON design_revisions(project_id, entity_type, entity_id, revision_number DESC);
-- One live revision per (project, discipline, entity) — supersession replaces it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_design_revisions_current
  ON design_revisions(project_id, discipline, entity_type, COALESCE(entity_id, ''))
  WHERE supersedes_id IS NULL AND status <> 'VOID';

-- A published revision is evidence: it may be superseded, never rewritten.
CREATE OR REPLACE FUNCTION reject_design_revision_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'design_revisions are append-only (blueprint §28): supersede a revision instead of editing it';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS design_revisions_immutable ON design_revisions;
CREATE TRIGGER design_revisions_immutable
  BEFORE UPDATE OR DELETE ON design_revisions
  FOR EACH ROW EXECUTE FUNCTION reject_design_revision_update();

-- The current design revision per discipline, for dashboards and exports that
-- must state which design they were produced from.
CREATE OR REPLACE VIEW current_design_revisions AS
SELECT DISTINCT ON (project_id, discipline, entity_type, COALESCE(entity_id, ''))
       project_id, discipline, entity_type, entity_id,
       id, revision, revision_number, status, source_revision,
       crs, content_hash, created_by, created_at
  FROM design_revisions
 WHERE supersedes_id IS NULL AND status <> 'VOID'
 ORDER BY project_id, discipline, entity_type, COALESCE(entity_id, ''), revision_number DESC;

-- Offline field packages: an MBTiles basemap must live on the device, not on a
-- server /tmp directory that a field tablet can never reach (blueprint §18.1).
CREATE TABLE IF NOT EXISTS field_basemaps (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  name          VARCHAR(150) NOT NULL,
  storage       VARCHAR(20) NOT NULL DEFAULT 'device'
                CHECK (storage IN ('device', 'server')),
  byte_size     BIGINT,
  min_zoom      SMALLINT,
  max_zoom      SMALLINT,
  bounds        JSONB,
  cached_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_basemaps_user ON field_basemaps(user_id, cached_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_basemaps_project ON field_basemaps(project_id);
