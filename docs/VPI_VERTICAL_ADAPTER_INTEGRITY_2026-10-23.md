# Legacy VPI adapter integrity — 23 October 2026

The vertical-profile exports in `src/lib/engineering/curves.ts` and
`src/lib/engineering/compute.ts` now use the reviewed shared road engine through
one VPI adapter. This closes the two duplicate-helper limitations identified in
the BVC-anchored profile checkpoint. It does not validate all engineering
functions or complete the platform's field-to-deliverable acceptance.

## Reproduced defects

Both helpers formerly generated only regular 20 m pegs and rounded station,
grade, RL, A and K inside the calculation. A 205 m sag centred at station
1000.125 has BVC 897.625 and EVC 1102.625; their schedules began at **900** and
omitted both exact endpoints and the unique sag. Equal grades returned infinite
K, and a small valid grade difference could be rounded to zero in the result.
Invalid length in the unvalidated helper returned empty/nonfinite schedules;
some finite extreme stations or infinite lengths could stall its sampling loop.

The compute helper additionally defaulted speed to 80 km/h and used `|g2-g1|/100`
in the friction term of an alleged stopping-sight-distance calculation. Grade
change is not longitudinal friction. It also returned `cutFill: 0` without
measured ground levels. Its fixed minimum length/grade limits were presented as
RDM validation without an adopted project criterion.

The initial bounded regression run against the old implementation recorded
**15 failing tests**. Unbounded interval/length cases were added only after the
bounded shared adapter replaced the loops, avoiding a deliberate memory/CPU
exhaustion run.

## Final contracts and migration

- `curves.verticalCurve` retains explicit `gradeIn`, `gradeOut`, `length`,
  `chainage_VIP` and `elevation_VIP`, with optional `interval`. Grades are percent;
  distance, station, level and tangent offset are metres. Sampling defaults to
  20 m; exact endpoints and any unique in-curve stationary point are included.
- `compute.verticalCurve` retains the `g1`, `g2`, `L`, `chainage_VIP` and
  `elevation_VIP` spelling, with optional `interval`, and adapts the same result.
  Its schema is finite, explicit and strict. Signed stations and shorter or
  steeper numerical geometry are allowed without implying design acceptability.
- **Intentional breaking input change:** compute requests containing
  `designSpeedKph`, `K` or other unknown fields now fail validation instead of
  silently defaulting, ignoring or misusing them. This length-based helper does
  not adopt a speed or an independent K authority. A K-based profile belongs to
  the explicit shared length-or-K contract; road safety needs actual declared
  criteria through the reviewed safety calculations.
- **Intentional output changes:** `kValue` is `null` for equal grades; the
  `curveType` is explicitly crest, sag or straight. Engine results retain full
  numerical precision; callers must format display values. Schedules can gain
  endpoint and stationary rows.
- Both results carry `standardCompliance: NOT_ASSESSED` and
  `verticalDatumStatus: NOT_VERIFIED`. A supplied VPI level is not datum proof.
  Each row includes signed `tangentOffset`, distinct from ground earthwork.
- The compute result retains `sightDistance: null` with
  `sightDistanceStatus: NOT_ASSESSED`, and each `cutFill` is `null`. These values
  require evidence absent from a parabola. Null replaces fabricated measurements.
- Finite-domain, endpoint/level/station resolution, overflow and conservative
  10,000-row guards come from the shared engine. There is no new geometry formula
  or independently evolving sampling loop in either adapter.

Tracing found the compute helper used directly by existing computation tests,
with the curves helper exposed as a separate library export. The current curves
UI and `/api/engineering/compute/curve` vertical branch already use the shared
engine directly. That API's strict v2 contract is unchanged, as are the BVC
helper and current PDF/CSV exporters. No production API adoption of these legacy
output changes is inferred from source tests.

## Evidence and remaining work

- **152 focused tests in seven suites pass**, covering both adapters, existing
  computation tests, shared vertical geometry, the BVC adapter, quick-compute UI
  integration and explicit curve API handlers. This is source/component evidence.
- `node scripts/verify-vpi-vertical-adapters.mjs` executes both actual source
  functions for **10 profiles each**, checks evidence states, finite JSON values,
  equality of adapted geometry and **21 expected refusals**. It records source
  hashes, restores the temporary TS/path loaders in `finally`, and confirms no
  database or persistence client was loaded. No account or service is modified.
- `python scripts/verify-vpi-vertical-adapters.py` independently reconstructs
  station sets, elevations, percent grades, tangent offsets and K using
  60-digit Decimal arithmetic. **2,148 station results pass** across both
  adapters, including dense, coarse, zero/negative-level, signed-station, equal,
  small-grade-change and explicitly supplied steep/short geometry. This is
  numerical verification, not a survey tolerance or standards adoption.
- Native and Decimal receipts, red/green tests and check logs are retained in
  `.cache/vpi-vertical-adapters/`.
- All **70 engine CLI checks**, full working-tree app/test TypeScript, scoped
  lint, script syntax and diff-whitespace checks pass. The security gate passes
  with **119 applied migration hashes pinned**. The shared road engine, BVC
  helper, current vertical UI and explicit curve API have no source changes in
  this checkpoint.
- Read-only `npm run docker:verify` passed the single production application and
  required service health after host-access retry. The last backup remains
  `2026-10-23T10:25:43Z`, archive/header evidence only. No build, service lifecycle,
  production promotion, migration, real account or survey record changed.

No fresh browser/mobile or live authenticated workflow was exercised for this
library repair. The separate scalar `/api/engineering/compute/vertical-curve`
and `engine/engineering.ts` evaluator, the survey vertical designer's criteria,
remaining legacy circular/safety functions, project/revision-bound outputs and
the broader security, worker, recovery, payment, offline/device and professional/
field gates remain review or acceptance targets. Unrelated work in the checkout
is preserved outside this scoped commit.
