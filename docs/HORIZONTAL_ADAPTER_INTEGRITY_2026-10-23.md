# Horizontal scalar/set-out adapter integrity — 23 October 2026

The separate horizontal scalar API, project road helper and remaining legacy
simple-curve schedule now share the reviewed horizontal authority. This closes
the reviewed scalar/simple-adapter gaps, while retaining separate criteria,
project delivery and production/field acceptance gates.

## Verified defects and repair

`engineering/curves.ts::simpleCircularCurve` formerly subtracted cumulative
PC-to-peg chord lengths to report its `chordIncrement`. That difference is not
the actual chord between two pegs. It also omitted PC, rounded engine results,
and used an unbounded `peg += 20` loop that could fail to advance at large
stations. The existing PC + arc length stationing itself was correct; this
repair preserves it. The first bounded source regression run reproduced
**11 failing tests**; potentially unbounded old-loop cases were excluded until
the bounded sampler replaced it.

The scalar helper had no input/derived-geometry validation and used cancellation-
prone `1-cos` expressions. The separate scalar API checked only undefined
fields, allowing nulls, strings and other invalid geometry to reach arithmetic.
After the shared guard was introduced, the unguarded road form could throw
before reporting its invalid draft. API/UI red tests reproduced **15 failures
and three passing controls** before those boundaries were repaired.

- A shared `horizontalCurveInputFromDecimal` performs explicit numeric/domain
  conversion. The scalar, legacy simple schedule, earlier compute adapter and
  engine curve helpers use the same conversion and reviewed geometry.
- The legacy schedule now uses bounded global arc-station pegs, exact PC/PT,
  full numeric precision and actual successive-peg chords. The optional interval
  defaults to the historical 20 m sampling convention. It is not a design
  criterion or a ground distance. The 10,000-row guard applies.
- `chordFromTC` remains cumulative PC-to-peg chord; `chordIncrement` is the
  actual previous-peg chord. Deflections remain cumulative decimal degrees
  relative to the PC tangent. `chainage_CC` remains an arc-midpoint station,
  not circle-centre coordinates. Exact endpoints can increase output row count.
- Scalar and legacy simple results explicitly carry `standardCompliance:
  NOT_ASSESSED` and `coordinateReferenceStatus: NOT_VERIFIED`. The scalar
  result's historic numeric fields are retained with additive evidence metadata.
- The shared engine now enforces the same station-resolution bound as its
  sampler, so elements cannot accept stationing that set-out must refuse. Its
  arc/chord/mid-ordinate products are ordered to avoid unnecessary intermediate
  overflow while retaining stable small-angle offset formulas. A representable
  numerical stress curve can remain finite; true overflow still fails closed.
- The scalar API has strict finite numeric validation, version-2 units/evidence,
  private/no-store geometry/error responses and explicit 400 numerical refusals.
  Existing common-wrapper authentication/rate/schema handling remains intact.
- The legacy road form catches geometry errors before retaining a draft,
  preserves editable input and supports correction. Its current-page-only
  warning, local nonnegative-entry policy and overlap check remain. Geometry
  alone is visibly distinct from verified standards or coordinate reference.

**Intentional compatibility changes:** formerly coerced/undeclared API fields
are refused; unrepresentable geometry fails earlier; legacy schedules gain PC
and exact PT, correct chord increments and remove intermediate rounding. Last-
bit numerical differences can arise from algebraically equivalent stable
products. Existing names and valid positive unsigned-angle geometry remain;
signed PI stations are supported by the scalar/library contracts. The API does
not infer turn direction, CRS, control, criteria or saved project approval.

## Verification and boundaries

- **133 focused tests in nine suites pass**, covering both scalar/legacy
  adapters, common API wrapper with inert external boundaries, road-form retry,
  shared set-out, plan geometry, project transition integration, existing compute
  and curve APIs and the current horizontal calculator. The final 17 scalar
  API tests also pass after changing a rejected-CRS test fixture to avoid a
  prohibited hardcoded CRS literal. No lint rule was bypassed.
- `node scripts/verify-horizontal-adapters.mjs` runs actual source scalar API /
  common middleware and compares the legacy table with engine stake-out output.
  **Seven profiles, 12 API refusals and three wrapper controls pass**, along
  with five direct unsafe-interval refusals. Session, rate and context boundaries
  are synthetic; no real account/listener/database is created. The real DB
  remains unloaded, zero DB calls are recorded, loaders are restored in `finally`
  and source hashes/running/failure receipts are retained.
- `python scripts/verify-horizontal-adapters.py` independently computes sine,
  cosine, tangents and all **130 set-out stations** with 80-digit Decimal Taylor
  series. It checks geometry, exact station sets, cumulative/previous-peg chords
  and decimal deflections, including dense/coarse, signed/fractional station,
  small-angle and representable large-number stress profiles. Station roundoff
  accounts for operand-scale cancellation near zero CC; this is numerical
  verification, not a survey tolerance or physical road acceptance.
- Existing plan draft readers pass **seven CSV/PDF pairs, 118 printed set-out
  stations and ten PDF pages** after regeneration. Existing independent CAD
  checks pass **64 checks across six DXFs**, including retained earlier browser
  downloads. Retained files do not establish a fresh browser download.
- The scalar vertical native/Decimal probe also passes eight profiles and 64
  curve/tangent samples after these shared-module changes.
- All **70 engine CLI checks**, full working-tree app/test TypeScript, scoped
  lint, script syntax and security checks pass. The security gate confirms
  **119 applied migration hashes** remain pinned.
- An actual anonymous POST to the existing source preview at
  `127.0.0.1:3021/api/engineering/compute/horizontal-curve` returns **401**.
  Successful authenticated geometry remains source/synthetic-boundary proof.
- Read-only `npm run docker:verify` passed one application and required service
  health after host-access retry. Backup remains `2026-10-23T10:25:43Z`, archive/
  header evidence only. No production lifecycle, build/promotion, migration,
  real account or survey record changed. Unrelated concurrent work is excluded.

Receipts/logs are in `.cache/horizontal-adapter-integrity/` and the existing
plan, road-quick-compute and vertical evidence folders. Fresh browser/mobile,
signed-in HTTP, saved revision/CRS-bound delivery, remaining safety/designer
criteria, worker compatibility, key rotation, restore/recovery, payment and
offline/device/professional/field acceptance remain open. The platform goal
remains active.
