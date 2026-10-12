-- Blueprint §15 (professional deliverable system), §5.3 (computation records),
-- §2.5 (every PASS must have evidence), §16 (tolerance profiles), §19 (data model).
--
-- This migration closes the trust gap: until now a surveyor could compute
-- correctly and draw well, but nothing recorded WHAT was computed, FROM which
-- revision, UNDER which tolerance, or WHICH document superseded which.
--
-- deliverables / deliverable_revisions : the document register (§15, §28)
-- computation_runs                    : algorithm identity + input/output hashes (§5.3)
-- qa_runs / qa_results                : rule + measurement + threshold + revision (§2.5)

-- ─── Deliverables: one row per issued document (blueprint §15, §28) ──────────

CREATE TABLE IF NOT EXISTS deliverables (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_type       VARCHAR(60) NOT NULL,          -- deed_plan | survey_plan | coordinate_schedule | dxf | landxml | geojson | csv | form_c22 | workbook | report
  title               TEXT,
  -- Source data/design revision this document was produced from (blueprint §28)
  source_revision     VARCHAR(60),
  -- Content hash of the issued artifact (tamper evidence)
  current_revision    INTEGER NOT NULL DEFAULT 1,
  status              VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                      CHECK (status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED', 'VOID')),
  generated_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  superseded_by       UUID REFERENCES deliverables(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_deliverables_project_type_current
  ON deliverables(project_id, document_type)
  WHERE superseded_by IS NULL AND status <> 'VOID';
CREATE INDEX IF NOT EXISTS idx_deliverables_project ON deliverables(project_id, document_type, created_at DESC);

-- ─── deliverable_revisions: immutable revision history (blueprint §15, §28) ──

CREATE TABLE IF NOT EXISTS deliverable_revisions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deliverable_id    UUID NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  revision          INTEGER NOT NULL,
  content_hash      VARCHAR(128) NOT NULL,
  storage_path      TEXT,                             -- where the artifact lives
  bytes             BIGINT,
  source_revision   VARCHAR(60),
  generator         VARCHAR(80),                      -- which generator produced it
  generator_version VARCHAR(40),
  project_crs       VARCHAR(32),                      -- the CRS the document states
  manifest          JSONB NOT NULL DEFAULT '{}',      -- input ids/params/hashes
  generated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (deliverable_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_deliverable_revisions_deliverable
  ON deliverable_revisions(deliverable_id, revision DESC);

-- Revisions are append-only: a professional record cannot be rewritten in place.
CREATE OR REPLACE FUNCTION reject_deliverable_revision_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'deliverable_revisions are append-only (blueprint §15): a revision cannot be modified, only superseded by a new one';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deliverable_revisions_immutable ON deliverable_revisions;
CREATE TRIGGER deliverable_revisions_immutable
  BEFORE UPDATE OR DELETE ON deliverable_revisions
  FOR EACH ROW EXECUTE FUNCTION reject_deliverable_revision_update();

-- ─── computation_runs: deterministic compute identity (blueprint §5.3) ───────

CREATE TABLE IF NOT EXISTS computation_runs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  algorithm_id      VARCHAR(80) NOT NULL,             -- e.g. 'traverse.adjust', 'parcel.topology'
  algorithm_version VARCHAR(40) NOT NULL,
  input_version     VARCHAR(60),                      -- which data revision was computed
  parameters        JSONB NOT NULL DEFAULT '{}',
  input_hash        VARCHAR(128),
  output_hash       VARCHAR(128),
  result            JSONB NOT NULL DEFAULT '{}',
  qa_summary        JSONB NOT NULL DEFAULT '{}',
  crs               VARCHAR(32),
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  duration_ms       INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_computation_runs_project ON computation_runs(project_id, algorithm_id, created_at DESC);

-- ─── qa_runs / qa_results: a PASS must carry rule + measurement + revision ──

CREATE TABLE IF NOT EXISTS qa_runs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  data_revision         VARCHAR(60),
  design_revision       VARCHAR(60),
  tolerance_profile_id  UUID REFERENCES tolerance_profiles(id) ON DELETE SET NULL,
  tolerance_profile_version VARCHAR(20),
  observer_batch_id     UUID REFERENCES observation_batches(id) ON DELETE SET NULL,
  triggered_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  trigger               VARCHAR(30) NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual', 'on_compute', 'on_export', 'on_import')),
  summary               JSONB NOT NULL DEFAULT '{}',
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_qa_runs_project ON qa_runs(project_id, started_at DESC);

CREATE TABLE IF NOT EXISTS qa_results (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  qa_run_id           UUID NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE,
  check_type          VARCHAR(80) NOT NULL,
  result              VARCHAR(10) NOT NULL CHECK (result IN ('PASS', 'WARN', 'FAIL', 'INFO')),
  measured_value      NUMERIC,
  threshold_value     NUMERIC,
  unit                VARCHAR(20),
  message             TEXT,
  details             JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_results_run ON qa_results(qa_run_id, result);
CREATE INDEX IF NOT EXISTS idx_qa_results_check ON qa_results(check_type, created_at DESC);

-- ─── project_tolerance_profiles (blueprint §16) ─────────────────────────────
-- Which tolerance profile governs this project. A project with no assignment
-- falls back to the seeded default profile, and qa_runs records which version
-- actually judged each result — a PASS is never unattributed.

CREATE TABLE IF NOT EXISTS project_tolerance_profiles (
  project_id            UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  tolerance_profile_id  UUID NOT NULL REFERENCES tolerance_profiles(id) ON DELETE RESTRICT,
  assigned_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
