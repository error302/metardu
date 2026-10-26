# Retained parcel traverse intake: source checkpoint

26 October 2026, Africa/Nairobi. This checkpoint replaces destructive parcel
traverse saving with append-only observations, numerical revisions and recoverable
requests. It is source and isolated synthetic evidence, not a promoted release or
field acceptance.

## Resulting workflow

The parcel register opens the observation form with explicit project and parcel
UUIDs. The server verifies the current owner and returns the declared project
reference, adopted ground-to-grid factor, prerequisites and revision head. A
failed read remains visibly unavailable. Missing storage is a 503, not an empty
successful register. The history alias uses this same scoped, bounded read.

Control and observation entries remain original strings, including leading zeros,
unentered heights, comments and row order. Optional original file bytes (up to
2 MiB) and their checksum are retained with reviewed transcription provenance.
Attachment is not an instrument parser. The supported convention is paired
clockwise backsight-to-foresight face angles, zenith angles and metre distances;
arbitrary instrument-circle setups still need a separately validated reducer.

The project must explicitly declare a supported projected metre grid, grid
distance mode and positive adopted combined scale factor with provenance. There
is no assumed unity factor. The horizontal reduction uses that factor; measured
vertical differences do not. Absolute levels require the declared vertical datum
and height reference. Unknown values stay unknown. An optional stated linear
misclosure criterion does not assert cadastral approval or an accuracy order.

Each computation appends a new canonical traverse, complete original observations,
full-precision coordinates, input/result/reference/source hashes, exact request
text and an immutable receipt. The source graph and final request journal commit
together. Replaying the same request recovers the original revision; changing its
intent is refused. Cancellation creates a final tombstone, so a delayed save
cannot appear after cancellation. Existing parcel geometry and area are untouched.
Existing unversioned traverses remain stored and available in the source
directory; they are not backfilled with invented original-input receipts.

Before POST, the browser locks and retains the exact account/project/parcel
request on the device. Lost responses leave recovery, original-ID retry and
acknowledged cancellation available. Incorrect identities/hashes, unavailable or
malformed device storage and quota errors preserve evidence and refuse new sends.
Account changes reset private form state. Device records can be downloaded without
clearing them. Unsubmitted edits are not automatically retained.
Delayed attachment reads are bound to the original editor instance; replacing
the editor cannot let an old file callback overwrite its successor's edits.

History reads 24 metadata rows per page using stable ordinal cursors. Observation
editing and result coordinates render 50 at a time. The supported revision limit
is 2,000 observations, with a 4 MiB request and 8 MiB numerical-result limit.

The retained revision links to its exact traverse in boundary review. Following
that link does not choose vertices, infer parcel order or save an area. Explicit
vertex review retains the source revision and request edit tokens. Changed source
records or reference declarations cannot be relabeled as reviewed geometry.
Boundary persistence and selection now compare exact EWKB and keep full-precision
receipt geometry. Shoelace area translates coordinates to a local origin before
multiplication, avoiding cancellation at large grid coordinates; hectares are no
longer rounded to six decimal places before persistence.

A further failing UI/native regression reproduced copying old-frame inputs as a
new current-frame revision. Deriving a revision now requires the original project
reference to match. The old artifact remains readable; the UI disables copying,
and the server independently refuses it. A reviewed transformation workflow is
still required before that reuse can be supported.

## Verification evidence

- The form regression began with eight failures against the old component. The
  focused engine, form, boundary geometry and boundary UI run passes **84 tests
  in four suites**, including recovery, malformed records, account changes and
  incorrect acknowledgements.
- The combined adjacent regression passes **150 tests in 15 suites**, including
  parcel registers, map/layer contracts, selected export admission and recovery,
  sharing snapshots and deliver navigation. ESLint passes all 19 changed TS/TSX
  paths with zero warnings/errors. App and test type checks and
  `git diff --check` pass.
- `node scripts/verify-reviewed-boundary.mjs traverse` passes **39 native checks**:
  actual route handlers, PostgreSQL/PostGIS transactions, immutable graph guards,
  RLS, races, rollback faults, original source bytes, linked boundary precision,
  changed/tampered evidence, history and all 2,001 coordinates of a 2,000-shot
  revision. The non-unity factor test separately checks horizontal and vertical
  values. Missing vertical datum, forged issuer and absent JSON receipt identity
  refuse. Whole-project cascade was exercised inside a rolled-back transaction.
- Native evidence is `.cache/traverse-retention/native.json`, with exact source
  hashes and successful owned-schema removal, original-record preservation and
  unchanged migration ledger. Authentication is a bounded adapter here; this is
  not ordinary-account HTTP or production evidence. The fixture elevation column
  was corrected to the canonical schema's DOUBLE PRECISION before the fractional
  height check; NUMERIC coercion in the earlier minimal fixture lost digits.
- The adjacent `share` verification mode passes **154 native checks** against
  the final source, covering the existing boundary, map, export and sharing
  paths. The initial run hit one statement timeout while static checks were
  competing for resources; its failed receipt is preserved at
  `.cache/traverse-retention/shared-boundary-initial-failed.json`. The serialized
  rerun passes all checks, including that same parameter-substitution case,
  with original records, migration ledger and source hashes preserved. Both
  owned schemas and all owned temporary export files were removed. These
  adjacent cases do not establish a new traverse-to-CAD field pilot.
- A CUA visit to the owned `127.0.0.1:3021/dashboard` redirected to sign-in. The
  temporary tab was closed. Successful authenticated layout/save/recovery and
  administrator browser verification remain open. No browser storage was edited.
- `npm run security:gate` passes: 119 applied migration hashes remain pinned;
  738 test files and 3,286 source files were statically scanned, not all executed.
  `npm run docker:verify` also passes: one production application, required
  services healthy/running and the 25 October 16:59:14 UTC archive/header backup
  evidence. No production service was built, started, migrated or stopped by
  these checks.

## Migration and release boundaries

Migration **122** is new source, applied only in the exact marked disposable
schema of the existing loopback rehearsal database. No customer database or
applied migration hash was changed. It widens future parcel areas and horizontal
coordinates to unconstrained NUMERIC, preserving historical stored values rather
than reconstructing previously rounded digits. It adds owner-scoped revision and
request tables, deferred graph foreign keys and immutable canonical-row guards.
It denies unsafe downgrade; forward correction and retained evidence are required.

Before promotion, rehearse against an admitted customer clone with the actual
schema, triggers, grants, existing data and migration runner. Assess ALTER TABLE
locks and resource requirements. Keep a verified database/uploads restore path,
compatible application/worker candidate and current-production rollback image.
An older application cannot overwrite retained source rows after this migration;
that protects evidence but can make its legacy save fail. Review rollback behavior
before release. Keep the deployed Cloudflare public-parcel containment rule until
the permanent replacement and rollback behavior are verified live.

## Remaining acceptance

This checkpoint does not prove ward-scale cadastral production, independent
surveyor acceptance or legal submission. The later
`PAGED_BOUNDARY_SOURCE_ACCEPTANCE_2026-10-26.md` replaces this checkpoint's
500-coordinate source ceiling with 50-row review/search across up to 2,001 source
coordinates. Its 500 chosen-vertex and byte/intake limits remain explicit.
Campaign partitioning, multiple crews, permissioned
collaboration, offline conflict handling and ward-scale load/recovery remain open.

Actual instrument-file parsing, direct device connections, field controls,
localisation/height transformations, independently checked adjustment, receiving
CAD/print fidelity, and a real topographic/cadastral pilot remain required.
Authenticated browser/phone/admin checks, signing-key deferral, customer-clone and
restore admission, worker source/artifact drift, payments/provider checks and the
planned release are separate outstanding gates. The broader production goal stays
active.
