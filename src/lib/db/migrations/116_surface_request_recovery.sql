-- Additive request identity constraints. Existing immutable histories have no
-- request metadata and remain untouched. New API writers serialize the owner /
-- project request before appending; these indexes enforce the same uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS idx_surface_revision_request_identity
  ON surface_revisions ((result#>>'{snapshot,reference,project_id}'),
    (result#>>'{snapshot,request,userId}'), (result#>>'{snapshot,request,id}'))
  WHERE result#>>'{snapshot,request,id}' IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_surface_export_request_identity
  ON deliverable_revisions ((manifest#>>'{request,projectId}'),
    (manifest#>>'{request,userId}'), (manifest#>>'{request,id}'))
  WHERE generator='surface-revision-dxf' AND manifest#>>'{request,id}' IS NOT NULL;
