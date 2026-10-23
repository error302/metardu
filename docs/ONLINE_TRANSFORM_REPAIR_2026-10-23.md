# Explicit online coordinate transformation source repair

The written design was approved on 22 October. The actual online transform tab,
single API and batch API now use the shared CRS authority through
`src/lib/geo/transform.ts`; the separate Cartesian/Helmert/UTM calculations and
unsupported millimetre precision claims have been removed from the online path.

Both registered source and target references are required. Discovery exposes
the real survey-eligible registry, including all 120 WGS84 UTM zone/hemisphere
references. Display-only/unregistered references, unsupported datum paths and
grid dependencies fail closed. An identity still requires valid registered
references and finite, correctly named coordinates. Heights may be omitted,
null or finite (including zero) and remain unchanged. No vertical operation is
claimed. Operation evidence includes the actual definitions, engine/path kind,
unknown accuracy and unverified applicability, with the configured Arc caveat.

Final library-source review found proj4 silently defaults unknown ellipsoid
names to WGS84 and lets named datums override an ellipsoid. Three meaningful
regressions reproduced unwanted success. Nonidentity configured shifts now
require a bounded reviewed name (WGS84, GRS80 or clrk80) or explicit positive
finite axes/inverse flattening, with no conflicting datum/shape overrides.
Other named ellipsoids require review or explicit axes; they are not silently
substituted. This admits all current built-in transform definitions and rejects
unknown/empty/zero or conflicting ellipsoid configuration. No ellipsoid math or
second projection implementation was introduced.

Legacy compatibility is intentionally bounded: WGS84 identity, or a single
UTM-to-WGS84 inverse with explicit zone and hemisphere. Other broad legacy
datum/grid selectors now return a semantic error requiring explicit CRS codes;
no target grid is guessed. Mixed selector families are rejected. Redundant
zone/hemisphere hints describe the source pair and must agree with it.

Authentication and existing rate limits are retained (single 120/minute,
batch 10/minute). Malformed envelopes return 400, semantic rejection 422.
Batches accept 1..1000 source rows with common references and preserve ordered
indices, exact source rows and caller-supplied identities, including duplicate
or missing IDs. Every row has a success or error outcome and exact totals.

The page mounts explicit selectors with an initially empty target and blank
measurements. Every edit invalidates output. Independent revision and request
ownership guards prevent stale success/error, duplicate submission and stale
settlement keeping the form locked. Source type changes clear incompatible
horizontal fields. Actual-page tests cover leaving/returning to the tab while
a request is pending. Other online service tabs are preserved.

## Verification

- Meaningful pre-fix regressions caught empty/unknown identities, invalid
  geographic identities, measured zero rejection, guessed target grids and the
  old mounted page retaining success after input changes.
- Online service/API/shared-engine/component/page: initially 117 tests across six suites
  passed. The combined admin/map/online checkpoint passed 162 across 20 suites.
  Final typed-fixture API/service recheck passed 48 across three suites.
  After the final ellipsoid guard, the six suites passed 120 tests; additional
  explicit-axis/blank-flattening/shape cases then passed the final service
  checkpoint: 40/40 tests in `.cache/online-operation-final-tests.log`.
- Final `npm run typecheck` passed application and test typing. Scoped lint passed after typing
  response fixtures and documenting intentional test-only explicit CRS literals.
  Source production files have no added lint suppressions.
- The Arc inverse regression agrees to seven decimal places with the pinned
  independent host pyproj 3.7.2 / PROJ 9.5.1 result recorded in
  `ONLINE_TRANSFORM_AUDIT_2026-10-21.md`: E257538.86000969677,
  N9857382.339634635 -> longitude36.821900001651805,
  latitude-1.2921000053142353. This compares implementations using fixed
  parameters, not regional operation suitability or surveyed accuracy.
- Actual source-page CUA: explicit EPSG:4326 -> EPSG:32637, longitude39,
  latitude0, elevation0 returned E500000.000 m, N0.000 m and unchanged height0.
  The page displayed unknown accuracy/applicability and shared-authority path.
  Editing latitude removed success immediately; latitude91 returned
  `INVALID_COORDINATE` with no stale result. No browser storage was written
  through automation internals. Capture:
  `.cache/page-review/online-transform-success.png`.
- Source security gate and whitespace checks passed. Focused tests use the
  actual shared projection engine. API tests mock the wrapper boundary and
  explicitly verify retained authentication/rate-limit options; this does not
  establish authenticated HTTP acceptance.
- Native unauthenticated HTTP probes returned 401 for the single/batch discovery
  routes. No synthetic account was reactivated or privilege changed.

## Release and field blockers

Authenticated ordinary-account HTTP acceptance for single/batch discovery,
semantic errors and mixed-row results subsequently passed the native checkpoint
below. Browser timing tests use
deferred component promises, not a real slow-network/device incident. Regional
control, operation applicability/accuracy, vertical datum transformations,
provider/device and field evidence remain separate. No deployment, migration,
customer-data modification or source promotion occurred in this repair.

The full engineering platform is not complete after this source milestone.

## Ordinary authenticated HTTP checkpoint — 23 October, 10:05 UTC

The existing marked rehearsal database and source preview were reused. An
already prepared ordinary synthetic account signed in through the actual
NextAuth CSRF/credential endpoints; no token injection, account reactivation or
privilege grant was used. Sixteen named native checks passed for anonymous
POST denial, ordinary-user admin refusal, both authenticated discovery routes,
all 120 UTM references, exact zero/null/omitted heights, both hemispheres,
the pinned Arc numerical fixture, malformed/semantic failures and mixed/all-
failed batches. The HTTP boundary admitted 1000 rows and rejected 0/1001;
source row order, duplicate/missing IDs, counts and no-substitute failures held.

Native before/after fingerprints matched for projects, fieldbooks, survey
points, raw observations, observation batches, delivery receipts and the complete
120-entry migration ledger. A separate SQL/source post-check reconfirmed those
fingerprints and exact tested working-tree hashes. The online source also
matches commit `1168d089` after only CRLF-to-LF normalization for Git blobs.
An initial raw Git-blob hash comparison correctly differed on Windows line
endings; the exact working-tree hashes still matched their before-run receipts.

Evidence: `.cache/online-transform-http.json`, its guarded
`verify-online-transform-http.mjs` harness and
`online-transform-http-postcheck.json`. These establish the current host source
API path with native authentication/database boundaries, not a production image,
remote CI, browser timing, physical instrument or independent field result.

Cleanup of synthetic account `22360396-8518-4424-b61b-1d08f5c146a8` remains
pending explicit approval. Automatic approval review rejected the exact cleanup
because disabling its access and invalidating its temporary sessions lacked
specific trusted authorization. The independent post-check confirms that it is
still enabled and `.cache/fieldbook-delivery/browser-qa.json` still exists;
credentials were not printed. No cleanup bypass or production account change
was performed. See `ORDINARY_API_ACCEPTANCE_2026-10-23.md` for the combined ledger.
