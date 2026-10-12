# METARDU — Gemini continuation handoff

**21 September update:** Read [GEMINI_HANDOFF_2026-09-21.md](GEMINI_HANDOFF_2026-09-21.md) first. It supersedes deployment status and identifies unresolved numerical issues and corrections to historical claims below.

Prepared 13 September 2026. This is an active engineering handoff, not a claim that the application is finished or production-certified.

## Instruction from the owner

Continue where Codex left off. Finish the remaining cadastral browser verification, then apply the same rigorous end-to-end testing and repair process to **engineering, topographic, geodetic, drone, and deformation surveys**. Test as a practising surveyor trying to finish a job, not merely as someone checking whether pages load. Fix reproduced defects, verify the fixes, inspect generated files, optimize unnecessary startup work, and deploy the tested changes to the existing desktop Docker installation.

The owner has no paying users yet and very limited hosting funds. The application is hosted on **their Windows desktop**, not Oracle Cloud; the Oracle VM was stopped. Do not provision paid hosting or suggest more features as a substitute for making the core workflows dependable. The commercial objective is a useful, trustworthy browser workflow that saves surveyors measurable time. Do not promise market superiority or revenue without evidence.

## Workspace and operating rules

- Repository: `C:\Users\user\Desktop\METARDU`.
- Shell: PowerShell. Public site: https://metardu.space. Local application: http://localhost:3000.
- Stack: Next.js 15, PostgreSQL, Redis, Docker Desktop, Cloudflare tunnel. Inspect package.json for exact versions.
- There are **many pre-existing uncommitted changes** across this repository. Preserve them. Do not reset, clean, revert whole files, overwrite the branch, or assume the entire diff belongs to this audit. No commit was made during this pass.
- Search for current AGENTS.md and read applicable instructions before editing. None was found earlier in this pass; recheck if the workspace changes.
- Read secrets only when needed to operate the existing deployment; never print `.env`, tokens, or credentials. Do not change Cloudflare/DNS, billing, customer data, production credentials, or Docker volumes.
- Use clearly fictional QA projects. Do not submit anything to a government registry, send messages, create charges, or represent fictional credentials as verified.
- Keep moving on reversible, authorized fixes. Ask the owner only for information that cannot be inferred and actually blocks work. Keep concise progress updates and an accurate written status.
- Windows Python defaults caused an encoding incident earlier: **always use explicit UTF-8 for source reads and writes**, or use a patch tool. Do not use default `Path.read_text()/write_text()` on TS/TSX containing Unicode. The incident was repaired and TypeScript subsequently passed.
- Do not recursively delete/move calculated Windows paths. Avoid `docker compose down -v` and similarly destructive scripts.

## FIRST: establish the current build/deployment state

At handoff preparation, a production image build started at approximately **16:13 EAT on 13 September** and was still running. Codex tool session: `86695` (this session ID may not be accessible to Gemini). It was started with `docker compose build metardu-app` and includes the final source changes listed below, including the A3 working-diagram layout repair. New tests added after the build started do not change runtime code.

**Do not confuse source changes, the newest image tag, and the running container.** The currently running container was deployed around 16:00 EAT and includes map/profile/QA/settings repairs, but not the later export/preview repairs. Check whether the newer build finished successfully before deploying. If the build result is unavailable, perform one fresh build after checking for an already-running build. Avoid concurrent competing builds.

```powershell
docker compose ps
docker inspect metardu-app --format '{{.Image}}'
docker image inspect metardu-metardu-app:latest --format '{{.Id}} {{.Created}}'
npx tsc --noEmit
npx jest --runInBand --silent
docker compose build metardu-app
docker compose up -d --no-deps --wait --wait-timeout 120 metardu-app
docker compose exec -T metardu-app node verify-migrations.mjs
```

Run the build command only if needed; deployment must follow a successful build and appropriate checks. The image build takes roughly 6–9 minutes on this PC, including compilation, type checking and tracing over 212 static pages. That build time is **not** browser startup latency. Docker calls required execution outside the restricted sandbox in Codex, and were approved. A sandbox access failure is not proof Docker is broken.

The previous deployed migration verification passed: **69 migrations applied, checksums match, no ghosts**. Migration `064_project_settings_fields.sql` is already applied. The full Jest suite intentionally prints a migration-verifier failure in a negative test with DATABASE_URL absent; judge by final suite/exit status, and separately verify the actual Docker schema.

## Existing evidence and artifacts

- Plan: `docs/superpowers/plans/2026-09-13-cadastral-browser-audit.md` (checkboxes are older; use this handoff for current state).
- Results: `docs/superpowers/plans/2026-09-13-cadastral-browser-results.md` (also being updated; this handoff records the latest pending items).
- QA credentials/IDs: `live-test-results/cadastral-browser-fixture.json`. Read locally; do not reproduce its password in reports.
- Fixture creator: `scripts/cadastral-browser-fixture.cjs`. Existing fixture is sufficient; avoid creating duplicates.
- Generated files copied from the fictional project: `live-test-results/cadastral-generated/`.
- PDF inspection library installed only under `live-test-results/python-libs/`. Import `pymupdf` after adding that directory to sys.path. Codex sandbox could not read this elevated-installed package; elevated inspection worked.
- Startup measurement: `scripts/measure-startup.cjs` and JSON artifacts under `live-test-results/`.
- Full tests last completed: **205 suites passed, 2,774 tests passed, 1 skipped, 1 snapshot passed**. Then two additional test files passed separately: working-diagram layout (1 test), document routing/licence/RIM (2 tests). Run the final combined suite for the new exact count.
- TypeScript passed after final runtime source edits. Additional tests should be included in the next check.
- A read-only reviewer found and confirmed repair of a control-autosave race; later reviewed preview/settings with no concrete P1/P2 regression. Later shapefile/RIM/PDF changes still warrant review.

## Fictional cadastral job already in the browser/database

- User ID: `cac11ecb-b399-4e83-aed2-725fbb87f497`.
- Project ID: `bb085558-ba63-4837-b7ba-1a1b437eeaa5`.
- Name: `QA CADASTRAL — FICTIONAL 100 × 80 m PARCEL`.
- Survey type: cadastral; datum ARC1960; UTM 37S.
- Starting control A1: E 500000, N 9900000.
- Reduced **grid** observations, in this exact order:

| From | To | Bearing (degrees) | Distance (m) |
|---|---|---:|---:|
| A1 | A2 | 0 | 80 |
| A2 | A10 | 90 | 100 |
| A10 | A3 | 180 | 80 |
| A3 | A1 | 270 | 100 |

Expected adjusted vertices: A1 (500000,9900000), A2 (500000,9900080), A10 (500100,9900080), A3 (500100,9900000). **Area 8000 m² = 0.8 ha; perimeter 360 m.** The closing traverse endpoint is not a fifth parcel vertex. Station labels deliberately catch alphabetical reordering.

Metadata entered in UI: LR `QA-FICTIONAL-NOT-REGISTERED`; parcel `QA-RECTANGLE-8000`; district `Fictional test district`; locality `Fictional QA site`. Surveyor `QA Surveyor — Not for certification`; firm `FICTIONAL QA — NOT A SURVEY FIRM`; licence `QA-NOT-A-VALID-LICENCE`; ISK intentionally blank. The licence-format warning is expected and does not establish real professional eligibility.

An older settings save turned an empty optional closure field into 0. The source is repaired; **clear that optional closure field through the current settings UI, save, reload, and verify it remains empty**. The computed boundary remains the known rectangle. Do not mistake this optional settings field for independently measured closure.

## What has been fixed in source

### Availability and performance

- `scripts/start-desktop.ps1`: Windows PowerShell native stderr from an unavailable Docker engine no longer aborts the startup probe before Docker can start.
- `next.config.js`: removed catch-all vendor-common chunking that forced heavy lazy dependencies into initial scripts; corrected Windows-compatible Sentry/module matching.
- `scripts/bundle-budget.mjs`: landing initial-JS budget reduced to 1000 KB with corrected explanation.
- New HTTP script measurement utility. Baseline: **76 scripts, 3,334,922 raw bytes, 997,447 gzip-equivalent bytes**. First optimized deployed build: **25 scripts, 774,905 raw bytes, 237,840 gzip-equivalent bytes** (~76% smaller). This measures payload, not LCP or interactivity. Re-measure the final deployment. The workspace `.next` may be stale; do not run a budget check on old artifacts and attribute it to the new image.
- Runtime app memory previously measured around 481 MB; build resource use is separate. Do not add a paid hosting requirement to solve avoidable eager loading.

### Field book, control, computation and workflow

- `src/app/api/project/[id]/fieldbook/route.ts`: canonical transactional PUT/GET using actual schema, soft-deleted rows excluded, row order retained, owner checks, derived results/documents invalidated on edits.
- `src/components/workspace/DynamicFieldBook.tsx`: saved rows/control reload, save status/errors, explicit grid provenance, pending saves flushed on navigation, latest control included in debounce. Latest timer calls `persistRef.current`, avoiding a stale closure.
- `src/lib/survey/fieldBookSaveQueue.ts`: shared pending-save/flush coordination; compute waits for latest save and fails closed on save error.
- `src/lib/survey/cadastralInput.ts`: strict bearing parsing, valid positive distances, explicit control, connected station/target order, grid provenance; no invented survey observations or identities.
- `src/lib/survey/field-to-finish.ts`: grid input is not reduced a second time as EDM slope distance; closed endpoint separated from polygon vertices; invalid/crossing/zero-area boundary fails.
- `src/lib/survey/boundaryValidity.ts`: independent crossing-boundary check.
- Field-to-finish API: source revision checked before write; saves canonical computed boundary and evidence; stale concurrent computation returns conflict.
- `CadastralComputeIntegration.tsx`: explicit compute action using saved inputs, visible errors, no auto-compute with fabricated control; refresh after successful result.
- Workflow API/client: actual metadata/counts, no fabricated readiness values, route step synchronization, pending save flush, re-evaluated gates, correct document tracking, refresh of derived results.
- Cadastral Plans step added; document links corrected; generate-plan redirects to the real submission route.

### Map, QA, settings and documents

- New-project boundary map lifecycle fixed; removed automatic geolocation prompt.
- Project map had zero height and no canvas. Explicit sizing now renders the rectangle; map control contrast improved.
- `QADashboard` receives canonical boundary/traverse evidence. Empty QA no longer claims all checks pass. Angular checks without readings, document review and registry readiness remain pending. Current live fixture: 5 passed, 3 pending, **REVIEW INCOMPLETE**.
- Settings migration adds fields the existing UI already tried to save. Settings client memoized to stop repeated reloads overwriting edits; blank measurements remain null; existing traverse properties preserved; bogus assumed-1km accuracy badge removed; survey type select includes actual supported types.
- `fetchSurveyorProfile.ts`: per-field merge of project and owner details, with distinct licence and ISK values. A project surveyor name no longer hides the owner's licence. Validator and deed-plan export gate use the licence field.
- `deedPlanGeometry.ts`: exports load the same canonical computed boundary as the browser, with closure evidence and beacon metadata. Important pre-existing repairs in this file were preserved.
- Submission preview uses canonical geometry, real profile field names, and a **DRAFT - NOT SUBMITTED** reference. A preview no longer allocates a statutory submission sequence. Missing observations are not replaced with zeroes.
- Submission validation callback stabilized; export buttons start blocked during validation and remain blocked on validation error.
- Coordinate workbook now includes canonical cadastral stations rather than an empty unrelated beacon table; unknown heights remain blank; empty schedules fail.
- Boundary shapefile now contains real `.shp`, `.shx`, `.dbf`, `.prj`, `.cpg`, with clockwise closed polygon, supplied supported CRS, and no fabricated regulatory approval. Uses installed `shp-write`; binary tests check geometry and metadata.
- Traverse report excludes soft-deleted rows and reports actual geometry/closure evidence instead of claiming uncomputed angular closure.
- RIM export was advertised but unimplemented. It now invokes the existing RIM generator for one saved section and its parcels/beacons. Missing/ambiguous sections produce a specific requirement. **Positive RIM browser scenario has not yet been completed.**
- Working diagram: changed A4 to A3, widened coordinate columns, labelled schedule as coordinate-derived, corrected closed schedule totals, added area and draft review note. New regression test verifies complete northings on one line. Rendered and numerically inspected locally; live regenerated output still pending.
- Non-cadastral computation routing now links each project workflow to its real engineering, topographic, geodetic, drone, or deformation workspace instead of claiming that a generic placeholder runner has completed the work.
- Levelling input preserves valid zero readings, rejects non-numeric readings, infers allowable-closure distance from explicit route length or surveyed chainage span, and reports closure as unknown until a closing benchmark is actually supplied. The engineering auto-calculator never fabricates a 1000 m opening RL and accepts an explicit RL of 0. Topographic vertical sights avoid emitting Infinity/NaN. Regression coverage is in `tests/non-cadastral-computation-evidence.test.ts`.
- Deformation comparison now rejects invalid tolerances, confidence levels, duplicate monument IDs, and non-finite observations before producing a report. Geodetic reduction UI preserves a valid zero geoid undulation and validates finite numeric inputs.
- `next.config.js` disables Next's default vendor cache groups so route-specific libraries are not listed as landing-page initial dependencies. Rebuild before trusting the budget measurement; the old `.next` output was intentionally removed by the current build.
- Landing-page claims now distinguish offline field/core calculations from server-backed RINEX and photogrammetry processing; this keeps the product promise aligned with what the browser can prove.

## Browser checks already performed

- Created the fictional project via UI; saved/reloaded four rows and explicit control.
- Missing control rejected with clear error.
- `90junk` rejected as an invalid bearing. Immediate navigation saved it; derived area/boundary was invalidated rather than leaving old results current. Restored bearing 0 and recomputed rectangle.
- Valid result: 8000.000 m², 360.000 m, expected station order and coordinates. Very large finite precision ratio reflects floating-point residual on a mathematically exact fixture, not real instrument precision.
- New-project map has a real canvas. Project map renders rectangle and 8000.0 m²; Fit to Parcel works.
- QA shows actual geometry and outstanding evidence instead of false readiness.
- Project metadata saves after migration; final empty-field/reload check remains.
- Through browser buttons generated field-book XLSX, working diagram PDF, nine-sheet statutory XLSX, C22 PDF, area PDF and traverse sheet PDF. Files copied from **only this QA project's** storage directory for inspection.
- PDF Download opens a new authenticated storage tab rather than emitting a download event in Codex's browser. Do not mistake the missing download event for a failed generation. Check the actual tab/file.
- PDFs extracted/rendered: area and C22 show 8000 m²; traverse and C22 clearly identify coordinate-derived geometry and unverified independent angles. Workbooks opened successfully; no stored error cells found. This is not a full recalculation/certification of every workbook formula.
- Deed plan failed due an additional licence/ISK mismatch in the export gate; source fixed, **retry on final deployment**.
- RIM failed with “not implemented”; source wired, **retry and test required section handling on final deployment**.

## Immediate remaining cadastral work — do this before broadening

1. Confirm final build success, deploy only `metardu-app`, wait healthy, verify migrations and public site. Do not assume the currently running container includes the latest edits.
2. Recheck settings clear/save/reload, valid computation, stale-result invalidation, map, QA and draft preview.
3. Generate/retry deed plan, actual boundary shapefile, coordinate schedule, updated traverse report and updated A3 working diagram in the browser. Existing ready documents can still refer to older files; explicitly regenerate or invalidate through a normal fictional project edit/recompute. Do not silently inspect an old PDF and call the new layout verified.
4. Inspect actual downloaded/exported content: coordinates, order, CRS, units, area, nonzero legs, draft status, missing evidence, attribution, readable tables, clipping and page breaks. The local A3 working-diagram render is much improved, but its right-hand table still appears to extend a few millimetres beyond the inner border; review margin arithmetic (`TABLE_X + TABLE_W`) and fix if confirmed. Several other forms use only part of A3; improve only where readability or usability suffers.
5. Exercise complete dossier/ZIP. Inspect every archive entry and manifest; reject missing files, stale documents or fabricated “all passed.” Core dossier generation and full submission completeness are different concepts; do not equate a downloadable ZIP with legal readiness.
6. Create separate fictional scenarios for subdivision/mutation, multiple parcels, and a saved RIM section. A single rectangle cannot prove these workflows. Verify parent-child area conservation and no overlap/gaps; do not invent consent, ownership or registry approval.
7. Verify account/session failures, file access ownership, failed save/export recovery, refresh/back/forward, empty and large field books, narrow and desktop layouts. Map layers cover much of a narrow viewport when expanded; assess default collapse/accessible controls as part of responsive usability.
8. Re-run final appropriate tests and startup measurements; update results with exact counts, final image/build, reproduced defects and unresolved limits.

## Repeatable audit method for every survey type

For each type, trace **Setup → real input/import → save/reload → compute → independent numerical check → QA → map/visual output → export → reopen exported files → edit/recompute/regenerate**. Use customer-facing browser controls for end-to-end proof. Unit/API checks supplement this; they do not replace it.

Maintain one result table per type: scenario, independent expected result, observed browser result, saved/exported evidence, defect, fix, regression test, deployed recheck. Test invalid inputs and missing evidence as deliberately as happy paths. Prioritize silent wrong answers, lost data, false readiness and unusable outputs before polish.

Use published primary references for surveying methods/tolerances and the actual jurisdiction; record version/date. Do not reuse cadastral or Kenyan road thresholds for every survey. Compare independently calculated values, not two wrappers around the same engine.

### Engineering

- Levelling: known benchmark RL 100.000; BS 1.250 and FS 0.750 gives next RL 100.500; second setup BS 0.800 and FS 1.300 closes at 100.000. Verify rise/fall and height-of-instrument agree, turning points, sums, units, real route length and closure allowance. Test valid RL=0 (truthiness checks elsewhere may incorrectly reject it).
- Chainage, longitudinal/cross sections, design levels, gradients, setting-out coordinates and cut/fill signs. Explicitly define sign convention.
- Volume fixture: sections of 10 and 20 m² spaced 30 m give average-end-area 450 m³; a prismoidal case with midpoint 14 m² gives 430 m³. Verify each method separately and reject missing midpoint data rather than pretending the methods agree.
- Inspect setting-out DXF/LandXML/profile/volume/levelling reports and imported geometry in an independent parser/viewer where available.

### Topographic

- Known radial grid observations from explicit control, heights and codes. Verify bearing orientation, slope-to-horizontal reduction, vertical-angle convention, units and point identities.
- Use points on a known plane, e.g. z=100+0.01(E-500000)+0.02(N-9900000), to check interpolation/contours. Test breaklines, duplicates, collinear points, holes, outliers and undefined terrain outside the convex hull.
- Check contour interval/labels, triangulation, area/volume against known surfaces, map/CRS, CSV/DXF/GIS exports. Never label synthetic interpolation as measured elevations.

### Geodetic / control

- GNSS baseline/session input, antenna heights, occupation times, reference stations, reference frame/epoch, units, covariance and constraints.
- Use a small independently solved network with known closure and redundant observations; compare weighted least-squares coordinates and residuals. Test singular networks, zero/negative uncertainty, disconnected stations, outliers and datum mismatches.
- Round-trip coordinate transforms only within declared accuracy; record actual CRS and transformation. Do not claim centimetre accuracy from a generic datum shift.
- RINEX/CORS upload/download paths, unavailable stations, cancellation and large-file handling; actual processing results must be distinguishable from placeholders or illustrative data.

### Drone / photogrammetry

- GCP versus independent checkpoint roles, image/flight metadata, CRS/vertical datum, camera/overlap inputs, orthophoto/DSM/DTM imports and output extents.
- Known checkpoint residuals with independently calculated RMSE, units and sample count. Never report zero error when checkpoints are absent.
- Test whether real photogrammetry processing exists or the app only accepts derived products; expose that distinction honestly in UI and reports. Check upload limits, processing progress/failure/retry, memory use and large raster/point-cloud loading.
- Validate orthophoto export embeds the actual image and georeferencing, and volumes are based on supported surfaces rather than invented data.

### Deformation / monitoring

- Multiple epochs, stable references, consistent point IDs, timestamps, units, reference frame and covariance. Known displacement example: dE=+0.012 m, dN=-0.005 m gives horizontal magnitude 0.013 m. Include vertical displacement separately.
- Verify significance testing only with sufficient uncertainty information; distinguish movement from significance. Test reference-point instability, missing epochs, reordered IDs, duplicates, outliers and unequal precision.
- Confirm time-series signs, thresholds, maps, report values and exports. No invented alerts or messages; notification sending requires owner authorization.

## Cross-cutting acceptance criteria and commercial focus

- No invented control, observations, licence, survey date, CRS, accuracy class, ownership evidence or compliance status.
- Missing/invalid input fails clearly; valid zero values survive; units and angle conventions are explicit; no double reduction/adjustment.
- Saved input, computation, map and all documents refer to the same current revision. Concurrent updates cannot resurrect stale results.
- Every advertised export is implemented with the promised actual format or clearly marked unavailable before the user spends effort. Blank output is not success.
- Browser remains usable during large input, export and computation. Measure initial payload and route loading before optimizing; lazy-load expensive tools, avoid duplicate fetches and repeated calculations, and use workers where evidence justifies it.
- Finish each repair with a focused regression test and the originally failing browser scenario. Run the full suite/build at sensible checkpoints; avoid repeated long builds before an export audit batch is ready.
- Do not claim “best in the market” from passing tests. Benchmark a few representative real survey jobs against established tools with a qualified surveyor, checking numerical agreement, completion time, errors, file interoperability and review effort.
- Most useful near-term validation: a few surveyors complete real jobs with independently checked outputs and state whether they would pay for the time saved. No guaranteed-success business claim is justified yet.

## Final report expected from Gemini

Provide a concise owner-facing result plus a detailed evidence file: which survey types are browser-verified, which defects were fixed, exact tests/build/deployment evidence, representative output files, measured performance change, and explicit remaining limitations. Distinguish **tested**, **implemented but not browser-verified**, **blocked by missing evidence**, and **not implemented**. Never summarize this entire handoff as “everything is fixed.”

## Continuation checkpoint — 2026-09-14

- Full regression after the non-cadastral fixes: **208 suites passed; 2,785 tests passed; 1 skipped; 1 snapshot passed**.
- `npx tsc --noEmit` passed. `npm run build` passed after the safe webpack configuration was restored; Next compiled successfully, generated 212 static pages, and prepared the standalone output. A trial disabling Next's default vendor groups caused a Node heap-out-of-memory build after roughly nine minutes and was reverted.
- Fresh bundle-budget result from the successful build: **633 KB landing initial JS**, within the 1,000 KB gate; **110 KB shared first-load JS**. The standalone startup scripts already isolate the marketing shell and lazy route overlays. The HTTP startup measurement could not fetch `https://metardu.space` from this environment.
- New focused evidence covers levelling zero readings, route-length closure allowance, no fabricated opening RL, valid RL=0, vertical-sight finite output, signed cut/fill, closing-benchmark evidence, and deformation input validation.
- Browser recheck and Docker rebuild/deploy remain blocked in this environment by the automatic usage-limit review. Do not treat the successful local build as proof that the latest image is running at `metardu.space`; run the desktop compose build/deploy and the fictional browser scenarios once the review limit permits it.
