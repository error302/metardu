# Canonical engineering writer boundary

27 October 2026. Source and isolated PostgreSQL checkpoint, not a release.

The preceding conditional-save work protected the current input page and its
checked mirror copies. Legacy header/child routes without a snapshot could still
write against a project that already had canonical engineering JSON. Individual
PI edits also bypassed the mirror precondition, and the old sync-back function
still contained a project JSON update.

## Resulting behavior

After the existing ownership check and project lock, the common mirror guard
reads the actual project engineering value. If a saved value exists, a request
without the saved snapshot hash receives `409 ENGINEERING_SNAPSHOT_REQUIRED`.
This covers header, IP, VIP and station POSTs and individual PI PUTs. The error
directs the operator to the project input workflow or visual workspace. Checked
copies continue to verify the exact engineering hash and cannot become canonical
project writers.

Standalone legacy alignments remain editable only when the locked project has a
real SQL-null engineering draft. A missing project or omitted/malformed saved
value is not treated as that state. Their input records and revision history
remain available; the mirror does not manufacture or initialize project JSON.
The current project workflow can explicitly adopt a standalone alignment by
saving its original null snapshot through the conditional project-save path.

The old sync-back function now only enforces that boundary. Its JSON update and
merge of child inputs into the project were removed. Project road JSON is saved
through the conditional project workflow or the recoverable visual road command.
Other engineering subtypes keep their separate documented workflow contracts.

## Evidence

- 293 regression tests in 34 suites, including the direct-route suite explicitly
  added to the combined manifest. Rejection tests demonstrated the old behavior
  before the guard and obsolete write path were changed.
- Application and test TypeScript, scoped direct ESLint, security and existing
  runtime verification receipts are recorded in
  `.cache/engineering-writer-boundary/source-checks.json`.
- The actual restricted-role PostgreSQL test has 15 named checks. It verifies
  blind legacy edit and sync-back refusal against a saved project, SQL-null
  standalone admission without project JSON adoption, stale conditional and
  mirror requests, preservation of engineering JSON, precision/non-finite
  refusal, immutable cancellation and archive-failure rollback. All temporary
  accounts, projects and request outcomes roll back; applied migration hashes
  remain unchanged. See `native-sql.json` and `native-jest.json` in that directory.
- Earlier native receipts retain their own bytes and source scope. No fresh
  browser, physical phone, receiving-CAD or field result is claimed here.

## Compatibility and remaining work

Old direct API consumers must use the project input workflow to edit an existing
canonical draft, then pass its snapshot hash for mirror copies. Individual PI
PUT remains available for standalone alignments; canonical road edits use the
existing project editors. Promote coherent client/server artifacts together and
review rollback compatibility. No migration, build, push, container creation or
production promotion was performed.

This closes the inspected legacy route bypass for canonical road JSON. It does
not make the four mirror requests one atomic operation, give legacy saves durable
request outcomes, bind legacy changes to a reference snapshot, or establish
collaborative/ward-scale acceptance. Retained terrain, justified ground
reassociation, selected road revisions and validated IFC/LandXML/DXF/instrument
delivery remain next engineering work. Customer clone/restore admission, worker
artifact alignment, owner-deferred signing keys, provider/paid lifecycle,
administrator/physical-phone verification and independent field/professional/
receiving-CAD/print acceptance remain open. Preserve Cloudflare parcel containment
and the localhost CAD training drawing.
