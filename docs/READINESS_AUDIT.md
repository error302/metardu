# METARDU — Readiness Audit & Remaining Work

**Date:** 2026-09-30
**Scope:** honest assessment against four questions, with the evidence that backs each
verdict, and the work already completed in this pass.

---

## 1. Is METARDU an app a surveyor can rely on start-to-finish?

**Verdict: not yet — but the load-bearing foundations are now real, and the chain is
broken in four specific, named places.**

What genuinely works today:

| Capability | State | Evidence |
|---|---|---|
| Survey mathematics | Real | `src/lib/surveyMapEngine/core/measure.ts` is the only display→project-CRS path; `metardu/no-web-mercator-measure` enforces it |
| Coordinate formatting | Real | `core/format.ts`, single implementation, `singleImplementation.test.ts` pins it |
| CRS authority | Real | `src/lib/spatial/projectCrs.ts` + `core/projection.ts`; exports **fail closed** on undeclared CRS (`LandXML`, `GeoJSON`, now `/api/project/[id]/export`, deed-plan generate) |
| Map surfaces | Real | One engine behind `/map`, `/project/[id]/map`, workspace map; `/field` core-only |
| Observe (provenance) | Real, narrow | `observation_batches` CRUD + hash-chained `evidence_events` (`migrations/068`, `070`), wired to the Observe stage |
| Deliverable drawing quality | Good on the strongest path | `src/lib/reports/surveyPlan/renderer.ts` (mm geometry, north arrow, scale bar, CRS + vertical datum, revision block, SHA-256), `deedPlanExport.ts` (true scale/DPI canvas composer), `dxfSheetLayout.ts` |
| Mobile GNSS | Real | BLE (`lib/gnss/capacitor-ble.ts`, `lib/instruments/gnssBleConnection.ts`), Web Bluetooth, NMEA parser, RINEX, NTRIP |
| Offline sync | Real | `lib/offline/fieldBookDB.ts` (IndexedDB + auto-sync), `lib/offline/syncQueue.ts` (3-way merge) |

Where the chain is **not** closed:

1. ~~**No deliverable document control.**~~ **DONE (this pass)** — `migration 072`
   adds `deliverables` / `deliverable_revisions` (append-only, content-hashed),
   `computation_runs` and `qa_runs` / `qa_results`; `lib/deliverables/deliverableRegister.ts`
   is the single writer; `/api/project/[id]/export` registers every artifact it
   issues (revision, source data revision, CRS, generator, SHA-256) and emits an
   `EXPORTED` evidence event; `GET /api/project/[id]/deliverables` exposes the
   register and the Deliver stage renders it. Still to do: the deed-plan and
   scheme export routes (`/api/documents/deed-plan`, `/api/scheme/export/*`) must
   register too.
2. ~~**Evidence stops after Observe.**~~ **PARTLY DONE** — `COMPUTED` and
   `QA_CHECKED` events are now emitted by the compute path and the QA dashboard;
   `DERIVED`, `APPROVED` and an explicit `SUPERSEDED` on register supersession
   remain unwired.
3. ~~**Compute has no run record.**~~ **DONE (this pass)** — `recordComputationRun`
   writes algorithm id/version, input version, parameters, input/output hashes
   and QA summary from `field-to-finish`. The hand-rolled
   `updated_at::text AS revision` "revision" is still a fake concurrency token
   rather than a real `design_revisions` model.
4. ~~**QA stores no measurements.**~~ **DONE (this pass)** — `recordQaRun` stores
   rule + measured value + threshold + unit + data/design revision + the
   tolerance-profile version in force, and the dashboard persists every run.
   Remaining: `quality_checks` (legacy table) is still written with two booleans
   by the old workflow route, and `tolerance_profiles` is read only as a
   per-project fallback default — there is no project→profile assignment UI yet.

**Answer:** a surveyor can rely on METARDU for *computing correctly and drawing well*. They
cannot yet rely on it for *proving* what was computed, by whom, from which revision, under
which tolerance — and that is precisely what a Cap. 299 submission or an engineering
handover demands.

---

## 2. Does it cover the workflow, and what a surveyor needs to be competent with it?

**Verdict: the seven stages exist as a coherent shell; three are real, three partial, one stub.**

| Stage | State | What is missing |
|---|---|---|
| Overview | REAL (thin) | Counts only (StagePage SQL); reference system shown separately |
| Control | PARTIAL | Real register over `/api/project/[id]/points`; `Status` is a hardcoded "Recorded" badge — no verification state machine (blueprint §5.1) |
| Observe | REAL | Honest about limits: "records the filename only. It does not upload or hash the file" — so `source_file_hash` is NULL from that form |
| Compute | PARTIAL | Real maths via `field-to-finish`, but no computation record, no revision, results into JSONB |
| Design | **WAS STUB → now readiness-gated** | Fixed this pass: shows real draftable-vertex count + CRS warning, and opens `/project/[id]/cad-editor` (real project editor) instead of the `/tools/cad-editor` demo page |
| Verify | PARTIAL → **QA now wired** | Fixed this pass: QA dashboard receives the project's measured boundary (was: `projectId` accepted and ignored → every row "PENDING"). Evidence tab real |
| Deliver | PARTIAL | **Exports were 404** — fixed this pass (`/api/project/[id]/export` now serves DXF/GeoJSON/CSV/LandXML, fail-closed on CRS). Still no deliverable register |

Competence support is **strong on calculation** (`/tools/*` suite: traverse, LSA, COGO,
leveling, curves, resection, radiation, deformation) and **weak on instrument-to-app**:
there is no shared import-adapter interface (blueprint §17.2), so each tool parses its own
files. The RINEX baseline panel no longer returns a mock: it submits base, rover and
navigation files to the authenticated Python worker's RTKLIB path and displays validated
worker measurements. Its source and boundary tests do not prove numerical RTKLIB results;
known-control RINEX and independent coordinate checks are still required (see
[`GNSS_RTKLIB_BASELINE_REPAIR_2026-10-12.md`](GNSS_RTKLIB_BASELINE_REPAIR_2026-10-12.md)).

**Missing verticals:** bridge workspace (§10) and construction/building workspace (§11) have
no project shell — pile grid and verticality exist only as `/tools/*` calculators.

---

## 3. Are documents and maps of professional quality, and do they match reality?

**Verdict: the best generator is genuinely professional; several paths still lie to the surveyor.**

Fixed in this pass (all were "the document says something untrue"):

| Defect | Fix |
|---|---|
| LandXML emitted no `<Units>` — schema-invalid, rejected by importing systems (blueprint P0) | `<Units>` now emitted; vertical datum promoted from an XML **comment** to a machine-readable `<VerticalDatum>` element |
| Deed-plan API silently defaulted CRS to UTM 37S / Arc 1960 | `/api/deed-plan/generate` now returns `400 CRS_UNDECLARED` |
| Survey report hardcoded `Datum: WGS84` regardless of project | `declaredDatum()` prints the project's datum or `NOT DECLARED`; added `describeEpsg()` to the CRS authority |
| Sheet certificate claimed "Arc 1950 / UTM Zone 37 South" on *every* survey (Arc 1950 is the wrong datum entirely) | Certificate now derives datum/projection/units from the sheet's own `epsg` |
| Drawing numbers regenerated on every render (`MET-${Date.now()}`) | Deterministic from LR number / project slug |
| Deliver-stage export buttons 404'd | New `/api/project/[id]/export` |
| QA dashboard reported "PENDING" for every check | Verify stage now passes real boundary geometry |
| Design stage sent the surveyor to a demo page | Opens the project CAD editor |
| QA dashboard **passed an empty project** ("READY FOR SUBMISSION", "All quality checks passed" with 2 pending checks) | Readiness now requires every check to have a verdict: pending ⇒ "NOT ASSESSED YET" |
| Missing angle readings rendered as `FAIL NaN"` | An unmeasured misclosure is **pending**, never a verdict |
| QADashboard could infinite-render on any project without parcels | Stable `EMPTY_PARCELS` default + the auto-run moved out of the render phase |
| QA checks were never recorded anywhere | `recordQaRun` persists rule/measurement/threshold/revisions; dashboard writes each run |
| Documents were unregistered orphans | Deliverable register (migration 072) with revisions, hashes, reviewer and supersession |

Still open (highest value first):

1. **No deliverable register** (see §1) — every document is untraceable.
2. **Coordinate grid/ticks missing** on the jsPDF deed-plan path (`deedPlanRenderer.ts`)
   while the canvas/SVG paths have it.
3. **Fabricated beacon attributes**: `lib/generators/deedPlan.ts:56-84` returns invented
   monument descriptions ("300×300mm, 600mm deep") for codes absent from the DB.
4. **No sheet composer**: `SheetLayout` is a browser-sized overlay — no A4/A3/A1, no fixed
   scale; `renderer.ts:65` reads `paperSize` then ignores it.
5. **Cadastral DXF sheet furniture missing**: `cadastralPlanDXF.ts:8,386` claims north arrow /
   scale bar / frame are added; only `traverseDXF` emits them.
6. **Two generators, one product**: `surveyPlan/renderer.ts` (mm, real) and
   `generators/deedPlan.ts` (jsPDF, naive) coexist.

**Answer:** yes for the plan/deed-plan canvas and SVG paths (north arrow, scale bar, true
scale, CRS, vertical datum, revision block, tamper hash, coordinate schedules). Not yet as a
system: the same surveyor can get two different standards from two buttons on the same stage,
and no output carries a register entry proving what it is.

---

## 4. What should the mobile app be?

**Principle: mobile does only what is genuinely better on a phone** — capture, observe,
set out, verify in the field. Drafting, adjustment, plan composition and submission stay desktop.

**Current mobile app:** `/field` (Points/Traverse/Leveling/Radiation tabs), `/field/collect`,
`/field/map`, `/field/gnss`, `/field/walk`, `/field/projects` — plus a second parallel surface
at `/mobile/field`. That fragmentation is itself a defect: a surveyor does not know which app
is authoritative.

Fixed in this pass:

- `/field/walk` **persisted nothing** — a walked boundary was lost on reload. It now writes
  through to offline storage, restores the last walk on mount, and converts corners to beacons
  so the boundary can be **pushed to traverse** (wiring the previously orphaned
  `PushToTraverse`) — closing the field→office loop.
- Coordinate/bearing inputs open an **alphabetical keyboard**; now `inputMode` numeric.

Next, in priority order:

1. **One field app, one entry point.** Merge `/mobile/field` into `/field`. `/field/walk` and
   `/field/projects` still use a separate localStorage project shape; migrate that workflow to
   shared project/offline storage before removing it. Road field plans now have a dedicated
   offline IndexedDB picker, but this does not unify the remaining field entry points.
2. **Offline basemap.** Today: MBTiles upload POSTs to a route that **does not exist**
   (`lib/field/mbtiles.ts:6` → `/api/field/mbtiles/upload`), and tiles are served from server
   `/tmp`. The OSM cache regex in `next.config.js:34` never matches OL's
   `tile.openstreetmap.org`. Without a basemap, offline capture is not field work.
3. ~~**A real set-out screen.**~~ **DONE (this pass)** — `/field/setout` walks the project's
   set-out definition one point at a time: target E/N/RL, observed E/N/RL, fix accuracy,
   live dE/dN/dZ, a plain-language verdict ("Move 4 cm north, then stake" / "On target"),
   and `Staked` records the shot to the register. Two safety rules are enforced and
   tested: a **coarse fix can never read "on target"** (it reports INFO and cannot be
   recorded), and the move instruction is the **inverse** of the error. Remaining: auto-fill
   from the live GNSS fix, offline queueing of shots, and a per-column verticality UI.
4. **Local-first project list.** The road collector can now reopen device-cached plans whose
   saved project CRS binding is valid, then requires a field-brief acknowledgement. The general
   `/field` project list and other field types still require live Supabase, so offline support
   remains incomplete.
5. **Background sync.** No Service-Worker sync queue; `startAutoSync(30s)` dies with the page.
6. **Data durability for `/field` hub + walk.** Traverse/leveling/radiation still live in React
   state only.
7. **GNSS field workflow.** `/field/gnss` now shows and copies the receiver's raw
   latitude/longitude without assigning the hardcoded Kenya grid. The instrument stream
   omits projected E/N until field capture transforms the fix using the project's declared
   CRS. The page still has no field observation capture/save flow. The separate RINEX
   baseline panel is worker-backed, but it still needs representative known-control
   observations and an independent numerical check before field acceptance.

---

## 5. Prioritised remaining work

**P0 — surveyor can finish the job (workflow blockers)**
1. ~~Subdivision designs could never be saved~~ **DONE** — `POST /api/scheme/subdivision`
   persists designed plots with geometry (migration none needed; `parcels.geom` existed).
2. ~~Beacon re-establishment did not exist~~ **DONE** — `POST /api/beacons/[id]/reestablish`
   + migration 073 (columns + supersession trigger).
3. ~~Road alignment saves 500'd on missing columns~~ **DONE** — migration 073.
4. ~~Topographic surfaces lost on reload~~ **DONE** — migration 074 + `POST
   /api/project/[id]/surfaces` (server-side compute, immutable revisions).
5. ~~Project-level set-out did not exist~~ **DONE** — migration 075 adds
   `setout_definitions` / `setout_points` / `setout_observations` /
   `verticality_readings` (as-staked shots and plumb readings are append-only);
   `POST /api/project/[id]/surfaces`-style server-side design generation in
   `/api/project/[id]/setout`; `lib/engineering/verticality.ts` adds the missing
   plumb maths (offset, tilt ratio, absolute cap + ratio standard); the pile/column
   grid panel is now project-bound and persists its design, and `/field/setout` is the
   field screen that works through it. Remaining: GNSS auto-fill, offline shot queueing,
   per-column verticality UI.
6. **Open: design revisions** — replace `updated_at::text AS revision` with real
   `design_revisions` (§28); alignment IPs are still DELETE + re-insert.
7. **Open: register remaining export paths** (deed plan, scheme DXF/GeoJSON, topo
   DXF/shapefile) so every issued document is provable.

**P1 — document quality**
8. Stop fabricating beacon descriptions in `deedPlan.ts:56-84`.
9. Bring the jsPDF deed-plan path to parity (coordinate grid) or delete it.
10. Sheet composer: real paper sizes + fixed scale.
11. DXF sheet furniture for cadastral exports.

**P2 — field app**
12. Merge `/mobile/field` into `/field`.
13. Offline basemap (MBTiles upload route + client-side tile source; fix OSM cache regex).
14. `/field/setout` screen driven by the engine's stakeout state.
15. Local-first project list + background sync.

**P3 — scale**
16. Import sessions + staging + set-based commit for ward-scale jobs (§22).
17. Viewport queries / vector tiles above 5k parcels (§6.8).

---

## 6. Environment notes (as of this pass)

- **Database is 8 migrations behind with an edited `052`** — `npm run migrate` refuses
  to run ("Applied migration content changed"). Migrations **072, 073 and 074 were applied
  directly** (all additive / `IF NOT EXISTS`) because their prerequisite tables
  (`observation_batches`, `evidence_events`, `tolerance_profiles` — normally from 068) were
  also absent and had to be created first as minimal versions. **Repair the `052` checksum
  or run `--force` before shipping**, otherwise a later real `npm run migrate` will collide
  with those hand-created tables.
- The Docker `metardu-app` image is a **3-day-old build**: none of this work is served
  until it is rebuilt.

**P3 — scale**
13. Import sessions + staging + set-based commit (blueprint §22) for ward-scale jobs.
14. Viewport queries / vector tiles for >5k parcels (blueprint §6.8).
15. Bridge + construction project shells.
