# Online Coordinate Transformation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the online calculator's duplicate datum mathematics with explicit registered references, shared-authority results and honest operation evidence.

**Architecture:** A shared online contract validates envelopes separately from semantic reference/measurement admission. One online service resolves references, identifies an admissible configured horizontal path and calls `src/lib/geo/transform.ts`; single/batch APIs and the actual online page consume it. A focused UI component owns input revision and pending-request lifetime.

**Tech Stack:** TypeScript, Zod, existing proj4 CRS authority, Next.js handlers, React, Jest and CUA. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-21-online-coordinate-transform-design.md` (explicitly approved).

## Global Constraints

- Optional `elevation` accepts a finite number, null, or omission.
- Result metadata always states `horizontalOnly: true`, `verticalTreatment: 'preserved-untransformed'`.
- Preserve existing authentication and rate limits (single:120/minute; batch:10/minute).
- Batch accepts 1..1000 rows and one common explicit source/target pair.
- No coordinate mathematics online except calls to the existing shared adapter.
- Preserve the current checkout, concurrent edits, customer data, CAD drawing and deployed services. No worktree, container, migration, package upgrade or promotion.
- Unknown datum paths, display-only systems and grid dependencies fail closed.
- Never infer a grid from latitude/longitude or call numeric display resolution accuracy.

Ruling: execute sequentially in this checkout because the service, schemas and mounted UI change one shared contract; preserve concurrent files outside the allowlist. The user's checkout preservation rule overrides a skill's generic worktree setup. No new chat or subagent is required for these tightly coupled tasks.

Ruling: redundant `zone`/`hemisphere` hints describe the **source input pair**. Validate them against the resolved source CRS; reject hints on a geographic source. They cannot select or override a target grid. This resolves the spec's redundant-input wording without adding a second selector family.

## Task 1: Online reference/measurement contract and shared-engine service

**Files:** create `src/lib/online/coordinateContract.ts`, `src/lib/online/coordinateOperation.ts`, `src/lib/online/coordinates.test.ts`; replace `src/lib/online/coordinates.ts`. Read the unchanged shared adapter and registry.

**Interfaces:**

```ts
type OnlineRequest = Record<string, unknown>
type OnlineErrorCode = 'INVALID_COORDINATE' | 'CRS_REQUIRED' | 'CRS_AMBIGUOUS' | 'CRS_REJECTED' | 'OPERATION_UNAVAILABLE' | 'TRANSFORM_FAILED'
// Discriminated result: success supplies result, source/target and operation;
// failure supplies only success:false, code and error.
transformOnlineCoordinates(request: OnlineRequest): Promise<TransformResult>
transformCoordinates(input: CoordinateInput, fromSystem: string, toSystem: string): Promise<TransformResult>
getSupportedSystems(): OnlineReference[]
// Envelope schemas retain semantic fields for the service; batch rows stay unknown.
```

- [x] Write regressions against the current exported helper for empty identities, unknown identities, invalid geographic bounds, explicit zero northing, ambiguous guessed grids and unsupported regional identities. Execute them and retain the actual red output.

```ts
expect(await transformCoordinates({}, 'UTM', 'UTM')).toMatchObject({success:false})
expect(await transformCoordinates({longitude:0,latitude:91}, 'WGS84', 'WGS84')).toMatchObject({success:false})
```

- [x] Add the new explicit service tests using real shared authority/proj4: both hemispheres, distinct source/target grids, canonical codes, identities, wrong horizontal pairs, source hints, zero/null/omitted heights and no unsupported precision property.

```ts
const result = await transformOnlineCoordinates({fromCRS:'EPSG:32637',toCRS:'EPSG:4326',easting:500000,northing:0,elevation:null})
expect(result).toMatchObject({success:true,result:{longitude:39,latitude:0,elevation:null}})
```

- [x] Implement contract types and object-envelope schemas. Resolve both references with `assertSurveyCrs` and `getRegisteredCrsDefinition` before identity; reject mixed selector families. Discovery lists the actual survey-eligible registry, including all 120 generated UTM references, with explicit unavailable legacy datum guidance.
- [x] Implement operation admission in its own module: identity after CRS validation; nonidentity requires known WGS84 datum content or explicit finite 3/7-parameter `towgs84` with explicit ellipsoid content. Reject unresolved datum definitions and grid dependencies. Compare datum-definition content for projection classification; expose actual definitions, unknown accuracy/applicability and Arc translation caveat. Do not certify free-text registry notes.
- [x] Replace duplicate calculations with named-pair validation and one adapter call. Preserve optional height cases; verify output bounds/finiteness. Legacy adapter accepts only the spec's WGS84 identity and explicit-grid UTM inverse cases, adding a deprecation note.
- [x] Run focused service and existing shared-engine integrity/golden suites. Command: `node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/lib/online/coordinates.test.ts src/lib/geo/__tests__/transformIntegrity.test.ts src/lib/geo/__tests__/goldenRegression.test.ts`.
- [x] Record outcomes and commit only the service/contract/tests when their actual consumers have been adapted in Task 2/3; do not leave an untested old UI silently claiming success.

## Task 2: Authenticated APIs and indexed batch outcomes

**Files:** modify `src/app/api/coordinates/{transform,batch}/route.ts`; create `src/app/api/coordinates/coordinateRoutes.test.ts`; modify `src/app/api-docs/page.tsx`.

**Interfaces:** consume `transformOnlineCoordinates`, shared envelope schemas and `getSupportedSystems`; produce single `success/result` plus references/operation, or HTTP422 semantic errors. Batch adds ordered `{index,source,id?,name?,...outcome}` rows and exact counts.

- [x] Add handler regressions using the real online service, an isolated `apiHandler` boundary and synthetic requests. Verify options still require auth and exact rate limits; malformed envelopes fail400 and semantic errors fail422. Do not call wrapper mocks ordinary-account HTTP proof.

```ts
const response = await POST(new NextRequest('http://127.0.0.1/api/coordinates/transform', {method:'POST',body:JSON.stringify({fromCRS:'EPSG:4326',toCRS:'EPSG:4326',longitude:0,latitude:91})}))
expect(response.status).toBe(422)
```

- [x] Add mixed/all-failure batches, non-object rows, repeated/missing caller IDs, null/fractional heights, source retention, row order, invalid common references, 1/1000 boundaries and 1001 rejection. A row's selector cannot override the common pair.
- [x] Replace single schema/handler with the contract and shared service. Map semantic failure to422; preserve existing wrapper auth/rate handling.
- [x] Resolve common batch references before rows; reject legacy UTM batches rather than infer one pair from a row. Call the same service per row with internal indexed identity. Preserve source rows and caller ID/name as submitted; no invented caller IDs.
- [x] Correct discovery/documentation to maxPoints1000; describe explicit codes, unknown accuracy, preserved heights,422 errors and legacy transition.
- [x] Run the new API suite plus Task 1 suites. Verify source/contract changes have not weakened the shared engine's all-or-nothing batch behavior.

## Task 3: Mounted online UI, request lifetime and final acceptance

**Files:** create `src/components/online/OnlineCoordinateTransform.tsx` and its test; modify `src/app/online/page.tsx`; add a mounted-page transform test. Preserve the unrelated older `CoordinateTransformer.tsx` unless a real caller requires a compatibility change.

**Interfaces:** the new component consumes discovery metadata and `transformOnlineCoordinates`. It starts with source EPSG:4326, target empty, blank measurements and optional unchanged height. The page mounts it only in the actual transform tab.

- [x] Add component regressions for labels/units, empty target, blank versus zero, every measurement/reference edit, delayed success/error, duplicate click, edited pending settlement followed by rerun, unmount and tab switching. Use deferred service promises for timing while keeping real service numerical tests separate.

```ts
fireEvent.change(screen.getByLabelText('Longitude (degrees)'), {target:{value:'0'}})
// After a valid result, editing latitude must remove it immediately.
expect(screen.queryByText('Transformation successful')).not.toBeInTheDocument()
```

- [x] Implement separate revision and pending-request refs. Invalidate displayed output on every edit; allow edits while pending but keep one pending ownership lock until its own settlement. Suppress stale success/error/finally and unmounted callbacks. Clear incompatible fields when source type changes.
- [x] Render only the named target pair, including zero; show reference code/name/units, operation kind/definitions, unknown accuracy/applicability, unchanged height and regional caveat. Keep live-region error/status semantics and keyboard labels.
- [x] Replace only the actual page's old transform state/handler/markup with the new component. Remove no unrelated GNSS, EDM, benchmark or imagery functionality. Test the actual page tab mounts the new selectors and unmount invalidates pending results.
- [x] Run focused service/API/component/page suites, strict app/test typing, scoped lint, security and whitespace checks. Compare the Arc fixture with the pinned independent native result from the audit, explicitly as numerical consistency rather than field accuracy.
- [x] Use the existing source preview and CUA on127.0.0.1 for explicit grid/zero/error/edit-after-result acceptance; do not change browser storage or CAD data. Record any authenticated API/device gap separately; do not re-enable a cleaned-up QA account silently.
- [x] Update the online audit/readiness record with exact source evidence and blockers. Commit scoped files only after inspecting concurrent changes; no push/deployment without the established release gates.

## Execution ledger

- Written specification approved by the human on22 October2026; plan self-review covers each spec section above.
- Tasks1-3: source implementation and focused verification complete. CUA verified explicit grid, measured zero, edit invalidation and invalid latitude. Authenticated HTTP, production promotion, operation applicability and field acceptance remain open; see docs/ONLINE_TRANSFORM_REPAIR_2026-10-23.md. Commits are scoped to this plan and exclude concurrent work.
