# METARDU continuation: Mohammed Dosho field-to-deliverable audit

Prepared 21 September 2026. Read this FIRST, then the older GEMINI_HANDOFF.md for historical detail. This document supersedes historical status claims. It is not a certification of the application or its survey outputs.

## Owner's intended outcome

Continue as Mohammed Dosho, a fictional young surveyor completing realistic jobs, combined with an experienced software engineer reproducing and repairing defects. Use the actual browser workflow, save/reopen data, calculate independently, inspect exported drawings/reports, and deploy tested changes to the desktop Docker site at https://metardu.space. Prioritize cadastral, map usability/dark mode, and stakeout; apply the same process to other survey types. Clarify what customers pay for and why. Reduce unnecessary startup work. Keep a precise handoff if interrupted. Do not promise perfection, regulatory acceptance, market superiority, or guaranteed revenue.

Simulated measurements are fictional QA data, not actual field observations. Do not use invented licences or benchmarks in documents represented as professional deliverables. Real instrument precision requires real hardware/field validation and independent professional review.

## Environment and preservation

- Windows PowerShell, C:\Users\user\Desktop\METARDU. Next.js 15; inspect package.json for versions.
- Hosting is Docker Desktop on the owner's PC. Oracle VM is stopped for cost reasons. Do not provision paid services.
- Docker was healthy at the start of this pass: app localhost:3000, PostGIS, Redis, Python worker, collaboration, NTRIP and backup services. September 14 Docker/usage blockers are historical, not current.
- Large pre-existing dirty worktree. Preserve all unrelated work. No reset, clean, wholesale file replacement, volume deletion or unsolicited commit. No new credentials, charges, external messages or actual registry submissions.
- Do not print .env, secrets or QA passwords. Existing QA credentials are in live-test-results/cadastral-browser-fixture.json; use them only for the existing site.
- Use UTF-8 explicitly for source/document reads and writes. Prefer patches. Check applicable AGENTS.md. No root AGENTS.md was found this pass.
- Avoid concurrent builds. App-only deployment: docker compose up -d --no-deps --wait --wait-timeout 120 metardu-app. Never run down -v.

## This pass: reproduced and repaired locally

1. Global /map: selecting Layers > Dark produced a blank map. Real OpenLayers XYZ URL generation left literal {r} in tile URLs. Removing it uncovered a second LIVE failure: CARTO tiles are stamped API KEY REQUIRED. Latest source replaces CARTO with an OSM source and a separate metardu-dark-basemap canvas class; globals.css darkens only that canvas. OSM attribution stays intact. This latest replacement needs deployment and visual verification; the first deployed repair still has CARTO watermarks.
2. Basemap opacity showed 10000%. State was 100 although slider expected 0..1; handler divided by 100 and faded the survey drawing layer. State now starts at 1, handler updates the four basemaps, preserving drawing opacity and thematic overlays.
3. Stakeout: missing accuracy displayed +/-0.0m; no GPS fix created fake zero distance/bearing; close proximity was ARRIVED and speech said On target! Mark point. Panel could auto-hide after three seconds. Now missing values remain unknown, no fix leaves state null, close means NEAR TARGET, speech asks for instrument verification, panel stays cancellable. Buttons are 44px, panel has opaque dark backing and navigation limitation text.
4. Bearing DMS could show 359 degrees 59 minutes 60 seconds. Rounding now carries seconds/minutes and wraps 360.
5. Homepage advertised Pro KSh500 while checkout catalogue charges KSh2500; Team seats/pricing also diverged. Landing now reads monthly prices from PLAN_CATALOG and included Team seats from the same source. Removed unsupported homepage annual selection (checkout currently has no annual selection), removed unsubstantiated Most Popular badge, narrowed advertised features. Prices in catalogue and checkout were NOT changed.
6. Homepage explains observations -> calculations -> reviewable documents/CAD, and no longer claims finished/regulator-validated outputs in hero copy.

Files changed in this pass: src/app/map/hooks/useMapBasemaps.ts; src/app/map/hooks/useMapInteractions.ts; src/app/map/MapClient.tsx; src/lib/map/stakeout.ts; src/lib/map/stakeoutVoice.ts; src/components/map/StakeoutPanel.tsx; src/components/landing/PricingSection.tsx; src/app/page.tsx. Tests: tests/map-field-navigation.test.tsx, tests/landing-pricing-consistency.test.tsx.

Validation: seven new navigation tests initially failed for the intended defects, then passed; additional opacity test passes (eight navigation tests). Pricing regression initially failed and passes after repair. TypeScript --noEmit passed. Full Jest run then passed: 210 suites, 2794 tests passed, 1 skipped, 1 snapshot; 234.898s. Log: live-test-results/sept21-regression.log. Git diff --check passed, with pre-existing CRLF conversion warnings. Tests use React DOM directly because this local install lacks @testing-library/dom.

Deployment status: first build completed and app-only deployment passed Docker health checks. Live map opacity now shows 100%. A subsequent build was cancelled to include the newly discovered CARTO replacement; latest build is running (tool session70735), log live-test-results/sept21-final-build.log. Do NOT deploy a stale image or call the newest changes live before checking build success and browser results. Check final verification note below before repeating work.

## Live observations and remaining map tests

- Public /map loaded with existing anonymous session. Layers > Dark was blank, opacity label 10000%. Set Out > Start Stakeout showed a clear Pro upgrade message. No genuine GPS permission/position was obtained or simulated through the browser this pass.
- Browser console captured React hydration error 418 at first load. Investigate source/build theme/date/local storage rendering; do not suppress it blindly.
- Viewport was narrow (~660px). Mobile layers sheet occupied most of the map. Check 360px, 768px and desktop after changes; all dock controls and cancel must remain reachable.
- A coordinate readout showed UTM E/N alongside EPSG:3857; investigate display CRS labeling independently of map-view CRS.
- Test OSM/Dark/Satellite/Terrain switches, opacity 100/50/0%, pan/zoom, drawn geometry staying visible, print attribution and tile-failure feedback.
- Stakeout still needs timestamp/fix freshness, correct target CRS locked across changes, named target/design elevation persistence, configurable job tolerance, explicit observation/acceptance records and residuals. Phone location is reconnaissance guidance. Do not mark points accepted based on 1m proximity or chimes.
- Voice still supports proximity-only navigation; verify invalid/stale fixes stop guidance. Test denial, timeout, losing GPS, cancel and reselect target. Do not silently accept location permissions on behalf of the owner without applicable authorization.

## Cadastral fixture and document acceptance

Existing fictional project bb085558-ba63-4837-b7ba-1a1b437eeaa5: QA CADASTRAL — FICTIONAL 100 x 80 m PARCEL. QA account id cac11ecb-b399-4e83-aed2-725fbb87f497. Start E500000 N9900000, Arc1960 UTM37S. Traverse A1->A2 north80m, A2->A10 east100m, A10->A3 south80m, A3->A1 west100m. Expected sequence A1,A2,A10,A3; area8000m2=.8ha; perimeter360m. Preserve zero elevations and unknown elevations distinctly.

Old artifacts are under live-test-results/cadastral-generated. The open storage PDF ending 7352895b-working-diagram-bb085558-ba63-4837-b7ba-1a1b437eeaa5.pdf is an OLD artifact, not proof of latest code.

Complete through browser: authenticate existing QA account; reopen fieldbook; compare saved observations; compute; inspect QA; generate each document; download/open each. Independently check geometry, point order, bearings, distances, units, datum/projection/zone, north arrow, scale bar, legend, title, project identifiers, source/revision/date, licence blanks, review status, and page margins. Check working diagram A3 line/table extents (TABLE_X+TABLE_W); preview must not consume official sequence numbers. Review deed plan, area/traverse reports, coordinate schedules, C22 and statutory workbook, DXF/LandXML/shapefile and full package manifest. Missing required artifacts must fail, not be replaced by empty files.

Use fictional-invalid identifiers already on QA project. Do not infer cadastral legal acceptance from package generation. Recheck current requirements from official sources and get practitioner review before claims. Positive RIM requires exactly one saved rim_sections record with parcels/beacons; do not label unsupported input as successful RIM output.

## High-priority numerical/integration issues: audited, repaired, and verified (Completed this pass)

The source-audit findings identified across non-cadastral calculation engines were systematically reproduced with dedicated unit test suites, repaired according to classical surveying textbooks (N.N. Basak *Surveying and Levelling*, Ghilani & Wolf *Elementary Surveying*) and statutory standards (Survey of Kenya RDM), verified with 30 passing test assertions, and deployed into the Docker Desktop container (`metardu-app` healthy):

1. **Leveling Engine & Runner (`src/lib/engine/leveling.ts`, `src/lib/compute/levelingRunner.ts`)**:
   - Fixed turning point sequencing: foresight is evaluated against current setup HI to establish the turning point RL *before* backsight is evaluated to establish the new setup HI.
   - Removed hardcoded `distanceKm = 1` default. If closing RL or distance is missing/invalid, `allowableMisclosure` is set to `undefined` and `isAcceptable = false`.
   - In `levelingRunner.ts`, invalid non-numeric inputs now throw explicit errors identifying station and column; empty/null chainages are filtered to prevent false route-length spans; unconstrained runs report status `'unknown'`.
   - Verified by `tests/leveling-numerical-evidence.test.ts` (7/7 passed), `src/lib/engine/__tests__/leveling.test.ts` & `leveling-standards.test.ts` (all passed).

2. **Engineering & Topographic Auto-Calculate (`src/lib/workflows/autoCalculate.ts`, `src/components/workspace/DynamicFieldBook.tsx`)**:
   - Engineering HPC: Turning point RL ($RL_{TP}$) is carried forward to establish the new instrument setup height ($HPC_{new} = RL_{TP} + BS$) rather than resetting to the opening BM.
   - Topographic Tacheometry: Prevents compounding elevation drift by referencing station instrument RL; converts Zenith angles ($VA \in [45^\circ, 135^\circ]$) to vertical elevation angles ($\theta = 90^\circ - VA$) before calculating $\Delta Z = HD \cdot \tan(\theta)$.
   - DynamicFieldBook: Added inputs for Opening Benchmark RL, Closing Benchmark RL, and Route Distance (km) on engineering surveys with live misclosure badges; replaced misplaced cross-section logic with radial point reduction reporting for topographic surveys.
   - Verified by `tests/non-cadastral-computation-evidence.test.ts` (10/10 passed).

3. **Geodetic Ground-to-Grid Reduction (`src/lib/engine/geodeticReduction.ts`)**:
   - Corrected inverted hemisphere heuristic: In UTM Southern Hemisphere (e.g. Kenya UTM 37S where Equator is $10,000,000\text{ m}$ and Nairobi is $\sim 9,860,000\text{ m}$), $N \ge 5,000,000\text{ m}$ correctly maps to Southern Hemisphere. Latitude now correctly computes as $-1.26^\circ\text{ S}$ instead of $+88.7^\circ\text{ N}$. Added explicit `hemisphere?: 'N' | 'S'` input parameter.
   - Removed silent $-15.0\text{ m}$ geoid fabrication; unsupplied geoid undulation defaults to 0 with explicit `(unsupplied / assumed zero)` annotation.
   - Verified by `tests/geodetic-reduction-evidence.test.ts` (4/4 passed).

4. **Deformation Monitoring (`src/lib/survey/deformationMonitoring.ts`)**:
   - API compatibility: `compareEpochs` supports both positional arguments and single-options object.
   - Robust monument ID parsing: Coerces object keys and trims strings cleanly.
   - Replaced diluted 2D test with quadratic $\chi_2^2$ Mahalanobis distance ($T_H = \sqrt{(\Delta E/\sigma_E)^2 + (\Delta N/\sigma_N)^2}$ compared against $\sqrt{\chi_2^2}$ critical values 2.448 for 95% / 3.035 for 99%).
   - Added two-tailed 1D vertical displacement test ($T_V = |\Delta H| / \sigma_H$ vs 1.960 for 95% / 2.576 for 99%).
   - Strict alert trigger: Any monument exceeding physical tolerance triggers an alert, preventing measurement noise from masking movement as 'STABLE'.
   - Verified by `tests/deformation-monitoring-evidence.test.ts` (4/4 passed).

5. **Volumetric Computation & Surface Cut/Fill (`src/lib/engine/volume.ts`, `src/lib/engine/solution/wrappers/volume.ts`)**:
   - Prismoidal even-section rule (Basak Ch. 8): Pairs intervals prismoidally; any remaining odd single interval (and 2-section surveys) is evaluated using the End Area method rather than being truncated or returning 0.
   - Bounded IDW interpolation: Removed unconstrained nearest-neighbor fallback (`if (nearestD2 < Infinity) return nearestZ`). Points outside `maxDistance` evaluate to `null`, correctly skipping un-surveyed grid cells and emitting warning logs.
   - Verified by `tests/volume-numerical-evidence.test.ts` (5/5 passed), and existing `volume.test.ts` & `volume_extended.test.ts` (17/17 passed).

Combined test status: 30 passed across all 5 new suites; `tsc --noEmit` passed with 0 errors. Deployed into `metardu-app` container (Docker healthy, HTTP 200).

## Other survey jobs: use the same acceptance route

For EVERY job: create clearly fictional project -> set CRS/control/units -> capture/import -> save/reopen -> compute independently -> review quality flags -> draft -> export/open -> change one observation -> ensure recalculation and all exports use the new revision. Exercise invalid inputs, disconnection/reconnection and access boundaries. Keep screenshot/file evidence and actual vs expected numbers. Unsupported features are explicit blockers, not completed jobs.

1. Engineering leveling: fixture above; a deliberately bad closing benchmark; unknown route length; a documented route length. Verify tables, adjustment rationale and benchmark references.
2. Topographic: independent local-coordinate flat plane and sloped plane grid with a breakline and boundary; height0 vs missing height; verify contours, no extrapolation outside boundary, section and DTM provenance. Test duplicate XY and collinear data.
3. Construction/setout: design target E500010 N9900020 from E500000 N9900000 yields dE10,dN20,distance sqrt(500)=22.3606798m and clockwise-from-north bearing26.5650512deg. Test all quadrants and DMS rollover. Keep actual residual/receiver quality separate from navigation offset.
4. Geodetic/GNSS: independently reference known control transformations and ground-grid reduction; baseline processing only if raw observations and implemented solver truly exist. Do not relabel a coordinate converter as GNSS baseline software.
5. Drone: distinguish GCP planning/checkpoint accuracy from image processing; test GCP distribution, independent checkpoints, CRS and height datum. No orthomosaic/point-cloud claims without implemented processing and inspected outputs.
6. Deformation: identical epochs, known horizontal displacement, known vertical-only displacement, missing points and uncertain epochs. Report uncertainty and significance method.
7. Earthworks/route: analytic constant section/linear section fixtures; volumes with explicit method, spacing, area units and surface boundaries; drawing stationing and offset convention.
8. Discover any additional advertised mining/marine/industrial workflows. Inventory claims, implement only scoped verified support or clearly identify unavailable functionality. Do not imply all survey disciplines were tested by testing a shared calculator.

## Monetization and layout direction

Current checkout catalogue Pro KSh2500/month; no price changes made. Homepage now matches. Annual catalogue values exist but checkout has no interval handling: audit /pricing and all payment paths before advertising annual billing elsewhere. Test provider sandbox success/failure/cancel, signed callback verification, duplicate callbacks, access expiry and invoices without real charges. Never give a plan simply because a redirect says success.

Best working hypothesis: help a small survey office turn captured observations into consistent, reviewable drawings and reports with fewer re-entry errors. Run five consented pilots on one narrow cadastral workflow, record baseline/completion time, corrections needed, and whether they pay or return for a second job. Consider a per-project pass ONLY after testing demand and implementing clear entitlements; do not invent a guaranteed winning price.

Proposed copy: "Your survey observations, calculations, drawings and reports in one browser workspace. Start with one free project; upgrade when you need more projects and export options." Show a fictional sample deliverable and a short verified job walkthrough. No unsupported regulatory approval, centimetre phone accuracy, popularity or revenue claims.

Current primary-source comparison: QField https://qfield.org/ emphasizes QGIS field collection and cloud sync; MicroSurvey https://www.microsurvey.com/products/fieldgenius/features/ provides instrument-focused collection/staking. These establish a high bar; they do not prove METARDU superiority. Differentiate with a demonstrated local deliverable workflow and price transparency.

Layout proposal (not a wholesale redesign implemented here): project-first workspace with Plan / Capture / Check / Draft / Deliver navigation, map as main canvas, one contextual side panel, persistent project CRS/control/fix/sync status. Drafting needs model vs paper units, snapping/constraints, layers, dimensions, scale, revision-linked title blocks, undo and print preview. On phones prioritize record observation / select target / accuracy / save / cancel; move rarely-used layers/export options behind a drawer.

## Startup and deployment checks

App need not load CAD/3D/AI/instrument drivers at startup. Profile cold landing, project open and map open separately. Defer heavy modules until their tool opens; memoize only measured hot paths; limit worker/service startup to needed capabilities without breaking background synchronization. Measure Docker idle RAM/CPU separately from browser JS and build memory. Desktop uptime/network must be explained before selling cloud availability.

Historical landing figures (NOT newly measured): 633KB raw initialJS under1000KB budget; Next shared110KB uses different accounting. Older claim that default vendor cache groups were disabled is incorrect; that attempt was reverted after OOM. Inspect current next.config before tuning. Do not widen budgets or hide type/test failures to call optimization done.

Useful commands: node node_modules/typescript/bin/tsc --noEmit; node node_modules/jest/bin/jest.js tests/map-field-navigation.test.tsx tests/landing-pricing-consistency.test.tsx --runInBand --silent; npm run budget:landing; docker compose ps; docker compose build metardu-app. Run relevant regression suites, then required release checks. A build is not a browser or professional validation.

Before deployment record current app image ID for rollback; retain it. Deploy app only, health check, inspect migrations without exposing secrets, open public hostname and reproduce the repaired workflows. If failed, restore previous image/container configuration without touching database volumes. Report exact passed/failed/blocked results; never say finished because checks merely compile.

## Historical interim note — superseded by CURRENT STATUS below

Latest build still pending at this update. Broad survey jobs and independent document review remain incomplete. This section supersedes earlier pending-build/account notes.

- Account blocker diagnosed: the old browser JWT referenced a user ID absent from the current database. Project creation failed with projects_user_id_fkey; zero projects with the new QA FICTIONAL prefix were created. The older cadastral project belongs to a separate QA account and its four saved observations remain intact. Do not transfer ownership or weaken authorization to make the test pass.
- Owner signed out but could not use the old password. scripts/recover-local-password.ps1 was created with hidden secure prompts, an existing-account-only transaction, bcrypt hashing and reset-token invalidation. The OWNER ran it and supplied success output at 02:52 EAT on21Sep. Recovery SUCCEEDED; the obsolete Compose version warning is harmless. No passwords were read or recorded by the agent. Chrome is still at login as of the latest check; ask the owner to sign in with the new password, not run recovery again. SMTP and Google login credentials were unconfigured in the running app (boolean check only). Customer recovery/onboarding remains a deployment configuration gap.
- New distance repair: src/lib/engine/solution/wrappers/distance.ts rejects nonfinite coordinates and coincident-point bearings; src/app/tools/distance/page.tsx rejects blank/invalid numbers and invalid slope ranges, clears results on Calculate and shows a useful error. tests/distance-input-evidence.test.ts covers independent known coordinates and invalid cases. Existing engine-wide zero-distance conventions were not changed. Stale results after editing but before Calculate still warrant UX review.
- Latest local validation: all14 tests in map-field-navigation, landing-pricing-consistency and distance-input-evidence passed after the OSM replacement; TypeScript --noEmit passed. Earlier full2794-test result predates the final distance/dark-source changes and is not a fresh full-suite claim.
- Expanded homepage wording removes several unsupported regulatory approval, field accuracy, speed and customer-popularity claims; FAQ qualifies offline availability and monthly checkout. Audit other pages separately.
- First deployed image is retained as metardu-metardu-app:sept21-map-verified-base (the tag name does NOT mean its dark map works; it still uses CARTO). Attempt to preserve the original pre-session image failed because Docker no longer had that image ID. Do not claim a pre-session rollback image exists. No database volumes were removed. Latest build includes Dockerfile cache permissions, distance repair, expanded homepage copy, and OSM dark replacement.

- Owner signed into Chrome (not the Codex in-app browser). Chrome session has Enterprise access. Existing fictional project opens but Field tab says Unable to load the saved field book. Investigate API ownership; do NOT weaken ownership controls. Create a separate fictional QA job under this account instead of transferring project ownership. Project creation was initiated through the UI; verify final URL and avoid duplicate submissions while Creating is shown.
- Live Distance & Bearing calculator passed E500000/N9900000 -> E500010/N9900020:22.360679774997898m,26.56505117707799deg; back bearing206.565051177deg. Coincident points incorrectly display north0deg/back180deg; this display bug remains to fix. Invalid text parsing and stale displayed results also deserve testing.
- Docker logs exposed repeated image-cache EACCES errors. Fixed current running app narrowly: created /app/.next/cache and assigned nextjs:nodejs ownership. Verified writable as normal container user. Dockerfile now creates/chowns that directory for persistent future deploys. This runner-only change was made after the current build started: rerun build after it completes to include it (Dockerfile excluded from source COPY, so completed compilation should be cached).
- Resource snapshot DURING build/testing (not idle baseline): app400.1MiB; worker50.93MiB; Postgres57.14MiB; collaboration26.82MiB; Redis16.36MiB; NTRIP16.29MiB; backup1.42MiB. CPU snapshot is not representative of idle use. Host/WSL/build memory is additional.
- New-project form has mojibake labels (UTM zone, hemisphere, preset icon); not fixed. Homepage still has other overclaims in workflow comparison, feature descriptions and FAQ beyond corrected hero/pricing. Audit all published claims against actual verified behavior.

## CURRENT STATUS — read this over earlier interim notes

Owner recovered password and signed into Chrome successfully. Do not ask for another reset. New owner-account fictional job created through UI: 0e7f1a12-2e1f-4b33-91ba-27dca290426c, QA FICTIONAL — Mohammed Dosho cadastral rectangle 2026-09-21. Chrome tab41708130 at https://metardu.space/project/0e7f1a12-2e1f-4b33-91ba-27dca290426c/documents. Super-admin/Enterprise session; normal paid-user entitlements still unverified.

Saved starting A1 E500000 N9900000 and four grid legs A1->A2 0deg80m; A2->A10 90deg100m; A10->A3 180deg80m; A3->A1 270deg100m. Reloaded and verified all four observations and control persisted. Computed through Step3:8000m2,.8ha,360m perimeter,0.0000m displayed misclosure. Correct ordered coordinates A1(500000,9900000), A2(500000,9900080), A10(500100,9900080), A3(500100,9900000). Unknown elevations/monuments left blank. Angular closure correctly PENDING. General compute/QA UI still shows huge precision denominator from floating roundoff; document formatter repaired separately.

OSM dark map IS DEPLOYED and visually verified: no CARTO watermark, OSM attribution retained. Opacity100%, keyboard45% then50% then100% verified. Programmatic range fill changed DOM without React state, so test via keyboard/pointer. Overlay separation unit-tested, not visually checked with drawn geometry.
Current deployed config c6c5589168d098b5e8a6d0493d5ffc30dcc13d96db3d8a71fb8c933ae4f537fd; manifest-list2d34fb2e981ba85b79d6326da83a5781e709ca9b74df10368487d387b008f7c9. App-only deployment healthy, cache writable,69 migrations matching checksums/no ghosts. Compose obsolete version removed; config --quiet passed.
Landing initialJS measured from deployed manifest:20chunks,649318raw bytes/192976gzip (634KiB/188KiB). Not map loading, all network payload or idle memory.

Critical document defect reproduced LIVE: Computation sheet printed EMPTY coordinate table with false independent-check certification. BAD OLD preview Chrome tab41708154/about:blank. Root cause: Documents loaded survey_points only, but cadastral pipeline saves boundary_data.adjustedStations; traverse/area states never assigned. Plan also fabricated a sample rectangle when missing boundary; shapefile line endpoints were zero.

NEW SOURCE repairs awaiting document-build deployment:
- src/lib/reports/documentEvidence.ts resolves ordered saved adjustedStations, area_sqm, closure/perimeter/source/time; normalizes finite numeric DB strings, preserves unknown elevations, distinguishes boundary/control. Malformed computation rejects; absent/invalidated computation yields no boundary.
- Documents page consumes resolver; no invented polygon, no found-monument assumption, supported recorded ARC1960/WGS84 only for plan. Shapefile endpoints use actual boundary coordinates and matching ellipsoid. Numerical closure replaces unsupported accuracy-order badge. Identity fields now accurately session-only (previous Saved to your profile was false). Errors visible; blocked popup not marked Generated.
- documentPackage.ts: DRAFT NOT CERTIFIED header, recorded datum, A4 margins/repeated headers. Computation rejects empty coordinates, includes closure/area/source/time, angular closure unverified, removes certification assertion, fixes reciprocal precision. Missing area prevents area statement; no automatic legal-validity claim. Cover letter removes automatic compliance/review assertions and escapes enclosure strings. All boundary stations available for beacon descriptions; no default monument condition.
- New-project page garbled labels fixed; Road Engineering preset unsupported medium -> supported small. Whitespace-only normalization after build snapshot does not alter runtime behavior.

Validation: document-package-evidence5tests pass; TypeScript --noEmit passes. LATEST FULL SUITE212suites,2804passed,1skipped,1snapshot,238.791s; log live-test-results/sept21-documents-regression.log. Document build session26575, log live-test-results/sept21-documents-build.log: compile and type checks passed; generating212static pages at last check. NOT deployed yet. Retain current running image, await success, app-only deploy, health/cache/migration checks, then new browser document generation.

Automatic approval review disconnected twice before distance test and once before handoff write; those actions were NOT executed. User said continue; normal shell checks now work again. Retry browser through normal review, never bypass via another automation method. Distance repair is deployed but live coincident-point test still pending.

Immediate continuation: finish document deployment; reload same fictional project and generate NEW computation sheet/area statement; inspect4coordinates,8000m2,.8ha,360m,Arc1960/37S,blank heights,draft status and physical page layout. HTML preview alone is not downloaded-PDF validation. Change one FICTIONAL observation, verify invalidation, restore/recompute; independently inspect DXF/shapefile. Team collaboration displays Disconnected/Offline and remains unresolved. Other generic certificate/control/leveling templates still have unsupported defaults/declarations; draft banners do not complete their review. Stale missing-user JWT needs reauth response; customer email recovery/OAuth still unconfigured. Continue broader numerical issues and survey matrix above; no professional/receiver validation claim.

### LAST CHECK: document image BUILT, deployment BLOCKED

Document build completed successfully: config133c0fc82a98d9903532efd8dadee1ba1edcea94d6a7e170c3efce3631e19bce; manifest-list7857328664dcde7f3f4fb4c8abed6ce9735547049e50ebc0336c3e01eb2c2d90; latest tag metardu-metardu-app:latest now points to this NEW document image. It has NOT been deployed. Running app remains the earlier verified OSM-map release.

Before deployment, docker inspect metardu-app --format '{{.Image}}' failed inside sandbox (Docker pipe access denied). Required escalated retry was blocked by the same automatic approval-review connection failure. No inspection/tag/deploy action executed after that failure. Browser action retry was also blocked. Do not bypass approval review; restore its connection or let the owner/delegated agent continue using normal authorized tooling.

Once access works: inspect and retain actual running image under a clearly named rollback tag; docker compose up -d --no-deps --wait --wait-timeout 120 metardu-app; verify app image matches new document image, health, writable cache,69 migrations, then live UI/document acceptance above. All documents/workflow defects listed as remaining are still remaining; no complete-product or professionally validated claim is justified.
