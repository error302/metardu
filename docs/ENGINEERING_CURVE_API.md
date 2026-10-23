# Engineering curve computation contract

This describes the current **source contract** for authenticated
`POST /api/engineering/compute/curve`. Production promotion and live acceptance
are separate. Horizontal requests retain their existing response shape. Vertical
and transition requests use the explicit version-2 contracts below.

All values are JSON numbers, not numeric strings. Nonfinite numbers, missing
references, unsupported fields and unrepresentable calculations return HTTP 400.
Authentication is required. This is a pure calculation endpoint; it saves no
project design, revision or evidence record.

## Symmetrical parabolic vertical curve

```json
{
  "curveType": "vertical",
  "g1": -2,
  "g2": 4,
  "vpiChainage": 1003,
  "vpiRL": 100,
  "curveLength": 200,
  "interval": 37
}
```

| Field | Meaning |
| --- | --- |
| `g1`, `g2` | Incoming and outgoing grades in **percent**, e.g. `-2` means -2%. |
| `vpiChainage` | VPI horizontal station in metres; signed and zero stations are valid. |
| `vpiRL` | Supplied VPI reduced level in metres; zero and negative levels are retained. The endpoint does not verify its vertical datum. |
| `curveLength` | Positive horizontal length in metres. Supply this **or** `kValue`, never both. |
| `kValue` | Positive metres per percent change in grade: length = K × absolute grade difference. Equal grades require an explicit length. |
| `interval` | Positive output sampling interval in metres. Omission uses 20 m for sampling only; this is not an adopted engineering criterion. |

The response has `contractVersion: 2`, `curveType: "vertical"`,
`model: "symmetric-parabolic"`, validated `input`, `units`, `reference` and
`geometry`. Geometry comes directly from the shared vertical engine: `A`, `L`,
`K`, BVC/EVC stations and levels, the in-curve stationary point or null,
classification, numerical identity check, exact-endpoint `rows`, dense
`profileRows` and calculation steps. The nested geometry's `curveType` is
`crest`, `sag` or `straight`; it is distinct from the request kind.

The example gives BVC 903 m / RL 102 m, EVC 1103 m / RL 104 m, with the sag
minimum at station 969.6666666667 m / RL 101.3333333333 m. A flat profile has
`K: null` and no unique stationary point. A nonflat profile that loses all
vertical variation to numeric resolution is refused.

## Symmetrical clothoid–circle–clothoid transition

```json
{
  "curveType": "transition",
  "radius": 300,
  "intersectionAngleDeg": 70,
  "spiralLength": 60,
  "piChainage": 1000,
  "interval": 17
}
```

| Field | Meaning |
| --- | --- |
| `radius` | Positive circular-arc radius in metres. |
| `intersectionAngleDeg` | Signed deflection between tangents, in degrees: positive turns right, negative left. Magnitude must be at least the shared engine's numerical minimum (0.000001°) and less than 180°. |
| `spiralLength` | Explicit length in metres of **each** equal spiral. Zero is an explicit circular limit; absence is an error. |
| `piChainage` | PI station in metres. TS is derived as PI minus tangent length; it is not silently treated as the PI or copied from a start station. |
| `interval` | Positive sampling interval, default 20 m. Exact TS/SC/CS/ST boundaries are included independently of the interval. |

The response has `contractVersion: 2`, `curveType: "transition"`,
`model: "symmetric-clothoid-circular-clothoid"`, validated `input`, `geometry`
from the shared spiral-alignment engine, `stations`, `units` and `reference`.
`geometry` retains full-precision `p`, `k`, `T`, `Lc`, total length,
TS/SC/CS/ST stations and the entry-spiral elements. World-coordinate fields in
that geometry remain null.

Each sampled station exposes `chainage`, `distanceFromTS`, **local** `x` and
`y`, `offset`, segment, `deflectionFromTsTangentDeg` and signed
`tangentDeflectionDeg`. The origin is TS, +X is along the incoming tangent and
+Y is right of it. These are not eastings, northings or geographic bearings.
No PI coordinates or CRS fields are accepted by this local calculation contract.
Use the separate project/CRS-bound workflow for surveyed placement.

For the example, tangent length is 240.402242998797 m, circular length is
306.519142918809 m and total alignment length is 426.519142918809 m. The local
ST position is approximately (322.624652605058, 225.904213766350) m. A negative
70° deflection mirrors Y and ends with signed tangent deflection -70°.

## Assessment and migration

Both version-2 results declare `assessmentBasis: "geometry-only"` and
`standardCompliance: "NOT_ASSESSED"`, with `Cache-Control: private, no-store`.
Successful numerical identities do not prove visibility, transition comfort,
drainage, adopted standards, control quality, datum correctness or design approval.
Tables are bounded to prevent unbounded allocation; their limits are numerical
resource guards, not field acceptance tolerances.

Old vertical `{R, chainageStart, designSpeed, g1, g2}` requests must be replaced
with the explicit VPI/level/length-or-K fields. An equivalent vertical-radius
approximation is not silently adopted as the parabolic definition. Old
transition `{R, deltaDeg, chainageStart, designSpeed, transitionLength?}`
requests must provide the new radius, signed angle, spiral length and PI fields.
`designSpeed` does not determine these geometries and is not accepted on the new
vertical/transition contracts. Such legacy requests return 400 rather than
obtaining invented levels, spiral lengths or ambiguous stations.

Horizontal requests (`curveType: "horizontal"`, or the supported legacy body
without `curveType`) still use `R`, `deltaDeg` and required `chainageStart`
(PI/IP station). Their flat response remains unchanged by this checkpoint.

Formula context: [Trimble's parabolic K-value definition](https://community.trimble.com/viewdocument/supplementary-information)
and [Esri's clothoid definition](https://doc.esri.com/en/arcgis-pro/latest/sdk/api-reference/topic75875.html).
These sources explain the geometry; project adoption and professional acceptance
require separate evidence.

## Scalar vertical endpoint

`POST /api/engineering/compute/vertical-curve` retains its explicit
`pvIChainage`, `pvIElevation`, `gradeIn`, `gradeOut`, `length` request names.
All are finite; length must be positive and the complete geometry representable.
The object is strict: speed, K, datum and other undeclared fields are rejected.
Grades are percent; stations, lengths and levels are metres. Signed stations and
zero/negative levels remain valid.

The flat version-2 response preserves the supplied parameters and the historical
interior `highLowPoint` when present. It adds PVC/PVT stations and levels,
`curveType`, `kValue` (null for equal grades), units, `standardCompliance:
NOT_ASSESSED` and `verticalDatumStatus: NOT_VERIFIED`. It does not return a
sample table or establish adopted criteria, datum correctness or approval.
Responses use `Cache-Control: private, no-store`. Nonrepresentable finite
geometry returns 400 / `INVALID_VERTICAL_GEOMETRY`; ordinary schema/malformed
body errors remain 400 through the common wrapper. Authentication and the
existing 60 requests/minute configuration remain in that wrapper.

See `VERTICAL_SCALAR_INTEGRITY_2026-10-23.md` for source, numerical, synthetic
wrapper and actual anonymous-HTTP evidence boundaries. No live authenticated
acceptance or production promotion is implied.

## Scalar horizontal endpoint

`POST /api/engineering/compute/horizontal-curve` requires finite numeric
`radius > 0`, `0 < delta < 180` (decimal degrees), and `piChainage` (signed
metres). The object is strict; it does not accept numeric strings, nulls,
speed/criteria or CRS fields as substitutes for geometry. A representability
failure returns 400 / `INVALID_HORIZONTAL_GEOMETRY`, rather than JSON nulls or
an unhandled 500.

Its version-2 flat result retains the scalar elements and PC/PT stations,
declares distance/station metres and angle degrees, and adds unassessed standards
and unverified coordinate-reference status. PT follows PC plus arc length.
This unsigned-angle contract does not place the curve in a map, choose a turn
direction or verify project control. Successful/numerical-error responses are
private/no-store; authentication and the existing 60/minute configuration remain
in the common wrapper. See `HORIZONTAL_ADAPTER_INTEGRITY_2026-10-23.md` for
proof boundaries and legacy-helper sampling/output changes.
