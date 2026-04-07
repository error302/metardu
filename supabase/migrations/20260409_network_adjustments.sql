-- Network adjustment sessions per project
-- Phase 18 - Sprint 9 - GPS/GNSS Network Least Squares Adjustment

CREATE TABLE IF NOT EXISTS network_adjustments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Input
  stations      jsonb NOT NULL DEFAULT '[]',
  observations  jsonb NOT NULL DEFAULT '[]',

  -- Results
  adjusted_stations jsonb DEFAULT NULL,
  summary           jsonb DEFAULT NULL,
  status            text NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS network_adjustments_project_id_idx
  ON network_adjustments(project_id);

ALTER TABLE network_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own network adjustments"
  ON network_adjustments FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );