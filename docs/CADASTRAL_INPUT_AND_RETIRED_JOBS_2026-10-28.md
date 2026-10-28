# Cadastral input admission and retired community jobs

This source checkpoint follows `5abeda8d0a5632e1f99b3ed0972b0ccc11ca9b33`.
It closes two confirmed sources of false evidence without changing customer
records, migrations, the production stack or paid access.

## Cadastral observations

`prepareCadastralInput` previously accepted arbitrary values through `any` and
JavaScript number/string coercion. A boolean could become a coordinate or
distance, an array could become a distance/bearing/station name, and hexadecimal
text could become a measured leg. Malformed retained rows also raised incidental
errors or leaked non-text metadata into the computation input.

The adapter now checks row/control/raw-data objects before reading properties.
Coordinates and distances accept finite numbers or explicit decimal numeric
text, including decimal exponent notation. Booleans, arrays, objects,
hexadecimal values and non-finite numbers are refused. Station names and optional
project metadata must be text; bearings retain the existing decimal/DMS grammar.
Optional UTM metadata must be a valid zone if supplied and is omitted when absent.
The saved `parcel_number` alias is retained as declared text.

The grid-distance pipeline, original leg residuals, no-double-reduction rule,
closed-boundary checks and transactional save behavior are preserved. This
adapter supplies no CRS default or projection reduction. The existing route's
declared projected reference and confirmed starting-control gates still apply.
No control acceptance, legal boundary or physical measurement is inferred.

The new regression suite reproduced 22 failures in 25 cases against the old
adapter. With the repair, it and the existing cadastral browser-input model,
crossing-boundary and design-save atomicity suites pass all 58 tests. These are
source/model tests; the suite name does not make this a fresh browser or field
acceptance result.

## Obsolete job-board endpoint

The professional survey blueprint sections 0.3 and 24 retire Community as a
primary product area. The current `/community` page already redirects to the
instrument marketplace, and no current UI calls `/api/community/jobs`.
The old route nevertheless presented sample jobs as real when the database was
empty or failed. Its POST accepted anonymous requests, built IDs incompatible
with the UUID column, suppressed write failures, and could acknowledge unsaved
jobs. Its handler also attempted to consume a body already read by apiHandler.
The retained survey_jobs schema lacks fields assumed by legacy job helpers.

Rather than creating an unsupported new job service, GET and POST now return
410 with `COMMUNITY_JOBS_RETIRED`. The response identifies the marketplace as
an instrument listing area, not a replacement survey-job service. It never reads
or writes stored jobs, generates sample listings, parses posting bodies or
acknowledges saves. Existing records and legacy tables remain untouched.

Five contract tests first failed against the old behavior and pass with the
retired route. An actual anonymous GET through the existing source preview at
127.0.0.1:3021 returned 410 and the retirement code at
2026-10-28T12:08:02Z, with private, no-store caching. The first sandbox request
failed; authoritative listener/process inspection and host-access GET confirmed
the original preview was still running. It was not restarted and the CAD drawing
was not accessed.

## Admission evidence and remaining scope

Both application and strict test TypeScript checks pass. All four changed
code/test files pass scoped lint with zero errors and warnings. The complete
API inventory reports 328 routes, 790 queries and zero untyped queries; the two
removed queries belonged to the obsolete job endpoint. Baselines and lint rules
are unchanged. This is typing inventory, not proof every query is correct.
The 58 cadastral and five retirement tests give 63 focused passes in total.
Receipts are retained under the ignored `.cache/source-admission/` and
`.cache/calibration-repair/` paths.

At the prior calibration revision, GitHub run 40683342315 passes TypeScript,
security audit, native design/set-out PostgreSQL, Python worker, web/mobile
builds, API typing and i18n checks. Full lint still reports 439 errors and
47 warnings; browser shards and accessibility still fail. Its full Jest result
was still running at the last observation. These are that prior revision's
results, not this checkpoint's CI acceptance.

The existing production verifier passes health/ownership checks; production
continues to run older source. Worker artifact alignment, migrations 115–123,
rollback identity, real recovery, deferred signing-key rotation, authenticated
visual/admin/device checks, other survey/road/large-project work, provider/CAD/
print and independent field acceptance remain open. Other legacy community
APIs/helpers and primary navigation still need review against the retirement
blueprint; retiring this endpoint does not certify those paths.
