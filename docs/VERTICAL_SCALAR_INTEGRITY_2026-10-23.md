# Scalar/project vertical profile integrity — 23 October 2026

The separate scalar vertical API, project road evaluator and legacy road-panel
draft entry now share the reviewed parabolic geometry authority. This closes
the scalar/evaluator review target recorded in the VPI-adapter checkpoint.
Production, project delivery and professional/field acceptance remain separate.

## Defects and source changes

The scalar constructor formerly checked only whether supplied values were
finite and length positive. Finite inputs could collapse BVC/VPI/EVC to the same
station or erase all grade-induced level changes; large products could create
nonfinite extrema. The evaluator could return Infinity on tangent extensions,
and a grade-only query did not validate the supplied level. Multiplying grade
by length before dividing by 200 also overflowed for some otherwise
representable numerical profiles. API JSON serialization could conceal
nonfinite numbers as null; a shared validation failure would instead become an
undifferentiated 500. The road-panel form admitted drafts without checking the
full model before retaining and rendering them.

- `roadDesignEngine.verticalCurveGeometry` now contains the existing validated
  geometry, extrema and endpoint-identity authority without table allocation.
  The established schedule function builds its bounded pegs and dense display
  samples from this same model. It retains its public schedule/result contract.
- The model evaluates an in-curve station or offset, rejecting invalid queries.
  Tangent extensions require an explicit `allowTangents` request and use the
  correct endpoint/grade, rejecting nonfinite results. Truly flat tangents remain
  finite even at extreme finite query stations.
- `engine/engineering.ts` scalar construction and grade/elevation queries use
  that model. Its historical explicit tangent-extension behavior is retained;
  project-road coverage checks still refuse stations beyond the supplied design.
  Queries reconstruct from current source parameters rather than trusting stale
  derived metadata. The incorrect module-wide SRID 21037 assertion is removed.
- Computed scalar results add actual PVC/PVT stations and levels, explicit
  crest/sag/straight type, nullable equal-grade K, unassessed standards and
  unverified vertical-datum status. An interior high/low point retains the
  historical shape; an endpoint stationary point does not invent an interior one.
- The scalar API preserves its request names, declares contract version 2 and
  units, rejects undeclared fields and maps numerical refusal to 400 /
  `INVALID_VERTICAL_GEOMETRY`. Successful geometry and numerical-error responses
  are private/no-store. The actual common wrapper continues to handle required
  authentication, configured rate limits, schema errors and malformed JSON.
- The legacy road panel validates before appending a vertical draft, presents
  its error while retaining editable input, and recovers after correction. It
  displays computed PVC/PVT and the geometry-only/unverified-level distinction.
  Its existing current-page-only storage warning and local entry restrictions
  remain; this does not add saved project delivery or design approval.

These changes intentionally refuse formerly accepted but unrepresentable
numerical inputs. Scalar API unknown-field stripping is replaced by strict
validation. Existing valid parameter names remain supported; endpoint/evidence
fields are additive. `ENGINEERING_CURVE_API.md` records the complete boundary.

## Evidence

- The initial scalar regressions reproduced eight failures and one passing flat
  tangent control. The first UI attempt used the wrong accessible tab name;
  after correcting that test, a separate red run reproduced the actual render
  failure when validation began rejecting the retained draft. The form repair
  then prevents that invalid state. The API red run recorded nine failures and
  four controls passing against its former handler.
- **171 focused tests in ten suites pass**, covering scalar/model guards,
  actual wrapper/handler behavior with external dependencies mocked, road-panel
  correction/retry, project vertical alignment and coverage, shared schedules,
  both earlier adapters, current calculator and explicit curve API regressions.
- `node scripts/verify-vertical-scalar.mjs` exercises the actual source handler,
  common API wrapper and scalar engine with synthetic session/rate/context
  boundaries. **Eight profiles, eight invalid-input refusals and three wrapper
  controls** pass. No real account, listener or database is created; the real
  DB module remains unloaded and the guarded adapter records zero DB calls.
  Temporary loaders are restored in `finally`, with source hashes and explicit
  running/passed/failed receipts.
- `python scripts/verify-vertical-scalar.py` independently verifies actual API
  endpoints, K/extrema and **64 curve/tangent samples** with 80-digit Decimal.
  It covers sag, crest, equal, flat, monotone, endpoint-stationary, fractional and
  representable large-number geometry. Those numerical stress inputs are not
  physical road designs or adopted field tolerances.
- Independent rechecks pass the earlier BVC helper (**1,076 stations / 12
  profiles / 11 refusals**) and VPI adapters (**2,148 station results / ten
  profiles each / 21 refusals**). The shared-model extraction does not bypass
  those existing resource/precision guards.
- Original vertical draft readers pass **six CSV/PDF pairs, 241 rows and 11 PDF
  pages**, including retained earlier browser downloads. All five newly generated
  source CSV hashes match their pre-extraction fixture hashes. This verifies
  retained files and source compatibility; it is not a fresh browser download.
- All **70 engine CLI checks** and the security gate pass, including 119 pinned
  applied migration hashes. Full working-tree app/test TypeScript passes.
  Scoped lint passes after correcting a response-typing issue in the new test;
  its 13 API checks and test TypeScript also pass the final rerun. Script syntax
  and diff-whitespace checks pass.
- An actual anonymous POST to the existing `127.0.0.1:3021` source preview
  returns **401**, after retrying denied sandbox socket access on the host.
  Successful authenticated geometry remains source/synthetic-wrapper proof.
- Read-only `npm run docker:verify` passed the one-app inventory and required
  service health after host-access retry. Backup completion remains
  `2026-10-23T10:25:43Z`, archive/header evidence only. No production lifecycle,
  build/promotion, migration, real account or survey record changed.

Receipts/logs are in `.cache/vertical-scalar-integrity/` and the existing
vertical adapter/export evidence folders. No fresh CUA/mobile, signed-in HTTP,
device or field workflow is claimed. Remaining legacy circular/safety and survey
designer criteria, saved project/revision deliverables, worker compatibility,
key rotation, recovery, payment and release/offline/field gates remain open.
Concurrent unrelated checkout work is preserved outside this scoped repair.
