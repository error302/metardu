-- Topographic surface persistence (blueprint §8.5, §19, §28).
--
-- A topographic survey currently loses its whole surface on reload: coded
-- points load from survey_points, but the breaklines, the TIN and the contour
-- sets are computed in the browser and held in React state. Refreshing the
-- page means re-running the whole job. These tables make a surface a
-- revisable, revisioned record instead of a moment in a tab.
--
-- A surface is never edited in place: each compute writes a new
-- surface_revisions row and points the surface at it, so "which surface did
-- this plan come from" always has an answer.

CREATE TABLE IF NOT EXISTS surfaces (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          VARCHAR(150) NOT NULL,
  description   TEXT,
  crs           VARCHAR(32),                       -- the project CRS the surface is in
  vertical_datum VARCHAR(100),
  status        VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                CHECK (status IN ('DRAFT', 'COMPUTED', 'REVIEW_REQUIRED', 'APPROVED', 'SUPERSEDED')),
  current_revision_id UUID,                        -- set when a revision is computed
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_surfaces_project_name ON surfaces(project_id, name);
CREATE INDEX IF NOT EXISTS idx_surfaces_project ON surfaces(project_id, status);

CREATE TABLE IF NOT EXISTS surface_revisions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  surface_id     UUID NOT NULL REFERENCES surfaces(id) ON DELETE CASCADE,
  revision       INTEGER NOT NULL,
  algorithm      VARCHAR(80) NOT NULL,              -- e.g. 'breakline-tin'
  algorithm_version VARCHAR(40) NOT NULL DEFAULT '1.0',
  parameters     JSONB NOT NULL DEFAULT '{}',       -- interval, resolution, max slope
  point_count    INTEGER NOT NULL DEFAULT 0,
  breakline_count INTEGER NOT NULL DEFAULT 0,
  triangle_count INTEGER,
  crs            VARCHAR(32),
  input_hash     VARCHAR(128),                      -- the coded points this came from
  result         JSONB NOT NULL DEFAULT '{}',       -- min/max elevation, extent
  computed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (surface_id, revision)
);

ALTER TABLE surfaces
  DROP CONSTRAINT IF EXISTS surfaces_current_revision_fk;
ALTER TABLE surfaces
  ADD CONSTRAINT surfaces_current_revision_fk
  FOREIGN KEY (current_revision_id) REFERENCES surface_revisions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_surface_revisions_surface
  ON surface_revisions(surface_id, revision DESC);

-- Computed revisions are immutable evidence; a change means a new revision.
CREATE OR REPLACE FUNCTION reject_surface_revision_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'surface_revisions are append-only (blueprint §28): recompute into a new revision instead of editing one';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS surface_revisions_immutable ON surface_revisions;
CREATE TRIGGER surface_revisions_immutable
  BEFORE UPDATE OR DELETE ON surface_revisions
  FOR EACH ROW EXECUTE FUNCTION reject_surface_revision_update();

-- Breaklines constrain the interpolation: they are part of the surface
-- definition, so they travel with it rather than living in a form.
CREATE TABLE IF NOT EXISTS breaklines (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        VARCHAR(150),
  breakline_type VARCHAR(20) NOT NULL DEFAULT 'hard'
              CHECK (breakline_type IN ('hard', 'soft', 'ridge', 'valley')),
  coordinates JSONB NOT NULL CHECK (jsonb_typeof(coordinates) = 'array'),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_breaklines_project ON breaklines(project_id);

-- Contour sets belong to one computed revision so a plan can cite them.
CREATE TABLE IF NOT EXISTS contour_sets (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  surface_id     UUID NOT NULL REFERENCES surfaces(id) ON DELETE CASCADE,
  surface_revision_id UUID REFERENCES surface_revisions(id) ON DELETE CASCADE,
  interval       NUMERIC(10,3) NOT NULL,
  minor_interval NUMERIC(10,3),
  index_interval NUMERIC(10,3),
  crs            VARCHAR(32),
  lines          JSONB NOT NULL DEFAULT '[]',       -- [{level, coordinates:[{x,y}]}]
  triangle_count INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contour_sets_surface ON contour_sets(surface_id, created_at DESC);

-- Contour geometry derived from a revision is evidence too: immutable.
CREATE OR REPLACE FUNCTION reject_contour_set_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.surface_revision_id IS NOT NULL THEN
    RAISE EXCEPTION 'contour sets tied to a computed revision are immutable; recompute to change them';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contour_sets_locked ON contour_sets;
CREATE TRIGGER contour_sets_locked
  BEFORE UPDATE ON contour_sets
  FOR EACH ROW EXECUTE FUNCTION reject_contour_set_update();