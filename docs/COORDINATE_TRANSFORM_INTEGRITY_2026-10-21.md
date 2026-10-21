# Coordinate transform integrity

## Reproduced defects

The documented `/api/geo/transform` EPSG example failed because its engine knew
only a separate set of compatibility names. That engine rounded every horizontal
result to three decimals, including geographic degrees. On conversion failure
it could emit `(0,0)` plus a warning and the API could log the batch as successful.
It also passed supplied heights into a 3D datum operation without establishing
their vertical reference.

The exported `convertDatum` helper guessed UTM 37S for bare `ARC1960`, supplied
zero for missing heights and returned unchanged input after an error. Its identity
shortcut accepted unknown references. No current source caller was found for that
helper; it remains exported through the compute barrel and is now guarded.

The first regression run reproduced **18 failures with four passing tests**.
Review then reproduced two adapter defects: local legacy CRS codes needed to
resolve in a fresh registry, and generated temporary IDs could collide with actual
point IDs. Both have dedicated passing regressions.

## Source result

The API engine delegates horizontal transformation to the existing
`src/lib/spatial/projectCrs.ts` authority. It accepts registered CRS codes, retains
all ten explicit compatibility choices, and refuses empty, ambiguous, unregistered
or display-only references even for identity operations. No UTM zone is inferred
from a datum name. Existing projection and transformation parameters are unchanged.

The existing Arc 1960 north-zone and 35S compatibility choices retain their old
parameters under `METARDU:LEGACY:*` local names, with regional-applicability notes.
They are not assigned invented EPSG identities. Returned local names can be
resolved by a fresh process using this adapter. Registration still refuses a
conflicting definition. These compatibility parameters need independent control
review before survey use; retaining them is not an accuracy endorsement.

Coordinates retain calculation precision; presentation may format copies for
display. Identity operations preserve exact supplied horizontal values. Each
batch requires unique non-empty point IDs, finite coordinates and valid geographic
bounds. A bad input or non-finite/failed transformation rejects the complete batch.
Neither transform endpoint returns failed points as substitute zero coordinates.
Both expose CRS failures as HTTP 422 `COORDINATE_TRANSFORM_REJECTED`; the geo route
does not write a success log for a rejected batch.

Heights are preserved unchanged, including omitted, null, explicit zero and
supplied fractional values. The result declares `horizontalOnly: true` and
`verticalTreatment: preserved-untransformed`, plus source/target CRS, datum,
horizontal units and operation notes. This is not a vertical-datum conversion.
The legacy helper reports the target CRS and units, does not relabel an unchanged
fallback as converted, and leaves source records intact. Temporary computational
IDs do not become invented IDs on unnamed output records.

The API description now states these horizontal/vertical boundaries instead of
implying an unrestricted datum/vertical operation.

## Evidence and remaining scope

**140 tests pass across five suites**: 28 new transform/route checks plus existing
golden geodetic regressions, shared CRS authority tests and compute-bridge tests.
Checks include the documented EPSG request, a WGS 84 false-origin invariant,
round-trip precision, all explicit legacy choices, heights and identities,
invalid-batch rejection and no success logging on rejection. Adapter-versus-
authority comparisons and round trips are consistency evidence, not independent
field truth. API tests mock authentication wrapping, worker-independent database
logging and request context; they do not prove live authorization or persistence.

Strict app/test typing, scoped lint and the security gate pass. The latter pins
119 applied migrations; no migration source, ledger, existing coordinate record
or production service was changed. No container was built, started, restarted,
migrated or promoted in this pass. No browser storage or CAD training drawing
was touched. A later full ordinary Jest checkpoint passes 5,441 tests with nine
native checks skipped; its source fingerprint and the separate online-service
defects are recorded in [the online transform audit](ONLINE_TRANSFORM_AUDIT_2026-10-21.md).

Ignored local evidence: `.cache/transform-integrity-red.log`,
`transform-local-code-red.log`, `transform-adapter-review-red.log`,
`transform-integrity-final-tests.log`, `transform-integrity-types.log`,
`transform-integrity-lint.log`, and `transform-integrity-security.log`.

Live normal-account requests, regional control comparisons, adopted operation
accuracy, vertical/reference-frame transformations, deployed behavior and field
acceptance remain unverified here. Separate online-conversion implementations and
the older unused UI adapters require their own audit; this milestone does not
establish all coordinate workflows. The worker artifact, Fieldbook migration,
recovery, provider/payment and device/field release gates remain open.
