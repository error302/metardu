# Road quantity recording contract

Source implementation checkpoint, 16 October 2026. This is not a production or
field acceptance claim; the extended native verification is not yet green.

The production `/api/engineering/earthworks` save handler trusts supplied
reductions and names nonexistent columns. The source replacement calculates from
stored alignment inputs using the workspace's profile/vertical/average-end-area
engine. Legacy `earthworks_results` rows remain unchanged and are not adopted
as authority. The replacement has not been promoted to production.

## Data and authority

- Require the recorded owner for POST, rechecked with project-first transaction
  locks. GET requires project read access with coherent project/alignment locks.
- Require a declared projected-metre CRS matching the stored alignment and an
  explicit vertical datum. No reference, profile, target level or material factor
  is invented. Unknown design values block recording.
- Normalize declared road inputs through a shared serializer. Resolve targets
  from the saved vertical design, then call the existing section/volume engine.
- Retain input/output hashes, normalized source snapshot, algorithm/version,
  actor, timestamp and geometric quantities in the immutable design revision
  register under a separate `alignment-earthworks` stream. Every calculation
  starts as DRAFT; recording does not approve design or construction.
- Serialize a retry ID within the locked stream: identical retries return the
  original record, reuse with a different input hash conflicts. A changed saved
  input hash conflicts before any new revision is written.
- Preserve all previous records. New records may retire their predecessor's
  status using the established revision writer; payloads remain immutable.

## API and workspace

POST accepts only `alignment_id`, `client_run_id` and `expected_input_hash`.
Caller-authored results, tolerances and method names are rejected. This path
currently records the engine's average-end-area method; it does not relabel it
as prismoidal calculation or material mass haul.

GET supports current saved-input preview, paginated run summaries and an exact
run ID scoped to the alignment/project. Private responses are `private, no-store`.
Archived results remain readable after inputs change or become incomplete.

The output step can record only when displayed inputs match saved inputs. It
must explain when Save All is needed, retain a delivery ID for network retries,
show errors, paginate/reopen history and export CSV from the selected immutable
run. Revision/hash/reference/method/unit and draft status travel with that export.
Late responses cannot attach to a different project or input view.

## Required evidence

Known flat-profile and mixed cut/fill calculations, zero/negative levels, vertical
design targets, missing daylight/reference failures, stale inputs, retry identity,
cross-account denial, atomic rollback and unchanged legacy rows need tests.
Native PostgreSQL/HTTP proof uses only the existing marked synthetic service and
owned 127.0.0.1 source preview. No new image/container/builder or customer clone.
Production promotion and physical survey/receiver/print acceptance remain separate.

## Source evidence and remaining gates

- The related source regression run passed 189 tests, with six existing
  PostgreSQL-dependent tests skipped; strict app/test types and changed-source
  lint passed. Focused tests cover known 140 m³ cut/zero fill, vertical targets,
  source identity, draft revision status, retries, stale view responses and
  private API authorization contracts.
- The first native HTTP run passed 20 checks on the existing marked synthetic
  database: actual reductions, cross-account refusal, idempotent/concurrent
  delivery, retained archived inputs, trigger-protected evidence, unchanged
  legacy rows and unchanged applied migration hashes. It did not prove the
  later-added shared-reader and forced-insert rollback cases.
- CUA recorded R03 through the actual workspace, reopened the superseded R01,
  and downloaded a CSV independently parsed as two station rows and exact
  140 / 0 m³ totals with revision, draft, CRS, datum and hashes. Ignored receipts:
  `.cache/release-verify/road-quantities-http/initial-http-proof.json`,
  `browser-download.json`, `recorded.csv`, `recorded-quantity.jpg`.
- Extended native checks have not passed: the first attempt failed on shared
  reference access; later attempts failed on preview or authentication. The
  16 October diagnostic showed CSRF 200, credential callback 401 and an empty
  session 200. No authentication protection was disabled or bypassed. Preserve
  these failed receipts and diagnose before promotion; do not substitute mocked
  authorization tests for this missing native proof.
- Browser credentials were removed and synthetic accounts disabled after QA.
  Immutable synthetic revisions remain as verification evidence. No customer
  clone, new image/application container/builder or migration was created.
- Shared-project access and atomic rollback still require a completed native
  run. Production migration/recovery review, promotion and live workflow proof
  remain open. Recording a snapshot does not make the existing multi-request
  Save All sequence atomic or establish construction approval.

The engineering page also now uses a stable API client, retryable load errors,
the dedicated reference-system API and actual profile columns. These were
necessary source repairs to exercise the real quantity UI; they are not evidence
that OAuth or production sign-in is fully accepted.

## 17 October verification addendum

- The shared-project RLS regression now passes 24 checks on both the existing
  synthetic schema and a rollback-only application of migrations 111 and 112.
  It proves that a personal viewer can read the project and take its snapshot
  lock, while writes, firm-scope bypass, stranger access and revoked membership
  remain denied. The candidate transaction rolled back.
- The road quantity HTTP verifier did not reach its source API checks. Its
  read-only `docker inspect` ownership preflight returned non-zero in the
  restricted shell before fixture creation. Two elevated retries were not
  executed because the automatic approval service disconnected. The verifier's
  exact fixture guard remains in place; no alternate database or Docker path was
  used. Its HTTP behavior, shared-reader history path and forced-write rollback
  therefore remain unverified.
- The required production `npm run docker:verify` passed with approved
  read-only Docker access: the existing application and required services were
  healthy, with one METARDU application container. The latest backup record is
  archive/header evidence only, not a restore test. No production migration or
  promotion was performed.
