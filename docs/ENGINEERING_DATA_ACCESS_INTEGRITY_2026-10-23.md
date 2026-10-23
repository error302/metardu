# Engineering payload access and persistence — 23 October 2026

This checkpoint fixes `/api/engineering/data` in source. It does not promote an
image, certify a design or complete the broader production goal.

## Evidence and reproduced failures

The registered endpoint authenticated requests but performed no explicit project
authorization. GET selected by caller-supplied project ID; POST upserted by that
ID. Neither the wrapper nor the route bound the operation to project ownership
or shared read access. The table's schema migrations do not establish an RLS
policy that substitutes for application admission. No direct frontend fetch
caller was found; the registered Next.js endpoint remains reachable.

The source tests exercise the **actual request wrapper and actual ownership/RBAC
helpers**, with a stubbed session, rate limiter and database adapter. The corrected
initial regression run reproduced **12 failures with two controls passing**.
An anonymous request was already refused; empty IDs were already rejected. The
wrapper legitimately resolves organization context before route validation, so
invalid-ID tests check for absence of project/payload SQL, not all SQL.

A separate native probe loads the actual source handler, ownership helpers and
schemas against an exact owned fixture in the existing marked rehearsal service.
It initially reproduced **ten failures with one anonymous-adapter control
passing**. Its authentication adapter supplies only synthetic caller IDs; this
is not ordinary-account browser or production authentication proof. The fixture
demonstrates the missing application boundary when row policies are absent.
The rehearsal public engineering table also reports RLS/forced-RLS false. No
production customer record was requested or modified to establish this finding.

Further verified defects included false success after silent insert suppression,
missing private cache headers and JSON numeric overflow accepted by the payload
schema. For example, JSON.parse decodes `1e400` as Infinity, which JSON.stringify
can silently convert to null before the old database write.

## Corrected source behavior

- GET uses canonical project read admission. Recorded owners and authorized
  shared readers may read; strangers, missing projects and unassigned legacy
  projects are refused. A single joined query returns project ownership and
  payload from one MVCC snapshot. The join is constrained to the admitted owner,
  and the returned owner is rechecked before responding. An owner transfer after
  initial admission cannot expose the new project's payload.
- This read avoids an UPDATE/row-lock privilege requirement for shared viewers.
  An authorized project with no payload returns explicit null; multiple payload
  rows require review rather than choosing an arbitrary record.
- POST uses canonical **ownership** admission. Shared viewers cannot write.
  A transaction obtains a shared project-row lock and rechecks the owner before
  upsert. An ownership change before the transaction is refused; a competing
  transfer after admission waits until the write transaction ends.
- Success requires exactly one returned row with the expected project identity.
  Suppressed persistence cannot return HTTP 200. Accepted updates set updated_at;
  other row fields and the existing response shape are retained.
- Successful reads/writes have `Cache-Control: private, no-store`. Both methods
  retain the authenticated wrapper and existing 60-per-minute rate limit.
- Project IDs must be UUIDs and are normalized to lowercase for PostgreSQL UUID
  identity. Subtypes are trimmed, nonblank and at most 50 characters. Unknown
  outer fields are refused. Nested data remains flexible JSON; zero, negative
  coordinates, null, arrays, labels and false are retained.
- The engineering payload validator rejects nonfinite numbers and non-JSON or
  cyclic values before serialization. It uses iterative validation, bounded to
  200,000 JSON values and 64 nesting levels. These are transport/storage limits,
  not surveying tolerances. No datum, height or measurement is invented.

No migration or applied hash changes are required. This intentionally closes
the old cross-project access behavior and rejects previously accepted malformed
or nonfaithfully serializable requests.

## Verification

- **40 focused tests across four suites pass**: engineering-data wrapper/API,
  payload validation, adjacent alignment persistence and authenticated database
  context. The wrapper tests stub authentication/SQL; the authorization helpers
  and route/wrapper behavior are real source. A test-only regex was adjusted to
  the project's TypeScript target before the final strict test check.
- **13 native PostgreSQL checks pass**, including foreign-user refusal, viewer
  read/write separation, unassigned-owner refusal, zero/null/negative/nested
  data preservation, suppressed-insert refusal, owner changes before snapshots,
  invalid UUID/overflow refusal and anonymous adapter control. An empty owner
  record returns private null; its first save creates one confirmed row.
- The transfer test observes the exact second connection in a real PostgreSQL
  lock wait, then confirms write commit, completed transfer and refusal of the
  old owner. Its initial diagnostic label exceeded PostgreSQL's connection-label
  limit; the failed observation is retained separately. The corrected label is
  explicitly bounded and the final lock observation passes.
- `scripts/verify-engineering-data-access.mjs` accepts only red/green modes and
  one exact service ID, label, loopback port and database ownership marker. It
  does not fall back to deployment credentials or start services. It asserts the
  private search path before fixture DDL, checks an exact marker before dropping
  that fixture, verifies original public engineering rows/migration records and
  records source/runner hashes. Connections are closed even after a finalization
  assertion fails.
- Original rehearsal public engineering table count remains **0**, with its
  fingerprint unchanged. The migration ledger is unchanged, the owned fixture
  is removed, and source hashes match before/after the final probe.
- App TypeScript passed; strict test TypeScript passes after the test-only target
  correction. Scoped TypeScript ESLint passes without errors/warnings. The native
  runner passes syntax/execution verification. The security gate passes with
  119 applied migrations pinned.
- An actual anonymous GET on the owned source preview at `127.0.0.1:3021`
  returns **401 / UNAUTHORIZED**. Restricted host socket denial on the first
  attempt was not treated as endpoint failure; the host-access retry succeeds.
- Fresh `npm run docker:verify` passes required production health/inventory with
  one application container. Backup completion remains 2026-10-23T10:25:43Z,
  archive/header evidence only.

Machine receipts are under `.cache/engineering-data-access/`: `unit-red.json`,
`unit-green.json`, `red.json`, `green.json`, `green-lock-label-failure.json`,
`anonymous-http-socket-denied.json` and `anonymous-http.json`.

## Remaining scope

No production write, lifecycle action, new account, credential change, browser
storage change or customer-data clone was performed. Signed-in ordinary-account
HTTP/browser acceptance, production promotion, role/RLS deployment acceptance
and the wider release/field gates remain separate.

This generic legacy payload route still stores a latest payload; this repair
does not add optimistic edit preconditions, immutable design history, approved
criteria adoption or design-bound exports. The actual project/alignment revision
register and quick-compute/export paths require their continued trace. The
unsubstantiated checks in the separate engineering quick-compute panels remain
an open follow-up; the public road-safety repair does not cover them.
