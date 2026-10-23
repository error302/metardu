# Horizontal circular curve integrity — 23 October 2026

This checkpoint repairs source calculations and the existing host preview. It
does not promote an application image or establish field acceptance. The wider
production-readiness goal remains active.

The road-design calculator previously used tangent length as the TC chainage,
ignoring the entered PI chainage, then converted an already-radian angle to
radians again. Its local table duplicated shared engine logic. The shared
engine duplicated an on-grid TC, used chords from TC where successive peg
chords were expected, repeated cumulative angles in the incremental column,
and doubled the final CT deflection. Its element check compared arc stationing
with PI + T, falsely failing valid circular curves. Missing input validation
also admitted nonfinite values and unbounded/nonprogressing table loops.

The initial engine/component run reproduced 21 failures with one control
passing. Four separate diagram cases reproduced an arc detached from PC; the
old diagram also implied north orientation without a bearing input.

## Resulting behavior

- One shared calculation supplies elements and set-out rows. TC = PI − T;
  CT = TC + L. The alternative numerical identity uses PI + (L − T), never
  PI + T. Its status explicitly requires separate field checks.
- Table chords join consecutive pegs. Incremental deflection is half the
  central angle of that segment; cumulative deflection is from the forward
  tangent at TC and reaches Δ/2 at CT. Direction, geographic bearings,
  coordinates and control quality are not inferred.
- Degrees/minutes must be integers in range; seconds must be finite in [0,60).
  Radius and interval must be finite and positive; central angle is strictly
  between 0° and 180°. Negative chainages and fractional intervals are allowed.
- TC/CT and RΔ must agree within 32 machine epsilons scaled by the input
  magnitudes. If that numerical resolution exceeds 1e-8 of the arc length,
  the input is refused. These are floating-point consistency safeguards, not
  survey acceptance tolerances. Rounded manual chainages may need their
  original precision. The UI derives them from the same full-precision result.
- Grid indices must be safe integers and the conservative table allocation
  bound is 10,000 rows including endpoints. Endpoint roundoff is excluded at
  the same numerical precision. No repeated-addition while loop remains.
- DMS output rounds once to a tenth of a second before splitting D/M/S,
  carrying seconds/minutes correctly. Displayed chainages are rounded to
  millimetres; calculations retain their full numeric precision.
- The calculator starts without a radius, angle or PI chainage. Every input
  edit clears the result, diagram, steps and table until recomputation. Invalid
  input shows an accessible error. Interval is visible before computation.
- The schematic now connects PC/arc/PT, has perpendicular radius/tangent
  relationships and fits PC/PT/PI/O over acute and obtuse reference cases.
  It has no geographic north arrow. The shared diagram also serves `/tools/curves`.
- The degree-of-curve value is explicitly a **30 m arc definition** and uses
  its exact conversion, replacing the rounded unexplained constant.

## Independent reference and fixtures

[WSDOT Highway Surveying Manual, Chapter 11, January 2005,
pages 11-3–11-7](https://wsdot.wa.gov/publications/manuals/fulltext/m22-97/chapter11.pdf)
provides an independent geometry reference for arc stationing, tangent length,
deflections and chords. Its jurisdiction-specific station intervals/units are
not adopted as METARDU project criteria. The horizontal page now links that
reference without claiming verified Kenyan RDM compliance.

For R = 100 m, Δ = 60°, PI = 500 m:

| Quantity | Expected |
| --- | ---: |
| Tangent length | 57.73502691896258 m |
| Arc length | 104.71975511965977 m |
| TC | 442.2649730810374 m |
| CT | 546.9847282006972 m |
| Long chord | 100 m |
| CT cumulative deflection | 30° |

At 20 m intervals the interior stations are 460, 480, 500, 520 and 540 m.
A second fixture starts at TC = 0 with three equal 20° central arcs: all three
successive chords are 34.72963553338607 m, each incremental deflection is 10°,
and the total polygonal chord length is 104.1889066001582 m.

## Verification and boundaries

- **57 tests across six suites pass**: new engine, rendered calculator and
  diagram cases plus existing curve/extended-curve/road-coordinate-setout
  regressions. Additional guards cover invalid/tiny intervals, large chainage
  precision, negative chainages, fractional intervals, endpoint roundoff and
  stale outputs. Unsafe historical negative/tiny-interval loops were not run
  directly because they could hang; the initial bounded cases established the
  calculation failures before repair.
- App and test TypeScript checks pass. Scoped lint passes with zero errors or
  warnings. The security gate passes and confirms 119 pinned applied migrations.
- Engine parts 3 onward match baseline `3358a31b` after line-ending
  normalization; `.cache/horizontal-curve-review/preservation.json` records
  SHA-256 `584b751438151d22c1cb51c8422e501ca625abce8689424eb1f8b30c0625fec3`.
- CUA on the owned `127.0.0.1:3021/tools/road-design` preview independently
  displays the reference elements and seven-row table ending at 546.985 m and
  30°00′00.0″. Changing PI removes results; a negative interval is refused.
  At 390 × 844, document width is 380 px and the 680 px table scrolls inside
  its 314 px container. The viewport was reset afterward.
- Local screenshots are under `.cache/horizontal-curve-review/`:
  `desktop-setout.png`, `mobile-setout.png`, `desktop-diagram.png`.
- Fresh `npm run docker:verify` passes production HTTP/database/Redis health,
  required support inventory and one application container. Backup completion
  remains 2026-10-23T10:25:43Z, archive/header evidence only.

No database write, account reactivation, container build/restart, promotion or
field observation was performed for this repair. Other road-design calculators,
site-specific design standards, station equations, curve direction/orientation,
export workflows, physical set-out and instrument/control validation require
their own evidence. Existing release, recovery, worker compatibility and deferred
signing-key rotation blockers remain open. Unrelated topographic work is preserved.
