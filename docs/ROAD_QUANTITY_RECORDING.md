# Road quantity recording contract

Latest checkpoint, 18 October: the extended native source run now passes all
25 checks, including shared readers and forced-write rollback. Exact accounts
are suspended, fault-injection objects removed, and immutable synthetic evidence
retained. The implementation is included in deployed `80940bf7`; a live quantity
recording/approval workflow is still unverified. See
`OBSERVATION_IMPORT_RELEASE_VERIFICATION.md`. Earlier failures below are history.

Source implementation checkpoint, 16 October 2026. This is not a production or
field acceptance claim; at that checkpoint extended native verification was not green.

The earlier production `/api/engineering/earthworks` save handler trusted supplied
reductions and names nonexistent columns. The source replacement calculates from
stored alignment inputs using the workspace's profile/vertical/average-end-area
engine. Legacy `earthworks_results` rows remain unchanged and are not adopted
as authority. The latest checkpoint above supersedes the earlier unpromoted status.

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
  A later run from this restricted shell failed at `docker ps` with an access
  error; that failure does not establish that Docker is stopped, so the current
  production runtime state remains unverified from this session.

## Completed native continuation — 22 October 2026

The earlier shared-reader and forced-write-rollback gaps are now closed on the
existing marked synthetic database and owned `127.0.0.1:3021` source preview.
After the reviewed synthetic migration upgrade, the unchanged HTTP verifier
passed all 25 checks at 09:44:53 UTC. Owner and other actor authenticated through
normal CSRF/credential/session endpoints. No session or browser storage was
injected and no authentication protection was disabled.

The run verifies the independent 140 m³ cut / zero fill fixture and updated
320 m³ cut profile; denial of caller-authored reductions and foreign access;
idempotent/concurrent delivery; archived raw profiles; immutable evidence;
viewer reference/history reads with recording and reference writes denied;
stale/incomplete-input refusals; and actual insert failure rolling back
predecessor retirement with no partial run. The exact temporary fault trigger
and function were removed. Legacy quantities and all applied migration hashes
were unchanged. Test accounts were disabled; labeled synthetic revisions remain.

The previous result was preserved as `pre-resume-result.json`; current detailed
proof is `.cache/release-verify/road-quantities-http/result.json`, with the log and
exit receipt under `.cache/fieldbook-delivery/`. Nine independent read-only
post-checks reconfirmed original books/captures and ledger rows, the exact
synthetic fixture, disabled actors and absence of fault injection.

This is real HTTP/PostgreSQL source acceptance, not production, browser editing,
instrument, construction approval, material-factor or physical field proof.
The existing source database is now running with 120 source migrations;
production remains separate. Wider engineering and the single reviewed release
sequence remain open.
