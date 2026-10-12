# SurveyMapEngine — Extraction Plan

- **Source**: `METARDU_WEB_PROFESSIONAL_SURVEY_BLUEPRINT.md` §12.4 (shared map engine), §12.5 (accuracy), §40 Sprint A backlog ("SurveyMapEngine extraction plan")
- **Status**: Phases 0–5 implemented and verified; the plan is complete. Final Phase 5
  verification: `tsc` 0; full jest 247/249 suites green (3250 tests) — the one failure
  (`src/lib/workspaces/__tests__/stageRegistry.test.ts`) is concurrent user WIP in
  untracked files (`stageRegistry.ts` workspace routing), unrelated to the engine;
  lint clean on every touched file except the long-standing pre-existing
  `MapClient.tsx` unused-var (`setStakeoutRadarTarget`). Phase 4 verification: full
  jest green (240 suites / 3181 tests incl. `phase4Wiring`); targeted suites green; lint
  clean on touched files. Note: `spatialIndex.test.ts` occasionally flakes on timing under
  full-suite parallel load (passes standalone and on rerun).
- **Date**: 2026-09-30

## 1. Why

Three map surfaces re-implement the same capabilities (projection, measurement, selection,
snapping, point loading, stakeout, export, print) with three different quality levels:

- `/map` is CRS-authority-correct (measurement via `measureMath` → `@/lib/spatial/projectCrs`).
- `/project/[id]/map` measures directly in EPSG:3857 (defect F1 below).
- `/project/[id]` workspace map silently defaults to `EPSG:21037` (defect F3).

Until the surfaces share one engine, every accuracy fix must be applied three times and the
blueprint rule "one math path / no silent CRS defaults / fail closed on undeclared CRS"
cannot be guaranteed. Extraction is the mechanism that makes those rules structural.

## 2. Current state

### 2.1 Surfaces

| Route | Entry | Size | Stack | Measurement path | CRS handling |
|---|---|---|---|---|---|
| `/map` | `src/app/map/MapClient.tsx` | 1464 L + `hooks/useMapInteractions.ts` (1078 L), `hooks/useMapInit.ts` (559 L) | OpenLayers, `MapReactContext` (218 L) + `MapSubContexts` (176 L) | **Authority path**: `src/app/map/utils/measureMath.ts` → `fromDisplay` + `surveyDistance/Area/Bearing` | Parameterized; status bar, PRS-backed |
| `/project/[id]/map` | `src/components/map/SurveyMap.tsx` (346 L), dynamic import from `map/page.tsx` | + `MeasurementTool.tsx`, `useSubdivision.ts` | OpenLayers, view `SRID_3857` (`SurveyMap.tsx:204`) | **Broken path**: `src/hooks/useMeasurement.ts` → `src/lib/map/measurements.ts` planar math on raw view coords | `epsg` prop exists; some flows still call hard-coded `to21037` (`SurveyMap.tsx:220,234`) |
| `/project/[id]` workspace | `src/components/workspace/WorkspaceMap.tsx` (426 L) | — | OpenLayers, view `EPSG:3857` | ad hoc | **Silent default** `epsg = 'EPSG:21037'` (`WorkspaceMap.tsx:71`); raw `proj.transform` |
| `/field/map` | `src/app/field/map/page.tsx` (547 L) + `src/components/field/MapViewer.tsx` (311 L) | — | Non-OL offline stack (KML/KMZ, MBTiles, GeoPDF) | none (display-only) | N/A offline |

Other consumers that must eventually ride the same engine: `BoundarySelectorMap.tsx`,
`SheetLayout.tsx`, `RegistryIndexMap.tsx`, `CutFillHeatMap.tsx`.

### 2.2 Engine-like assets already outside `src/app/map` (seed, not starting point)

`src/lib/map/`: `projection.ts` + `projectionConstants.ts` (proj4 registration, `autoDetectUtmZone`),
`measurements.ts`, `layers.ts`, `basemaps.ts`, `schemeLayer.ts`, `traverseLayer.ts`,
`projectPointsLayer.ts`, `subdivisionLayer.ts`, `webglPointsLayer.ts`, `vectorTileFactory.ts`,
`cadastralStyles.ts`, `enhancedStyles.ts`, `gridOverlay.ts`, `annotations.ts`,
`editingTools.ts`, `cadastralEditing.ts`, `stakeout.ts`, `stakeoutVoice.ts`,
`deedPlanExport.ts`, `nativeProjectionView.ts`, `turfHelpers.ts`, `olTypes.ts`.
Plus: `src/lib/spatial/projectCrs.ts` (CRS authority — the only legal measurement backend),
`src/lib/validation/mapExtent.ts` (shared extent schema), `src/hooks/usePrint.ts`,
`src/lib/export/exportMapPDF.ts`.

### 2.3 Findings (survey evidence)

| ID | Sev | Finding |
|---|---|---|
| **F1** | **P0** | `useMeasurement.ts:216-221` takes `evt.coordinate` (view projection **EPSG:3857**) as `{easting, northing}` and feeds planar `calculateDistance/area/bearing` documented as "SRID 21037" math. Distances inflated by sec(latitude) (≈0.03 % Nairobi → 0.25 % Mombasa), areas by sec², bearings are Mercator-plane not grid, and coordinate mode reports Web-Mercator E/N as if it were grid. Rendered by `MeasurementTool` inside `SurveyMap.tsx:353`. (Correction: `useSubdivision.ts` does not use this hook — it only mirrors its patterns; its hard-coded-zone math is tracked under F4.) Direct violation of blueprint §12.5 ("Not direct Web Mercator geometry length/area"). |
| **F2** | P1 | Two measurement implementations: `src/app/map/utils/measureMath.ts` (authority path, per §12.5) vs `src/lib/map/measurements.ts` (CRS-less planar, docstring hard-assumes 21037). One-math-path rule broken. |
| **F3** | P1 | `WorkspaceMap.tsx:71` — `epsg = 'EPSG:21037'` default parameter: silent CRS default, banned by blueprint §2.4/§4.2; wrong zone if project is 36S/326xx. |
| **F4** | P1 | `projection.ts` — `to3857`/`arrayTo3857` default `fromSrid = SRID_21037` (silent zone-37 assumption); `to21037` hard-codes target `SRID_21037` regardless of the project's declared zone (`SurveyMap.tsx:220,234`, `SheetLayout.tsx`, `useVertexEditing.ts`, `pushToTraverse.ts`). `drawAnnotations.ts:90` already does it right (`transform(to3857, 'EPSG:3857', epsg)`). |
| **F5** | P2 | Server-side geometry imports `SRID_21037` as an implicit working CRS: `api/boundary-monuments`, `api/corridor-networks`, `api/export/nlims`, `lib/map/traverseToParcel.ts`, `lib/pdf/locationPlanInset.ts`, `lib/gnss/datumTransformer.ts`. Needs audit against project CRS (deferred; import CRS guard covers ingestion, not these writers). |
| **F6** | P2 | Coordinate formatting duplicated (`lib/geodesy/coordinates.ts`, `lib/gnss/coordinates.ts`, `lib/online/coordinates.ts`, `lib/solution/format.ts`, map status bar, IdentifyPanel, coordSearch) — the blueprint's unchecked "coordinate-format service". |
| **F7** | info | No `SurveyMapEngine` string exists anywhere in the repo today; extraction starts from zero, seeding from `src/lib/map` + `src/app/map/utils`. |

## 3. Target architecture

### 3.1 Layout

```text
src/lib/surveyMapEngine/
  core/                 # zero React, zero OpenLayers imports — usable by /field/map too
    projection.ts       # facade over projectCrs + registerProjections (F4: explicit CRS args only)
    format.ts           # THE coordinate-format service (F6): grid/latlon/DMS, single implementation
    measure.ts          # promoted measureMath semantics (F2): (displayGeom, crs) -> survey result
    extent.ts           # wraps @/lib/validation/mapExtent
    types.ts            # CrsRef, GridPoint, DisplayPoint, MeasurementResult, LayerDescriptor
  ol/                   # OpenLayers adapters (the only files allowed to import 'ol/*' in engine)
    layers.ts           # adopts src/lib/map/{layers,schemeLayer,traverseLayer,...}
    selection.ts        # unified selection store (was: MapClient context + SurveyMap + WorkspaceMap)
    snapping.ts         # was: SnappingOptions + useVertexEditing snap logic
    drawing.ts          # was: drawAnnotations + editingTools + cadastralEditing
    pointLoading.ts     # was: projectPointsLayer + MapClient point loads
    stakeout.ts         # adopts src/lib/map/stakeout(.Voice).ts
    qaOverlays.ts       # InstantClosureFeedback, gridOverlay, workflow badge
  react/                # hooks + context built on core + ol (thin)
    useSurveyMapEngine.ts, SurveyMapEngineContext.tsx
  io/                   # export/print entry points delegating to existing generators
    exportSurface.ts    # -> deedPlanExport, exportMapPDF, gis exporters
    printSurface.ts     # -> usePrint / SheetLayout
```

Migration is **move-then-shim**: every relocated module leaves a re-export at its old path
until Phase 5, so no consumer breaks mid-flight.

### 3.2 Capability → module map (blueprint §12.4 list)

| §12.4 capability | Today | Target |
|---|---|---|
| projection | `lib/map/projection(.Constants).ts` + `spatial/projectCrs.ts` | `core/projection.ts` (authority wrapper; CRS arg mandatory) |
| coordinate formatting | scattered (F6) | `core/format.ts` |
| measurement | split (F1/F2) | `core/measure.ts` — only path, displays pass display geometry + project CRS |
| layers | `lib/map/*Layer.ts` per-surface wiring | `ol/layers.ts` + `LayerDescriptor` registry |
| selection | three ad hoc selections | `ol/selection.ts` store |
| snapping | `SnappingOptions.tsx` + `useVertexEditing` | `ol/snapping.ts` |
| drawing/editing | `drawAnnotations`, `editingTools`, `cadastralEditing` | `ol/drawing.ts` |
| point loading | `projectPointsLayer` + MapClient loads | `ol/pointLoading.ts` |
| stakeout | `lib/map/stakeout(.Voice).ts` (already shared) | `ol/stakeout.ts` |
| export | `deedPlanExport`, `exportMapPDF`, gis-export page | `io/exportSurface.ts` (delegates; no exporter hard-codes CRS — §4.2) |
| print | `usePrint`, `SheetLayout` | `io/printSurface.ts` |
| QA overlays | `InstantClosureFeedback`, `gridOverlay` | `ol/qaOverlays.ts` |

### 3.3 Hard contracts (from the blueprint — non-negotiable)

1. **Accuracy (§12.5)**: every displayed measurement runs
   `display geometry → fromDisplay(project CRS) → survey math (projectCrs) → result`.
   No length/area/bearing may be computed on EPSG:3857 coordinates. Enforced by
   characterization tests + an ESLint rule in the in-repo `eslint-plugin-metardu`
   (existing pattern: `no-placeholder-as-aria-label`) banning
   `calculateDistance/Area/Bearing` from `lib/map/measurements` outside the engine.
2. **CRS**: engine APIs take an explicit `CrsRef`. No default parameter, no
   `SRID_21037` fallback. Missing/undeclared CRS → measurement affordance disabled with
   UNVERIFIED badge (fail closed), never a silent default.
3. **One math path**: `src/lib/spatial/projectCrs.ts` remains the sole computational
   authority; engine never re-implements projections (registers proj4 only as an OL concern).
4. **EPSG:3857 is a display projection only** — never in survey math, never persisted as data.

## 4. Phases

Each phase ends with: `npx tsc --noEmit -p tsconfig.json`, `npx jest --no-colors`
(targeted suites first, full run before phase close), `npx next lint --file <touched>`.

### Phase 0 — accuracy fixes (no structure changes; do first)

- **F1**: give `useMeasurement` an explicit `crs` param; transform `evt.coordinate`
  3857→project CRS through `fromDisplay` (or store display coords and compute via the
  promoted `measure.ts` helpers) before math; coordinate mode formats through
  `core/format` + `reportCrs`. `MeasurementTool` receives `crs` from `SurveyMap`'s
  existing `epsg` prop (required prop; null → fail closed). `useSubdivision` does not
  use this hook — its hard-coded zone is handled under F4. When CRS is absent → render
  UNVERIFIED, disable measurement (fail closed).
- **F3**: remove `epsg = 'EPSG:21037'` default in `WorkspaceMap.tsx:71`; parent passes
  project CRS or measurement/transform UI shows UNVERIFIED.
- **F4 (minimal)**: remove `fromSrid` default values; update the ~6 callers to pass CRS
  explicitly; replace `to21037` in favor of `toProjectCrs(x, y, crs)`
  *(implemented as deletion, not a deprecated alias — no remaining references)*.
- **Tests**: new characterization suite asserting
  `MeasurementTool` distance on a fixed 3857 segment equals `measureMath` result for the
  same ground geometry within 1e-6 m; regression test that no `epsg` default remains.
- **Exit**: F1/F3/F4 closed; `/project/[id]/map` measurements agree with `/map`.

### Phase 1 — core extraction

- Create `core/` with `projection`, `format` (consolidating F6 duplicates behind one
  API with compatibility re-exports), `measure` (move `measureMath` here; make
  `lib/map/measurements.ts` a deprecated shim that throws in dev if called without CRS),
  `extent`.
- Re-point `/map` imports and `measureMath`'s old path to the new module (shim).
- **Exit**: zero behavior change; grep shows a single implementation of each function.
- **Implemented (Phase 1)**: `core/{types,projection,measure,format,extent}.ts` created;
  `measureMath.ts` is a re-export shim and `useMapInteractions` imports core;
  `lib/map/measurements.ts` is the deprecated shim (dev-throw on the CRS-less
  `calculateDistance/Bearing/Area` after `annotations.ts` was migrated to
  `survey*` with an explicit CRS; formatters moved to `core/format` with
  compat re-exports); `gnss.formatCoordinate` wraps `core.formatGridPoint`;
  `core/format` re-exports the single geodesy/projectCrs implementations.
  Note: `lib/map/stakeout.ts` keeps a distinct DMS-style formatter under the
  name `formatBearingWCB` (no quadrant letters) — Phase 4 rename candidate.
  Guarded by `surveyMapEngine/__tests__/{core,singleImplementation}.test.ts`.

### Phase 2 — layers + selection

- Extract `LayerDescriptor` registry and selection store; wire `/map` first
  (largest surface), then `SurveyMap`, then `WorkspaceMap`.
- **Exit**: selecting a point in any surface updates the same store shape; layer toggle
  logic no longer duplicated across contexts.
- **Implemented (Phase 2)**: `ol/selection.ts` — zustand store with a
  discriminated `Selection` union (none/feature/beacon/station) tagged by
  surface ('map' | 'project-map' | 'workspace') and surface-scoped
  `clearSelectionFrom`; `ol/layers.ts` — registry read
  (`describeMapLayers`, `findLayerByBasemapId`) + consolidated mutations
  (`switchBasemapById`, `applyOverlayOpacity`, `setLayerVisibleByLayerId`,
  `toggleLayerVisibleByBasemapId`); `core/types.ts` gained `LayerKind` +
  descriptor metadata. Wiring in plan order: MapClient mirrors
  `selectedFeature`/`featureName` (cleared on unmount), the project map page
  mirrors beacon clicks incl. the 5 s auto-dismiss, WorkspaceMap's OL Select
  and the workspace grid bridge write station selections; LayerControl,
  `useMapBasemaps`, `useMapInteractions` and WorkspaceMap basemap/opacity
  toggles now route through `ol/layers` (the three legacy switch loops and
  two opacity loops deleted; behaviour parity pinned by fake-layer tests,
  incl. LayerControl's opacity-while-hidden and restrict-to-id quirks).
  Also removed the dead `MapPageProps` interface surfaced by lint (leftover
  from the pre-existing `useParams` refactor of that page).
  Guarded by `surveyMapEngine/__tests__/{selection,layers,phase2Wiring}.test.ts`;
  `tests/map-field-navigation.test.tsx` (opacity characterization) passes
  unchanged.

### Phase 3 — snapping + drawing/editing

- Move snap logic (`SnappingOptions`, `useVertexEditing` snap portion,
  `editingTools`, `cadastralEditing`, `drawAnnotations`) into `ol/`.
- **Exit**: vertex edit on `/map` and `/project/[id]/map` share one code path; existing
  vertex-editing tests pass unchanged.
- **Implemented (Phase 3)**: `ol/snapping.ts` — config model (`SnapMode`,
  `SnapType`, `SNAP_TYPE_LABELS` from SnappingOptions), ring geometry helpers
  (`pointToSegmentDist`, `nearestPointOnSegment`, `vertexDist` + single
  `nearestVertexOnRing`/`nearestEdgeOnRing` implementations replacing the
  three inline handler loops in `useVertexEditing`), and
  `createSnapInteraction` (lazy `ol/interaction/Snap`, used by
  `useVertexEditing` and MapClient's scheme parcel/beacon snaps — bundle
  code-splitting unchanged). Drawing trio moved verbatim into `ol/`
  (`editingTools.ts`, `cadastralEditing.ts`, `drawAnnotations.ts`) behind
  pure re-export shims at the old paths, with `ol/drawing.ts` as the
  §3.1 entry barrel; MapClient's five `editingTools` calls and
  `useMapInteractions`' `drawAnnotations` call now import the engine path.
  Both surfaces already drove the one `useVertexEditing` hook — the shared
  path is now structural (single snap implementation in the engine).
  Guarded by `surveyMapEngine/__tests__/{snapping,phase3Wiring,singleImplementation}.test.ts`
  (the latter extended with 13 moved-symbol entries); existing
  `editingTools`/`cadastralEditing`/`digitizingHandlerContract`/
  `projectionCrsDefaults` tests pass unchanged.

### Phase 4 — point loading, stakeout, export, print, QA overlays

- Adopt existing `lib/map` modules into `ol/` (re-export shims), build
  `io/exportSurface` + `io/printSurface` delegating to current generators (GIS exporters
  already fail closed on undeclared CRS — keep that behavior in the surface).
- **Exit**: export/print entry points reachable from engine context on both surfaces.
- **Implemented (Phase 4)**: move-then-shim — `lib/map/stakeout.ts` → `ol/stakeout.ts`
  (formatter renamed `formatBearingWCB` → `formatBearingDmsInt` to disambiguate from
  `core/format`'s quadrant-letter WCB formatter and from
  `lib/spatial/projectCrs.formatBearingDms` (decimal-seconds DMS); the legacy path keeps
  `formatBearingWCB` as an alias re-export), `stakeoutVoice.ts` → `ol/stakeoutVoice.ts`,
  `projectPointsLayer.ts` → `ol/pointLoading.ts`, `gridOverlay.ts` → `ol/qaOverlays.ts`
  (rewired to `../core/projection`); QA overlay math extracted from
  `InstantClosureFeedback.tsx` into `ol/qaOverlays.ts` (`evaluateInstantClosure` +
  `closureGrade` — the React overlay now only renders). `io/exportSurface.ts` and
  `io/printSurface.ts` are thin delegation re-exports of the existing generators
  (deedPlanExport, exportMapPDF, GeoJSON/LandXML exporters keep their fail-closed CRS
  behavior) plus a lazy `loadSheetLayout()`; `react/SurveyMapEngineContext.tsx` +
  `react/useSurveyMapEngine.ts` expose export/print entries and both surfaces
  (`MapClient`, `SurveyMap`) mount `SurveyMapEngineProvider`. Guarded by
  `surveyMapEngine/__tests__/phase4Wiring.test.ts`; `singleImplementation.test.ts`
  extended with 11 moved-symbol entries; `projectionCrsDefaults.test.ts` gridOverlay
  guard re-pointed to the engine path; `map-field-navigation.test.tsx` mock re-pointed
  to `ol/stakeoutVoice`.

### Phase 5 — consumer rewiring + shim removal

- Thin `MapClient.tsx` toward a composition root (target ≤ ~600 L: wiring + layout only);
  `SurveyMap`/`WorkspaceMap` consume `useSurveyMapEngine`; `/field/map` adopts `core/`
  services only (stays non-OL, offline-first).
- Add `eslint-plugin-metardu` rules: `no-hardcoded-srid-default`,
  `no-web-mercator-measure` (as in §3.3), then delete all shims.
- **Exit**: banned-import greps clean; full jest + tsc + lint green; blueprint §40
  checkbox "SurveyMapEngine extraction plan" done and §12.4 refactor visibly underway.
- **Implemented (Phase 5)**: all nine legacy shims deleted
  (`utils/measureMath.ts`, `lib/map/measurements.ts`, `lib/map/{editingTools,
  cadastralEditing,stakeout,stakeoutVoice,projectPointsLayer,gridOverlay}.ts`,
  `utils/drawAnnotations.ts`) with every consumer re-pointed at the engine —
  tests included; the planar helpers that outlived the `measurements` shim
  (`calculateCentroid`, `calculateOffsetPoint`, `calculateBounds`,
  `calculateMidpoint`, `calculatePerimeter`, `planarDistance`, `pointInPolygon`,
  `snapToVertex`, `snapToLine`) moved into `core/measure.ts` and `annotations.ts`
  now imports `core/measure` + `core/types`. `eslint-plugin-metardu` gained
  `no-hardcoded-srid-default` (AssignmentPattern + `??`/`||` SRID fallbacks) and
  `no-web-mercator-measure` (survey math called with an `EPSG:3857` literal),
  registered globally as `warn` and escalated to `error` under
  `src/lib/surveyMapEngine/**`; the engine's remaining hardcoded CRS defaults
  (`stakeout.createStakeoutOverlay`, `stakeout.updateStakeoutDirection`,
  `drawAnnotations.createDrawAnnotationLayer`) were removed so callers must pass
  the project CRS. Surfaces consume the engine context: `SurveyMap`'s sheet-layout
  + print buttons and `WorkspaceMap`'s print button read `useSurveyMapEngine()`
  (`WorkspaceMap` also gained a stable container id so `exportApi.exportMapPDF`
  can capture its canvas), and `/field` was confirmed core-only
  (`components/field/PushToTraverse.tsx` now takes SRID constants from
  `core/projection`). `MapClient.tsx` went 1671 → ~1050 lines as a composition
  root: `useSchemeLayers`, `useDigitizingTools`, `useTraverseParcelPreview`,
  `useGpsTracking`, `useProjectPoints` and `useMapPrintFlow` now live in
  `app/map/hooks/`. Guarded by `surveyMapEngine/__tests__/phase5Wiring.test.ts`
  (banned-import greps, shim deletion, surface consumption, MapClient
  composition-root + engine CRS rails) plus the updated `singleImplementation`,
  `phase3Wiring`, `phase4Wiring` and `core` suites.
  Note: the blueprint itself lives outside this repo at
  `C:\Users\user\Downloads\METARDU_WEB_PROFESSIONAL_SURVEY_BLUEPRINT.md`; its
  §40 Sprint A items reached by this plan (`central EPSG resolver`,
  `accurate map distance/area`, `audit CRS literals`, `coordinate-format service`,
  `CRS regression tests`, `SurveyMapEngine extraction plan`) were ticked with
  evidence, §31 P0 gained `No professional EPSG:3857 distance/area` and
  `Unify workspace and standalone map math`, and §12.4 now carries the as-built
  module map. `ProjectReferenceSystem` and `LandXML metadata` remain unticked.

## 5. Risks

| Risk | Mitigation |
|---|---|
| `/map` is large (1464 L + 1078 L hook) — refactor regression surface | Phases are shim-based; every phase is shippable; characterization tests first in Phase 0 |
| proj4/OL registration side effects (`registerProjections` async, once-only) | Keep registration in `ol/` layer; `core/` must not import proj4 |
| `useMeasurement` API change breaks `useSubdivision` | Update both call sites in the same PR; fail-closed default keeps old behavior visible in dev |
| Scope creep into F5 (server-side zone-37 writers) | F5 explicitly out of scope here; track under CRS-literal audit follow-up |
| Field map offline constraints | Field consumes `core/` only; no OL bundling |

## 6. Non-goals

- Not a general-purpose CAD/OL rewrite (blueprint §13: no AutoCAD clone).
- No UI redesign of `/map` — extraction is structural; layout changes only where the
  blueprint's §12.2/§12.3 layouts already require them (separate work).
- No new map library (stays OpenLayers where OL exists today).

## 7. Traceability

| Blueprint item | Plan coverage |
|---|---|
| §40 Sprint A "SurveyMapEngine extraction plan" | This document |
| §40 Sprint A "accurate map distance/area" | Phase 0 (F1 closes the remaining gap; `/map` already compliant) |
| §40 Sprint A "coordinate-format service" | Phase 1 `core/format.ts` (F6) |
| §12.4 shared engine, used by `/map`, `/project/[id]`, `/field/map` | §3.1 + Phase 5 |
| §12.5 display→CRS→survey math | §3.3 contract + Phase 0 tests + lint rule |
| §40 Sprint B "contextual map" | Benefits from Phase 2 selection/layer stores (separate task) |
