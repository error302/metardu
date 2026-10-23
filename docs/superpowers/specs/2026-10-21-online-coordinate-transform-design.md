# Online coordinate transformation: explicit references and honest results

Date: 2026-10-21

Status: the human approved the explicit-CRS architecture and explicitly approved
this written specification on 22 October 2026. Implementation planning and
verification follow; approval does not claim implementation or release acceptance.

## Problem and intended outcome

The actual transform tab in `src/app/online/page.tsx` and authenticated
`/api/coordinates/transform` and `/api/coordinates/batch` use a separate datum
calculation in `src/lib/online/coordinates.ts`. It accepts empty identities,
rejects measured zero, guesses output grids, and labels inconsistent regional
results with unsupported millimetre accuracy. See
`docs/ONLINE_TRANSFORM_AUDIT_2026-10-21.md` for executable evidence.

Replace that calculation with the existing shared CRS authority. Operators must
name both horizontal reference systems and receive coordinates, reference and
operation information, and explicit limits. The online page and both APIs must
agree on the same input. No customer/project coordinates are modified by this
calculator.

## Scope and preservation

This change covers the online service, its actual page, the two coordinate APIs,
their schemas/tests, and their API documentation. A small shared online contract
module and a focused transform UI component are appropriate if they prevent
schema drift or isolate request state. `src/lib/geo/transform.ts` remains the
calculation adapter over `src/lib/spatial/projectCrs.ts`; no duplicate projection,
Cartesian, Helmert, datum, or zone-selection mathematics remains online.

Do not restructure the unrelated GNSS tab, import workflows, CAD drawing,
survey-plan work, or deployed services. No database migration, package upgrade,
worker deployment, production promotion, or browser storage manipulation is part
of this implementation. Unused older transform components are not acceptance
targets; inspect their callers before any necessary compatibility edit.

## References and catalogue

1. New requests use non-empty `fromCRS` and `toCRS` registered codes. Resolve and
   canonicalize both through the authority before any identity shortcut.
2. The picker lists survey-eligible registered CRS, with code, name, datum,
   units, and projected/geographic status. Exclude display-only CRS, including
   EPSG:3857. Server discovery is authoritative for API clients; browser-local
   registration alone cannot configure a server.
3. Built-in WGS84 geographic and all 120 WGS84 UTM zones are available. Existing
   explicit Arc 1960 36S/37S definitions remain available with their actual
   configured parameters and a prominent applicability warning. This repair
   does not change those parameters or certify their catalogue notes.
4. A bare datum name is not a registered horizontal CRS. Do not turn the old
   regional datum table into new CRS definitions or assign EPSG operation IDs
   based on similar names. Previously advertised Adindan, Cape, ED50, PSAD56 and
   Hartebeesthoek options require explicit, reviewed reference configuration;
   explain their unavailable status rather than advertise them as working.
   Their jurisdiction-specific support remains an open platform requirement.
5. Custom registered systems may participate only when the online operation
   descriptor can identify an explicit horizontal path from their definitions.
   Identity is allowed after validation. For different systems, absent datum
   information, unsupported grid dependencies, or an unresolved datum path must
   produce `OPERATION_UNAVAILABLE`, never an implicit no-shift/WGS84 fallback.
   A shared datum label alone is insufficient evidence of an operation.

## Input contract and compatibility

Keep the recognizable named measurements: geographic input uses `longitude`
and `latitude`, projected input uses `easting` and `northing`. The service maps
them to shared-engine x/y (longitude/easting first). Require the applicable pair
to be finite numbers; reject absent/null horizontal values, strings, NaN and
infinity. Never coerce blank text to zero. Validate geographic longitude within
[-180, 180] and latitude within [-90, 90], including identities. Reject a request
containing the other horizontal pair to avoid silently discarding conflicting
measurements. No zone is inferred from coordinate values.

Optional `elevation` accepts a finite number, null, or omission. Preserve each
case exactly, including zero and fractions. It is an accompanying measurement,
not an input to a vertical transformation. Result metadata always states
`horizontalOnly: true`, `verticalTreatment: 'preserved-untransformed'`.

For the new explicit-CRS form, zone/hemisphere are properties of the resolved CRS;
if supplied as redundant input they must agree with it. Conflicting values, or
grid hints for a CRS without those properties, are rejected. No redundant hints
are required. Mixed explicit and legacy selector families are rejected.

The old `fromSystem`/`toSystem` form receives a narrow compatibility adapter:

| Legacy request | Resolution |
| --- | --- |
| WGS84 -> WGS84, with a valid geographic pair | Both EPSG:4326 |
| UTM -> WGS84, with integer zone 1..60 and explicit N/S | Source WGS84 UTM code, target EPSG:4326 |
| WGS84 -> UTM | Reject: target grid was previously guessed |
| UTM -> UTM | Reject: the old contract cannot name independent source and target grids |
| Any regional datum label or unknown system | Reject with guidance to provide explicit registered codes |

No regional or empty identity exception bypasses that table. Compatibility
success includes canonical CRS and a deprecation note; it does not retain the
old unsupported `precision` string. Errors identify the missing/ambiguous
reference and point to explicit-CRS discovery. The legacy helper's exported
signature can remain as an adapter while checked-in callers migrate; it must
not retain its separate mathematics.

The compatibility table applies to single-point requests. A legacy batch may
retain valid WGS84 -> WGS84 rows. Legacy UTM batches must migrate to explicit
common codes: their per-row grid hints cannot establish one common source CRS
or common operation descriptor. Do not choose the first row's grid for peers.

## Calculation and operation evidence

The online service validates/maps a point, invokes the shared transform adapter,
and maps the result to the target's named pair. Preserve full numeric precision
in service/API results. Only the UI formats digits. Do not manufacture geographic
and projected pairs simultaneously or copy irrelevant input measurements into a
successful result. An identity still requires complete valid input and preserves
its values exactly.

Every success supplies canonical source/target codes, names, datum labels,
units, axis convention, and an operation descriptor with:

- engine `proj4` through the shared METARDU authority;
- kind `identity`, `projection`, or `configured-datum-transform`;
- the exact registered source and target definition strings used, including
  embedded datum parameters; these are reference configuration, not secrets;
- `accuracyMetres: null`, `accuracyStatus: 'not-established'`,
  `applicabilityStatus: 'not-verified'`, and explanatory notes;
- the horizontal-only/height-preservation statement.

Operation classification must follow known definition content, not only datum
display labels. A descriptor describes the configured path executed by proj4;
it is not a certified EPSG operation, native PROJ operation search, grid-download
service, or surveyed-control validation. Do not repeat an operation ID/accuracy
from an unverified free-text registry note as structured evidence. Arc 1960
results must specifically show the existing configured translation and regional
applicability caveat. Unknown accuracy remains unknown even for identities or
projection-only paths: numerical reproducibility is distinct from position
accuracy. No label such as “exact accuracy” or “0.001 m precision” is emitted.

Validate output finiteness and target geographic bounds. On failure, provide no
substitute coordinate, unchanged-coordinate success, or result from an older
request. The shared engine's strict all-or-nothing batch behavior is unchanged;
the online batch adapter invokes it per row after resolving the common pair.

## API behavior and batches

Preserve existing authentication and rate limits (single:120/minute;
batch:10/minute). The single endpoint retains `success` and `result` as its
recognizable envelope, adds the reference/operation metadata, and returns HTTP
422 for a well-formed but inadmissible reference/measurement. Malformed envelope
JSON/schema gets the existing HTTP400 handling. Stable semantic error codes
distinguish `INVALID_COORDINATE`, `CRS_REQUIRED`, `CRS_AMBIGUOUS`,
`CRS_REJECTED`, `OPERATION_UNAVAILABLE`, and `TRANSFORM_FAILED`. A failed result
has no successful coordinate payload. Authentication/rate-limit failures retain
their existing status and envelope.

Batch accepts 1..1000 rows and one common explicit source/target pair. Preserve
row order, caller ID/name when supplied, and a zero-based `index` so absent or
duplicate IDs cannot misassociate results. Do not invent a caller ID or require
unique IDs: the internal engine ID can be the row index. Each row reports success
with coordinates and preserved elevation, or failure with a code/message. Return
the submitted decoded source row alongside its outcome so an operator can
identify a failed measurement; this is source values, not a claim of original
file-byte preservation. No persistence or upload is added.

Validate common references and envelope/count errors before processing (400 or
422 as above). Missing, malformed, nonfinite, or out-of-range row measurements
become row failures without suppressing valid peers. Use row-level validation
rather than a numeric array schema that rejects the whole batch first. A
non-object row is also an indexed row failure. Batch transport success is HTTP200
with `totalPoints`, `successCount`, `errorCount`, ordered `results`, canonical
references and the common operation metadata. Counts must sum to the input
length even when every row fails. A top-level invalid reference produces no
successes. Keep maxPoints1000 in discovery and all related documentation; remove
the existing 5000 claim. Document the legacy transition and HTTP422 behavior.

## Operator experience and result lifetime

The actual online tab shows explicit source and target pickers. Initial source
may visibly be EPSG:4326; target starts unselected. Do not infer a target or
north hemisphere from a location. Show each selected reference and its units
before calculation. Coordinate fields follow the source type; height is optional
and clearly marked unchanged. Switching source type clears incompatible
measurement fields so they cannot remain hidden in a submitted request.

Treat every measurement or reference edit as a revision: immediately clear
completed/error output and invalidate any pending response. Prevent duplicate
submissions while one request is pending; let input edits occur and show that
the current pending result will be discarded. After settlement allow calculation
for the new revision. Guard success, error, loading transitions, and callbacks
against older revisions and component unmount. Tab changes/unmount cannot attach
a result to another form instance. Loading, empty-selection, validation/error,
unavailable-operation, and success states must be distinguishable and keyboard
accessible. Errors/status updates use appropriate live-region semantics.

Track pending-request ownership separately from the input revision: settlement
releases that request's pending lock even when its result has become stale.
It must not clear a newer request's lock or leave the edited form locked forever.

Render explicit zero longitude/latitude/easting/northing and zero height using
presence checks. Success displays the named target pair, CRS, units, operation
kind, unknown accuracy, applicability warning and unchanged-height statement.
Formatting is labelled display resolution rather than measurement precision.
No result survives an input edit as if it belonged to current measurements.

## Verification and acceptance

Write meaningful regressions for the reproduced defects before replacing the
service. Cover:

1. Empty/invalid/unknown identities fail; valid identity preserves values.
2. Zero latitude/longitude, equatorial zero northing, and zero/null/omitted height
   survive correctly; blank UI values do not become zero.
3. Explicit international north/south WGS84 zones and distinct source/target
   grids agree with the existing authority; unknown/display-only CRS fails.
4. Arc 1960 fixture in the audit agrees with the independent native PROJ
   reference within a declared numeric tolerance appropriate to that fixture;
   inverse/forward and non-identity cross-grid tests exercise the real engine.
   This proves implementation consistency under fixed parameters, not accuracy.
5. Unresolved custom datum paths and unsupported grid dependencies fail closed.
   Known operation descriptors disclose definitions, unknown accuracy and
   regional limits without falsely claiming an EPSG operation or vertical work.
6. Legacy compatibility/rejection table, mixed selectors, conflicting hints,
   invalid coordinates and canonical metadata are covered at service/API level.
7. Batches preserve order, source rows and duplicate/missing IDs, give mixed and
   all-failure outcomes, preserve heights and report exact counts. Test 1/1000
   boundaries, over-limit rejection and invalid common references.
8. Actual page tests cover labels/units, zero rendering, every input edit,
   delayed success/error, new-input rerun, duplicate click, and unmount. Tests
   must exercise the component mounted by the actual online page.
9. Focused suites, types, lint/security checks and relevant existing transform
   consumers pass without weakening validation or updating unrelated snapshots.
10. Source-preview browser QA through CUA on 127.0.0.1 checks explicit grid entry,
    zeros, reference/error copy and edit-after-result behavior. Never seed page
    storage or overwrite the user's CAD training drawing. Authenticated API QA
    requiring the stopped synthetic database remains subject to its separate
    approval; handler tests do not count as normal-account HTTP proof.

Record tested source, commands, outcomes and exact missing evidence in readiness
documentation. Source acceptance does not establish worker currency, database
migration/restore readiness, production promotion, regional control suitability,
provider/payment behavior, receiver/device operation or field readiness. Those
remain separate gates toward the full field-to-finish platform objective.
