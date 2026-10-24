# Legacy banking adapter integrity — 24 October 2026

The two remaining superelevation implementations in `engineering/compute.ts`
and `engineering/volume.ts` no longer calculate from assumed criteria. The
compute entry point and both volume entry points use the existing
`roadSafetyCriteria.superelevationDesign` authority after strict validation.

## Defect and resulting contract

The former compute adapter used `V²/(225R) - 0.01`, capped its result at an
assumed maximum, selected a 30 m transition floor and returned a rounded table
with an invented `both` rotation axis. The volume adapter repeated that equation
and returned `BVC = 0`, `EVC`, spiral parameters and runout without an alignment,
rotation width, initial crossfall or adopted criteria. Neither implementation
established the national/manual claims made in its comments.

Repository caller searches found only the old compute tests, with no active
application, API or script consumers of these three entry points. The existing
banking UI and draft CAD exporter already use the declared-criteria authority.

This is an intentional breaking internal contract:

- Supply `designSpeed` (km/h), `radius` (m), `numLanes` actually rotated,
  `laneWidth` (m), signed `initialCrossfall` and `providedSuperelevation` ratios.
- Supply a criteria reference/revision, lateral friction, maximum banking ratio
  and maximum relative gradient. There are no defaults or numeric coercions.
- Legacy `R`, `V`, `eMax`, `transitionLength` and unknown request/criteria fields
  are rejected. Invalid geometry, missing evidence and numerical overflow fail.
- `designE` is the entered slope ratio, including an over-limit value. It is
  never capped or converted to a percentage. Full precision is retained.
- `transitionLength` describes crossfall rotation about the supplied width:
  `rotatedWidth × abs(finalCrossfall - initialCrossfall) / relativeGradient`.
  It can legitimately be zero when the crossfall is unchanged. It does not
  establish spiral geometry, absolute stationing, runoff/runout stages or a
  complete cross-section arrangement.
- Return explicit limit and lateral-demand comparisons, criteria provenance and
  `standardCompliance: NOT_ASSESSED`. No artificial station table, BVC/EVC or
  spiral values are returned. Historical volume result type names alias this
  shared result instead of preserving the fabricated fields.

For a synthetic example at 80 km/h, radius 200 m, 7 m rotated width, initial
crossfall -2.5%, provided banking 9%, friction 0.15, maximum banking 7% and
relative gradient 0.5%, the result retains 9%, computes about 161 m rotation
length, and fails both declared limit and lateral demand checks. It does not
claim this is an adopted or approved design.

## Verification evidence

The new regression suite first produced 34 failing checks and 11 passing
controls against the original implementations. The revised adapters pass the
45-case suite across all three entry points. Together with existing compute,
declared safety and banking/sight-distance UI tests, 124 focused tests pass.

`node scripts/verify-legacy-superelevation.mjs` exercises actual source modules
outside Jest, records source hashes and six numerical fixtures, checks the three
entry points agree and verifies 90 invalid requests are refused. It restores its
temporary TypeScript/path loaders and confirms no database module was loaded.
`python scripts/verify-legacy-superelevation.py` independently recomputes 30
numeric quantities with 60-digit Decimal arithmetic and checks six assessment
outcomes and the absence of invented layout fields. The native report is in
`.cache/legacy-superelevation/source-probe.json`. These are synthetic fixtures.

Full application and test TypeScript checks, focused ESLint, all 70 CLI engine
checks and the security gate pass. The security gate observed 119 pinned applied
migrations, 692 test files and 3210 source files in this shared checkout. These
checks do not establish authenticated browser or field acceptance.

The existing production runtime verifier passed on 24 October: one application
container and its required support services; production HTTP/database/Redis
health passed. Backup completion at `2026-10-24T02:00:04Z` is archive/header
evidence only. No service was built, migrated, restarted or promoted here.

## Remaining acceptance work

This repair closes only the duplicate banking implementations. Legacy scalar
stopping/passing-distance helpers, radius defaults and heuristic widening in
`engineering/compute.ts` still require separate repair. Saved road design and
criteria revision loading into the export gate remains unimplemented.
Project alignment/rotation-axis binding, authenticated end-to-end export,
fresh browser acceptance, standards adoption, independent practising-engineer
review, production promotion and field acceptance remain separate gates.
The broader production/recovery/security blockers remain in the production
goal and credibility documents; this change does not clear them.
