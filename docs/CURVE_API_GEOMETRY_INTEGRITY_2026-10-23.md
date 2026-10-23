# Explicit curve API geometry — 23 October 2026

This source checkpoint closes the ambiguous vertical and transition branches of
`/api/engineering/compute/curve`. It does not deploy the application or complete
the field-to-finish production goal. The client contract and migration examples
are in [ENGINEERING_CURVE_API.md](ENGINEERING_CURVE_API.md).

## Reproduced failures and root causes

The old vertical branch assumed a zero starting elevation, accepted no actual
VPI level and implicitly used an equivalent-radius-to-K convention. That
approximation was not identified in its contract. The transition branch guessed
spiral length, treated `chainageStart` as TS and used abbreviated p/k formulas;
it could return negative circular-arc length and reversed station ordering.
Neither branch provided an actual profile/station table from the reviewed shared
engines. Supplying a speed did not establish an adopted standard or approval.

The initial actual-handler regressions reproduced **10 failures with 20 controls
passing**. Most controls exercised refusal of already-invalid request shapes;
they are not 20 independent demonstrations of the new geometry. Tests use real
NextRequest/NextResponse, stubbing only authentication/options and logging.

After delegation to the shared engines, a further regression showed that an
extreme VPI level could round a nonflat profile entirely to that supplied level.
Two direct engine cases reproduced the loss: large-level rounding and subnormal
grade underflow, with 30 controls passing. The shared engine now refuses this
complete collapse. A truly flat finite profile remains valid; a tiny endpoint
grade does not invalidate an otherwise resolvable profile or remove exact EVC.
No field tolerance or guessed replacement elevation is introduced.

## Corrected source behavior

- Vertical requests require finite percent grades, VPI station and VPI reduced
  level plus exactly one positive length or K (metres per percent). Supplied
  zero/negative stations and levels are retained. `verticalCurve` is the sole
  calculation authority, including endpoints, in-curve stationary points, dense
  profile samples and numerical identity checks.
- Transition requests require explicit radius, signed intersection angle,
  spiral length and PI station. They use `computeSpiralAlignment` and
  `stationSpiralAlignment`, retaining exact junctions and full-precision
  clothoid/circular/exit geometry. Excessive spiral angles, collapsed stations,
  invalid intervals and excessive tables return 400, not plausible geometry.
- Signed angles preserve direction: positive right and negative left. Explicit
  zero spiral length is a finite circular limit; absence is an error.
- The new strict request shapes refuse ambiguous legacy fields and unsupported
  world-coordinate/CRS inputs. Their version-2 responses declare geometry-only
  assessment and NOT_ASSESSED standards compliance. Vertical datum remains
  unverified. Transition table coordinates are explicitly local X/Y with TS as
  origin, forward incoming tangent +X and right +Y; local direction is not
  labeled a geographic bearing or easting/northing.
- Both new response kinds are private/no-store. Authentication and the previous
  horizontal request/response paths remain in place. There is no persistence,
  project adoption, revision or design-approval claim.
- API documentation now describes geometry instead of promising AASHTO K-factor
  compliance from the separate scalar vertical endpoint, which does not perform
  that standards assessment.

This is an intentional compatibility change for vertical/transition clients.
No direct frontend fetch caller to this endpoint was found in the checkout;
external clients still require the documented migration. Old requests return a
validation error rather than silently acquiring missing references or lengths.

## Numerical references and independent checks

[Trimble's K-value explanation](https://community.trimble.com/viewdocument/supplementary-information)
defines K through horizontal length and percent grade change; its equivalent
radius relationship is approximate and does not supply a missing elevation.
[Esri's clothoid definition](https://doc.esri.com/en/arcgis-pro/latest/sdk/api-reference/topic75875.html)
uses curvature linear in arc length. These are formula references, not evidence
of project adoption or professional approval.

`node scripts/verify-curve-api-geometry.mjs` loads the actual current source
handler with native NextRequest/NextResponse. Its bounded session adapter
supplies a synthetic caller identity only. It starts no listener, mints no
credential, creates no account and touches no database or provider. All **22
cases pass**, including an anonymous refusal and horizontal control. Source
hashes match before/after; adapters are restored in finally and the receipt is
marked running before work and failed on error.

`python scripts/verify-curve-api-geometry.py` reads those actual JSON responses
using only the standard library. It verifies **six vertical profiles (438
samples)** using 50-digit Decimal evaluation of the parabola and **four
transition alignments (70 stations)** by independent Simpson integration of the
piecewise heading/curvature law. It verifies units/reference boundaries, exact
junction inclusion, cache metadata and the eleven refusal cases. Numerical
comparison limits are not engineering/field tolerances.

Independent numerical anchors include:

- G1=-2%, G2=4%, VPI station 1003 m / RL 100 m, L=200 m: BVC 903 m /
  RL 102 m, EVC 1103 m / RL 104 m; sag minimum 969.6666666667 m /
  RL 101.3333333333 m. Explicit zero and negative levels remain unchanged.
- R=300 m, angle=+/-70°, each spiral=60 m, PI=1000 m: T approximately
  240.402242998797 m, Lc=306.519142918809 m, total length
  426.519142918809 m. Local ST approximately (322.624652605058,
  +/-225.904213766350) m; signed end-tangent deflection is +/-70°.
- Zero spiral / R=100 m / -60° gives the finite circular limit, local ST
  (86.6025403784, -50) m and total length 104.71975511966 m.

An early strict floating-point equality for a junction literal differed by one
ULP; the assertion now uses the independent numerical comparison limit, while
still requiring the actual junction row rather than a nearby regular peg.

## Verification scope

- **147 focused tests across eight suites pass**: real API handler, horizontal
  control, shared vertical and spiral engines, public calculator components,
  spiral UI and adjacent saved-road transition integration. Raw JSON numeric
  overflow is refused before it could serialize as null geometry.
- Full `npm run typecheck` passes application and tests in the current working
  tree; strict test TypeScript is rechecked after final regression additions.
  The concurrent topographic type failures observed at the earlier quick-compute
  checkpoint are no longer reproduced. Their source changes remain separately
  owned/uncommitted here; this is not clean-release build proof.
- Scoped ESLint passes with no errors/warnings. The security gate passes with
  119 applied migration files pinned. No migration/hash change is part of this
  repair, including the separately owned candidate migration 116.
- The legacy compute adapter, scalar engineering engine, spiral geometry engine
  and shared horizontal/set-out prefix match the parent commit. Source
  preservation hashes are retained. Existing four source DXF fixture bytes are
  unchanged, and the independent CAD reader still passes 64 checks across those
  and the two retained source-preview browser downloads.
- Fresh read-only `npm run docker:verify` passes required production health and
  one-application ownership after host-access retry. Backup remains
  2026-10-23T10:25:43Z, archive/header evidence only. No lifecycle action,
  deployment, database clone, account reactivation, customer write or browser
  storage change occurred.

Receipts are under `.cache/curve-api-integrity/`: `red.json`, `level-red.json`,
`engine-level-red.json`, `green.json`, `source-handler.json`,
`independent-reader.json`, `preservation.json` and check logs. These prove source
behavior with synthetic admission, not live authenticated HTTP or production
role/field acceptance.

## Remaining gates

The separate `/tools/curves` vertical UI, other legacy scalar/standards helpers,
multi-VIP designer, scalar vertical endpoint and profile-DXF path need their own
continued audit. Their old standards claims are not validated by this repair.
Saved alignment authority, CRS-bound placement, revision-bound exports and
professional design/field acceptance remain distinct from these local geometry
calculations. Worker compatibility, key rotation, recovery/restore evidence,
reviewed promotion and ordinary-account/offline/physical acceptance gates remain
open in the production goal.
