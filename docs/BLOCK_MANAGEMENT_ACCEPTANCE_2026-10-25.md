# Block management: bounded reads and retained records

This source checkpoint follows the owner's large subdivision and professional
interface direction. It does not establish cadastral approval, whole-campaign
capacity or production acceptance.

## Resulting behavior

Block management now uses a project-bound, 24-row directory instead of downloading
every block. One owner-bound PostgreSQL statement supplies whole-project numeric
totals, unassigned/inconsistent parcel-link counts, literal search and stable
pages. Page IDs are selected before descriptions and geometry flags are read;
geometry itself is not transferred. Submitted/approved values are labelled as
recorded statuses rather than independently verified progress.

The screen retains confirmed data on refresh failure, refuses inconsistent
scope/page/count responses, aborts obsolete reads and offers explicit retry.
Creation and editing use UUID strings and shared field schemas. Sparse edits
preserve omitted values, clear explicit blanks and send the loaded six-digit
timestamp and PostgreSQL `xmin` token. These tokens prevent stale writes;
`xmin` is a volatile edit token, not a permanent audit revision or restore-stable
identity. A restored/replaced record must be loaded again.

Commands lock the owning project and selected block inside one transaction.
Expected project scope, supplied metadata and exact acknowledgements are checked
before commit. Missing/altered acknowledgements roll back the change and the
fixture's transactional trigger history. Creation is admitted only for an actual
scheme project. Existing records in other project types remain readable/editable.

Deletion requires a loaded version and explicit screen confirmation. It refuses
blocks retaining parcels, assignments, import receipts or geometry. If the import
receipt table is unavailable, reads and metadata edits remain available while
deletion is disabled and the missing retention check is shown. Only an eligible
empty metadata block can be removed with an exact identity/version response.

Pending migration `118_block_identity_retention.sql` adds unique project/block
numbers and changes the three canonical block-child cascade constraints to
`NO ACTION DEFERRABLE INITIALLY DEFERRED`. This protects retained children even
through another database writer. Deferral preserves the existing whole-project
graph deletion when all of its own children are removed in the same transaction;
inconsistent cross-project children prevent deletion rather than disappearing.
The migration refuses duplicates or unexpected/missing FK shapes and performs no
automatic cleanup. It is tested only in the owned fixture and is not applied to
the preview public schema or customer production.

Controls/forms remain in normal page flow, with responsive wrapping, accessible
action names and SVG interface/parcel symbols. No emoji are introduced. The
project's parcel registers remain linked from individual blocks.

## Verification and compatibility

- Ten interaction cases failed against the previous screen; all ten now pass.
  They cover numeric totals and bounded rows, UUID creation, sparse/versioned
  edits, retained stale drafts, protected/confirmed deletion, unavailable
  retention checks, failed reads/refreshes, incorrect acknowledgements and paging.
- The final adjacent regression run passes **77 tests in ten suites**, including
  the block API/UI, parcel inputs/register/commands, overview, CSV import, shared
  schemas and bounded request body. The initial 18-test API/UI run is a subset.
  App/test type checks, scoped lint and the static route checker also pass (237
  pages, 823 static links, zero unmatched references). Native checks use
  actual route handlers and input schemas with a bounded authentication adapter,
  not ordinary-account HTTP or the full installed RLS/trigger policy set.
- The previous handlers fail 25 of 31 native cases (six pass), including data
  loss through cascading block deletion. The corrected native verifier passes
  **33 cases**, covering transactional acknowledgement faults, owner/scope
  races, duplicate identity contention, exact versions, protected/direct SQL
  deletion, project-graph lifecycle, bounded 250-block/10,000-parcel reads,
  literal filters and migration refusal on all three retained child tables.
  The synthetic 250-block/10,000-parcel directory returns 24 rows and a 9,909-byte
  response. This is bounded fixture payload evidence, not a concurrent-crew SLA.
  Its final report is
  `.cache/block-management/green.json`; baseline and UI red reports are retained.
- The verifier checks the fixed rehearsal service identity, purpose, loopback
  port and database marker. It fingerprints original public records and the
  migration ledger, checks exact source hashes, uses no public search-path
  fallback and removes only its uniquely marked fixture schema.

`GET /api/scheme/blocks` retains its `data` array but now defaults to a bounded
24-row page with project/summary/meta fields. Consumers must follow pagination;
the replaced screen was the only discovered source caller. Block DELETE callers
must supply the loaded timestamp; the screen also sends expected project ID and
`row_version`. Timestamp-only legacy edit callers remain admitted, with the
current version rechecked inside the transaction.

Global uniqueness and database-level retention require reviewed migration 118
rollout after migration 117. The application guards do not substitute for those
constraints across every writer. Native geometry sentinels verify preservation
and payload omission, not PostGIS topology. Selected fixture audit triggers do
not prove the installed audit-chain completeness; the existing generic route
audit chain remains best effort and is not a durable replay receipt.

## Remaining acceptance

Ordinary-account and administrator browser interaction, narrow/mobile visual
checks, applied-schema/RLS/trigger compatibility, recovery/restore, concurrent
crew capacity and coherent production promotion remain open. Manual metadata
commands still lack durable cross-device request replay; CSV intake retains its
separate reviewed request/receipt protocol. Map/traverse selection, crew access,
retained computations/outputs, direct instruments, receiving CAD/print and
professional field acceptance remain in the execution plan.

The fresh owned Chrome QA page redirected from `/dashboard` to
`/login?next=%2Fdashboard`. The source preview served the sign-in interface; this
does not establish signed-in block or administrator screen acceptance. The page
was retained for the existing-account sign-in handoff; credentials were not read
or supplied by automation.

No production image, service, migration ledger, customer record, account role,
subscription or training drawing was changed by this checkpoint. Independent
dirty source/configuration/advisory/marketing work remains excluded.
