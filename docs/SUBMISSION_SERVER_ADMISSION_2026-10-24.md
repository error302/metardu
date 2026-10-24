# Submission server admission

Source checkpoint, 24 October 2026. This closes specific server validation
bypasses; it is not production, authority, field or complete submission acceptance.

## Reproduced defects and behavior

Deed generation previously skipped validation when its evidence loader returned
null. A full dossier assembled from existing ready documents never ran the gate.
Failed traverse/parcel reads silently omitted evidence, unknown parcel ordinates
became zero, and the largest resulting parcel was guessed as a parent. NaN
comparisons passed silently. Exceptions in individual rules only warned.

`submissionAdmission.ts` now reloads server evidence and the project owner's
resolved surveyor credentials. It applies the configured gate before document
rendering, package downloads, storage, reference allocation or submission writes.
Direct document generation, both package implementations, and the validation
endpoint share this path. A cadastral submission requires traverse and parcel
evidence; mutation output additionally requires an explicit parent reference.
No resulting parcel is promoted into that reference.

Missing project/profile reads return a safe 503 domain error. Failed checks
return 422 with findings. Failed subsidiary evidence reads, invalid numeric
values and unevaluated rules block with `UNASSESSED`. Rule version is now 1.4.0;
deed audit metadata records the version and evaluation time actually used.

The loader reads the canonical PostGIS parcel geometry and canonical traverse
coordinate names, rather than nonexistent `boundary_points`, `area_sqm`,
`linear_misclosure`, `angular_misclosure`, `station` or `rl` columns. Explicit
field-observation computations bypass the irrelevant legacy traverse lookup.
Legacy coordinates without retained closure metrics remain unassessed; their
alphabetical coordinate order is not converted into observation closure.
Unknown closure and coordinates remain invalid instead of acquiring zeroes.
Holes and multipart parcel geometry are explicitly unsupported by these checks.

The generation route no longer overwrites a previous ready row with a transient
`generating` status before admission. Admission refusal makes no submission
metadata writes. A renderer failure can record an error for a missing/failed
document, but cannot downgrade an existing ready row. The assembly route also
checks explicit project ownership before loading survey evidence.

## Evidence

Ten initial behavioral tests failed against the earlier source. An eleventh
exception fixture initially evaluated its getter during TypeScript's object
spread transform; it was corrected with `Object.defineProperty` before assessing
the rule behavior. Two additional loader fixtures reproduced schema/current
computation handling failures. Existing package/content tests isolate admission;
the new admission/route tests use the actual shared guard and configured gate.

- The focused set passes 111 tests in nine suites. The combined terrain,
  mobile, account, civil export and submission regression run passes 473 tests
  in 46 suites: `.cache/single-chat-combined-tests.json`.
- Six actual PostgreSQL checks pass in `.cache/submission-admission/native.json`:
  empty canonical tables fail for missing evidence without SQL errors; retained
  field-observation data passes configured numeric checks; unknown closure
  blocks; refusal preserves the full ready row; a deliberately failing renderer
  preserves that row through the actual `ON CONFLICT` SQL; canonical PostGIS
  rings load without inventing a parent.
- The native verifier copies empty table definitions/indexes only into a unique
  owned schema in the exact pre-existing synthetic loopback database. It does
  not copy rows or apply migrations. It checks the database/service identity,
  ownership marker, applied ledger and public-table counts; it removes only
  its exact owned schema. Routes use an adapted owner context, so this is not
  session, HTTP, RLS or ordinary-account browser proof.
- `npm run verify:engine` passes all 70 checks. The security gate passes with
  119 pinned migrations; this is not a complete security audit.

The final retained receipt binds the checked source hashes and successful
cleanup observations. Setup failures in the native fixture (required synthetic
password hash and initially omitted copied unique indexes) were corrected;
failed runs also removed their exact owned schema and preserved the ledger.

## Required follow-up

The guard evaluates current reads; generators still perform subsequent separate
reads. There is no immutable submission snapshot, transaction-wide binding or
concurrent-edit admission protocol. Existing ready files are not yet bound to
the latest reviewed observation/control/calculation revision. A fresh passing
gate does not establish that an old file contains those current inputs.

Explicit parent evidence/review is not implemented in this loader, so mutation
generation remains blocked rather than guessing it. Other survey families,
CRS/control completeness, angular-check applicability, legacy retained result
formats, unsupported geometry, and every independently reachable generator/API
need their own complete admission and artifact review. The separate interactive
deed SVG and NLIMS draft paths are not certified by this checkpoint.

Audit append still logs failures without blocking deed generation. Package
atomicity, external file URL admission, immutable file hashes and snapshot-bound
provenance remain release work. Actual browser flows, paid lifecycle, customer
migration/recovery, production promotion and professional field/receiving-CAD
acceptance remain open. No container lifecycle, production data, entitlement,
provider, credential or applied migration change was performed for this work.
