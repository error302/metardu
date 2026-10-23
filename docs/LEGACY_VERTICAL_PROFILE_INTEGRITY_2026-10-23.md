# BVC-anchored vertical profile integrity — 23 October 2026

The exported `src/lib/engine/curves.ts::verticalCurve(g1, g2, L, startRL,
interval = 10)` helper now delegates to the reviewed shared parabolic engine.
This supersedes the unchanged-helper limitation recorded in the circular plan
checkpoint; it does not validate other legacy vertical/safety implementations.

## Defect and corrected contract

The former offset used `A*x*x/(2*L)` although grades were percentages. For
`g1=2`, `g2=-2`, `L=200`, `startRL=100`, the old midpoint RL was **2 m**;
the correct crest RL is **101 m**, returning to **100 m** at the end. Its
stationary-point sign was also reversed, creating false points on some monotone
profiles and missing genuine extrema. Non-divisible sampling omitted EVC, and
zero/tiny intervals or infinite length could produce unbounded allocation.

The repaired adapter retains its positional signature and output keys:

- Grades are percent; length, local chainage, RL and tangent offset are metres.
  The supplied start RL is BVC, and local BVC station is zero.
- The shared engine owns `RL = BVC_RL + g1*x/100 + A*x*x/(200*L)`, stationary
  point selection, exact endpoints, unique regular pegs and bounded sampling.
  The ten-metre default remains; endpoint and stationary rows can increase the
  output count. The shared conservative 10,000-row limit applies.
- Geometry is first computed about BVC RL zero and translated once by the
  supplied start RL. Deriving a VPI from that start RL and subtracting it again
  can erase a small valid anchor; the adapter avoids that cancellation.
- Invalid/nonfinite inputs, unresolvable geometry, excessive sampling,
  translated overflow and a nonflat profile entirely lost at the supplied
  elevation resolution throw instead of returning NaN, an empty schedule or
  misleading constant levels. A truly flat profile can retain a large level.
- The legacy `cutFill` key remains for compatibility and means **signed vertical
  offset from the incoming tangent**. It is not earthwork cut/fill: there is no
  measured ground profile, section, project datum or standards assessment.

Repository tracing found the helper exported through `engine/index.ts` and
directly exercised by engine tests. The current curves-page calculator and
explicit vertical API already import the shared road engine. This repair does
not change those UI/API contracts or establish a newly tested browser workflow.
The separate `engineering/compute.ts` and `engineering/curves.ts` legacy
implementations remain review targets, including guessed SSD, rounding and
missing endpoint/equal-grade handling.

## Verification and boundaries

- The first bounded regression run recorded **19 failures / 1 pass** against the
  former implementation. Unbounded inputs were deliberately excluded from that
  red run; they are tested after the bounded adapter is installed.
- **107 focused tests across six suites pass**, covering analytic crest/sag,
  monotone/equal grades, off-interval endpoints, unique extrema, zero/negative/
  tiny anchors, sampling limits, overflow and the shared engine/UI regressions.
  The former crest test's misleading title and finite-only assertion now check
  the actual midpoint and endpoint levels.
- `node scripts/verify-legacy-vertical-profile.mjs` runs the actual source through
  a temporary TypeScript loader restored in `finally`. It captures source hashes
  and writes running/passed/failed receipts. It checks **12 profiles and 11
  refusals** without a database, account, listener, environment or network.
- `python scripts/verify-legacy-vertical-profile.py` independently recomputes
  station sets, parabolic offsets and RLs using 60-digit Decimal arithmetic.
  All **1,076 stations** pass; the exact supplied starting level is checked
  separately. These are numerical checks, not field accuracy or datum proof.
- Existing engine CLI checks: **70 pass**. Logs and native/Decimal receipts are
  in `.cache/legacy-vertical-profile/`.
- Full working-tree application/test TypeScript, scoped lint, diff whitespace
  and the security gate pass. The security gate confirms 119 applied migration
  hashes remain pinned. Concurrent unrelated source changes are excluded from
  this scoped repair.
- Read-only `npm run docker:verify` passed one application and required service
  health after retrying host access. The backup run remains
  `2026-10-23T10:25:43Z`, archive/header evidence only. No runtime lifecycle,
  production promotion, migration, customer account or survey record changed.

Fresh browser/mobile acceptance remains unavailable while local browser use is
disabled. Project/revision-bound deliverables, remaining legacy helpers,
production worker compatibility, signing-key rotation, restore recovery and
ordinary-account/offline/device/professional/field gates remain open. This is a
source calculation milestone, not overall platform acceptance.
