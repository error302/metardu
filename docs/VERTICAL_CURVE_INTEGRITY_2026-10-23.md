# Vertical curve calculation and evidence — 23 October 2026

This checkpoint covers the road-design source calculator and the existing host
preview. No production deployment or physical field acceptance is claimed.

## Reproduced defects

The original table began at floor(BVC / interval), producing elevations before
the curve, and omitted an off-grid EVC. It marked nearby rows as both peak and
sag rather than inserting the actual stationary point. Same-sign grades could
report an extrapolated high/low point outside the curve. Equal grades produced
infinite K and nonfinite stationary coordinates. The `y` column duplicated RL
instead of giving an offset from the incoming tangent.

The calculator supplied fictional grades/VPI/elevation/length initially,
truncated intervals to integers and substituted 20 m for missing/zero intervals.
Edits and mode switches left old results visible. Invalid input used a browser
alert and could leave a prior result available. The profile was a polyline of
requested peg rows, so a coarse interval could conceal its curvature or omit
the true ends. Its length label could reflect the last sampled row instead of
the declared endpoint.

A bounded initial engine/component run reproduced **18 failures with one
control passing**. An earlier infinite-length case exposed the unbounded old
loop; the owned Jest run was interrupted. A later host process inventory found
no matching runner. Infinite length is included in the final guarded tests.

## Corrected source contract

- Exactly one finite positive horizontal length or K controls the calculation.
  Grades, VPI chainage and VPI RL must be finite. K is explicitly positive
  `L / |G₂ − G₁|`, in m/%. Equal grades with explicit length produce a straight
  profile, null K and no unique stationary point. K cannot determine its length.
- BVC/EVC are always included exactly. Grid stations are strictly inside the
  curve. A unique zero-grade point is retained only within the closed curve
  interval and included in the table; endpoint/near-grid duplicates are avoided.
  Crest and sag flags are mutually exclusive and follow the sign of grade change.
- RL = BVC_RL + G₁x/100 + Ax²/(200L), where x is horizontal distance from BVC.
  The signed tangent offset `y = Ax²/(200L)` and instantaneous percent grade are
  returned separately. Missing extrema are null; no extrapolated point is published.
- Table generation uses safe integer grid indices and a conservative allocation
  cap of 10,000 rows including endpoints and a potential stationary point.
  Zero, negative, missing, tiny and nonfinite supplied intervals cannot silently
  fall back or create nonprogressing loops. The engine's omitted-interval default
  remains 20 m; the UI requires the visible interval to be supplied.
- Chainage resolution uses 32 scaled machine epsilons; inputs are refused if
  that resolution exceeds 1e-8 of the length. Endpoint elevation identity uses
  32 machine epsilons scaled by elevation magnitudes. These are numerical
  safeguards, not adopted field or design-standard acceptance tolerances.
- All evaluated outputs must be finite. Dense profile samples (65 plus any
  stationary point) use the same evaluator as peg rows, independent of the
  selected table interval. The profile explains its independent axis scales.
  The shared renderer also suppresses off-curve/nonfinite extrema and labels
  equal grades straight. It continues to serve `/tools/curves`.
- The public calculator begins with blank geometry/control inputs, preserves
  entered zero/negative RL and chainages, accepts fractional intervals, shows
  accessible inline errors and clears results/profile/steps on every edit or
  authority switch. Cards correctly show crest A < 0 and sag A > 0.

The nullable K/extremum fields, true tangent-offset `y`, additional grade and
profile fields are intentional corrections to this module's source contract.
The active direct consumer was updated; TypeScript app/test checks verify the
current checkout. Other independent vertical-curve engines are not consolidated
or claimed repaired by this change.

## Independent numerical cases

[Trimble Novapoint's K-value concept](https://help.trimble.com/doc/novapoint/novapoint/road/road-cad-tools/alignment-design/technical-information/supplementary-information)
describes constant grade change for a simple parabola and the relationship
between horizontal length, grade change and K. Integrating that grade relation
gives the elevation equation used here. This reference does not adopt any
jurisdiction's design-speed, drainage, comfort or sight-distance criteria.

For G₁ = −2%, G₂ = +4%, VPI chainage 1003 m, VPI RL 100 m, L = 200 m:

| Quantity | Independent expected value |
| --- | ---: |
| BVC chainage / RL | 903 m / 102 m |
| EVC chainage / RL | 1103 m / 104 m |
| K | 33.333333333333336 m/% |
| Low-point distance from BVC | 66.66666666666667 m |
| Low-point chainage / RL | 969.6666666666666 m / 101.33333333333333 m |

Reversing to G₁ = +4%, G₂ = −2% gives a crest with high-point chainage
1036.3333333333333 m and RL 98.66666666666667 m. Same-sign +2%/+4% has no
stationary point on this curve. A separate flat case preserves RL 0 and negative
chainages at 12.5 m intervals.

## Verification and limits

- **104 tests across nine suites pass**, covering the three vertical suites,
  three horizontal suites and existing curve/road-coordinate-setout regressions.
  After correcting an unsupported Testing Library option, all 14 calculator
  cases were rerun and pass; they are included in the 104, not additional tests.
- App TypeScript passed; test TypeScript passed after that test-only correction.
  Scoped ESLint passes without warnings/errors. The security gate passes with
  119 applied migrations pinned.
- CUA on `127.0.0.1:3021/tools/road-design` verifies the reference endpoints,
  exact low point, profile, stale-result removal, K-mode equivalence and refusal
  of a negative interval. At 390 × 844, document width is 380 px and the 640 px
  table scrolls inside its 314 px container. The viewport was reset afterward.
- Screenshots: `.cache/vertical-curve-review/desktop-profile.png` and
  `mobile-controls.png`. Red/green machine reports are
  `.cache/horizontal-curve-review/vertical-{red,green}.json`.
- A preservation comparison with `9d84fe85` confirms horizontal engine parts
  1–2 and parts 4 onward are unchanged after line-ending normalization.
  `.cache/vertical-curve-review/preservation.json` records the latter SHA-256
  `283f7971f0f772f41ab2ad31bca3bde8c866a95664ae407b44e1d48eef15b149`.
- Fresh `npm run docker:verify` passes required production health/inventory,
  with one application container. Backup completion remains
  2026-10-23T10:25:43Z, archive/header evidence only.

No database write, credential/account change, service restart, container build,
promotion or field observation was performed. Other road calculators and
vertical engines, exports, project criteria, sight-distance compliance, approved
benchmarks/datum, production promotion and physical field acceptance retain
their own evidence requirements. Existing worker, recovery and deferred
signing-key rotation release blockers remain open. The wider goal remains active.
