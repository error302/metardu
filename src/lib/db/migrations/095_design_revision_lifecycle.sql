-- UP: Preserve immutable design content while allowing atomic supersession.
-- supersedes_id always points BACK to the preceding revision; it is not a
-- mutable pointer to the successor. Migration 076 used it to find the current
-- row and rejected the status change its own writer needed for a second save.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM design_revisions
    GROUP BY project_id, discipline, entity_type, COALESCE(entity_id, ''), revision_number
    HAVING COUNT(*) > 1
  ) OR EXISTS (SELECT 1 FROM design_revisions WHERE revision_number <= 0) THEN
    RAISE EXCEPTION 'Design revision history needs review: duplicate or invalid revision numbers; preserve records and resolve with a reviewed forward migration.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM design_revisions child
    JOIN design_revisions parent ON parent.id = child.supersedes_id
    WHERE child.project_id <> parent.project_id OR child.discipline <> parent.discipline
      OR child.entity_type <> parent.entity_type
      OR COALESCE(child.entity_id, '') <> COALESCE(parent.entity_id, '')
      OR child.revision_number <= parent.revision_number
  ) THEN
    RAISE EXCEPTION 'Design revision history needs review: invalid predecessor links; do not rewrite survey evidence automatically.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION reject_design_revision_update()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('DRAFT', 'IN_REVIEW', 'APPROVED')
       AND NEW.status IN ('SUPERSEDED', 'VOID')
       AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status') THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'Design revision content and predecessor links are immutable; append-only history permits only retirement status changes.'
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

-- A failed old append could leave a valid successor before its predecessor's
-- retirement was rejected. Retire only records with an actual recorded link.
-- Never renumber, alter payloads/hashes, delete evidence, or guess a lineage.
UPDATE design_revisions parent
   SET status = 'SUPERSEDED'
 WHERE parent.status IN ('DRAFT', 'IN_REVIEW', 'APPROVED')
   AND EXISTS (SELECT 1 FROM design_revisions child
                WHERE child.supersedes_id = parent.id AND child.status <> 'VOID');

DROP INDEX IF EXISTS idx_design_revisions_current;
CREATE UNIQUE INDEX idx_design_revisions_current
  ON design_revisions(project_id, discipline, entity_type, COALESCE(entity_id, ''))
  WHERE status NOT IN ('SUPERSEDED', 'VOID');
CREATE UNIQUE INDEX idx_design_revisions_number
  ON design_revisions(project_id, discipline, entity_type, COALESCE(entity_id, ''), revision_number);
CREATE UNIQUE INDEX idx_design_revisions_successor
  ON design_revisions(supersedes_id) WHERE supersedes_id IS NOT NULL;

CREATE OR REPLACE FUNCTION guard_design_revision_append()
RETURNS TRIGGER AS $$
DECLARE
  predecessor design_revisions%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(
    NEW.project_id::text || ':' || NEW.discipline || ':' || NEW.entity_type || ':' || COALESCE(NEW.entity_id, ''), 0));
  SELECT * INTO predecessor FROM design_revisions
   WHERE project_id = NEW.project_id AND discipline = NEW.discipline
     AND entity_type = NEW.entity_type AND COALESCE(entity_id, '') = COALESCE(NEW.entity_id, '')
   ORDER BY revision_number DESC LIMIT 1;
  IF NEW.status NOT IN ('DRAFT', 'IN_REVIEW')
     OR NEW.revision_number <> COALESCE(predecessor.revision_number, 0) + 1
     OR NEW.supersedes_id IS DISTINCT FROM predecessor.id
     OR NEW.revision <> 'R' || LPAD(NEW.revision_number::text, GREATEST(2, LENGTH(NEW.revision_number::text)), '0')
     OR predecessor.status IN ('DRAFT', 'IN_REVIEW', 'APPROVED') THEN
    RAISE EXCEPTION 'Append a sequential design revision with its retired predecessor; content and revision identities cannot be invented.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER design_revisions_append_guard
  BEFORE INSERT ON design_revisions
  FOR EACH ROW EXECUTE FUNCTION guard_design_revision_append();

CREATE OR REPLACE VIEW current_design_revisions AS
SELECT DISTINCT ON (project_id, discipline, entity_type, COALESCE(entity_id, ''))
       project_id, discipline, entity_type, entity_id,
       id, revision, revision_number, status, source_revision,
       crs, content_hash, created_by, created_at
  FROM design_revisions
 WHERE status NOT IN ('SUPERSEDED', 'VOID')
 ORDER BY project_id, discipline, entity_type, COALESCE(entity_id, ''), revision_number DESC;

-- DOWN: Restoring 076 would break legitimate revision chains and could expose
-- an older design as current. Correct future issues with a forward migration.
DO $$
BEGIN
  RAISE EXCEPTION 'Migration 095 is forward-only; preserve design history and use a reviewed forward migration.' USING ERRCODE = '55000';
END;
$$;
