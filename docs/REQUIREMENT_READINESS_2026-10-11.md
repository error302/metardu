# METARDU requirement readiness — checkpoints through 22 October 2026

Latest codebase-intelligence checkpoint (22 October): pinned Fallow 3.34.1
completed local graph/duplication/complexity analysis, with findings reviewed
against actual source. A confirmed malformed legacy migration entry point now
fails deliberately with supported guidance and no database client; three
regressions pass. Large candidate counts, five import cycles, parser limitations
and unconfigured architecture rules remain visible. Both pinned npm analysis
aliases executed; the architecture command correctly exits one for five cycles,
while combined JSON identifies its failing finding gates as unenforced.
No production changes occurred. See [Fallow review and application](FALLOW_CODEBASE_REVIEW_2026-10-22.md).

Latest verification-pipeline checkpoint (22 October local time): five maintained
native RTKLIB tests and hash-pinned public RINEX fixtures are now wired into the
existing worker CI job. The exact native command passes locally in the existing
worker, and replayed historical defects fail for verified reasons. Missing
RTKLIB fails the gate. GitHub-hosted execution/package installation remains
unverified; no deployment occurred. See [maintained native gate](GNSS_NATIVE_ACCEPTANCE_2026-10-22.md).

Latest native GNSS checkpoint (22 October local time): the actual installed
RTKLIB exposed rejected enum settings in the checkout wrapper. The serializer
and zero-exit diagnostic guard are repaired. Full worker source tests pass 83
with two network checks skipped; controlled native reference runs produce
FIX/FLOAT, respond to a base shift and reject SINGLE and configuration errors.
The running worker handler remains unchanged and its artifact gap is open. This
is native consistency evidence, not surveyed control or field accuracy. See
[native GNSS acceptance](GNSS_NATIVE_ACCEPTANCE_2026-10-22.md).

Latest recovery checkpoint (22 October local time): the approved source repair
requires verified database/uploads archives and configured copies before success
or retention, refuses archive overwrites, validates restore input before database
contact, withholds connection credentials and uses transactional stop-on-error
psql flags with honest safety-backup status. All 30 maintained synthetic cases
pass with zero skipped; security/migration and CI configuration checks pass.
The inspected running sidecar retains the older failure paths. Offsite/encryption
are unconfigured there; real restoration, Alpine compatibility, CI execution and
promotion remain unverified. No customer restore or runtime change occurred. See
[recovery repair and evidence limits](RECOVERY_FAILURE_PATH_AUDIT_2026-10-22.md).

Latest advisory checkpoint (21 October): the existing lockfile audit passes its
current policy: runtime has zero reported advisories; the full graph has eight
high and 21 moderate affected-package entries stemming from three advisories,
all affected nodes marked development-only in the lockfile. Build-tool review
remains open. The static security/migration gate also passes. No dependencies or
production services changed. See [dependency evidence and limits](DEPENDENCY_ACCEPTANCE_2026-10-21.md).

Latest full ordinary Jest checkpoint (21 October): 5,441 tests pass across 601
executed suites, with nine native checks skipped, zero failures and one existing
snapshot passing. Tested source/config remained unchanged, including the existing
uncommitted survey-plan work. Separate online-service probes still reproduce
invalid identity successes, rejected zero northing, inferred target grids,
unsupported precision claims and an Arc 1960 inconsistency confirmed against host
native PROJ. The explicit-CRS architecture is now approved; the committed written
specification awaits review before implementation planning. These defects remain
unrepaired. See [online transform audit and full-suite limits](ONLINE_TRANSFORM_AUDIT_2026-10-21.md).

Latest coordinate checkpoint (21 October): the API transform path now uses the
shared CRS authority, accepts the documented EPSG request, preserves precision and
heights, and rejects invalid batches without zero-coordinate substitutes or a
success log. The legacy helper no longer guesses a UTM zone or missing height.
Five focused suites pass 140 tests; typing, scoped lint and security checks pass.
This source-only result retains explicit legacy parameters with applicability
notes; it does not establish regional control accuracy or live behavior. See
[coordinate transform integrity](COORDINATE_TRANSFORM_INTEGRITY_2026-10-21.md).

Latest GNSS checkpoint (21 October): the source RINEX panel invalidates results on
all input changes and suppresses obsolete/unmounted callbacks. Server/client
measurement validation fails closed, and client metadata must match submitted
control/settings. Seven focused suites pass 65 tests; strict app/test typing
passes. These are source checks; metadata echoes are not worker attestations and
the production worker artifact gap remains. See
[GNSS result integrity and acceptance limits](GNSS_RESULT_INTEGRITY_2026-10-21.md).

Latest worker checkpoint (21 October): host Python source tests pass 58/58 with
two network checks skipped; release/upgrade helper tests pass 13/13. The new
read-only worker artifact guard has six passing contract tests, but its actual
production run fails: LiDAR/OSM source modules, three required distributions and
the LiDAR task declaration are absent, while main/requirements differ. Ordinary
production health passes independently. No worker was rebuilt or restarted. See
[worker acceptance and release gates](WORKER_ACCEPTANCE_2026-10-21.md).

Earlier application-wide source checkpoint (21 October): the full ordinary Jest suite passed 5,379
tests across 597 executed suites, with nine native checks skipped and zero
failures. The working tree was unchanged during that run, including the existing
uncommitted survey-plan work. This is source evidence, not an isolated release
artifact. The QA area-cache collision, missing numerical area evidence and stale
save-status races are repaired; see [QA evidence integrity](QA_EVIDENCE_INTEGRITY_2026-10-21.md).
Strict app/test typing, scoped lint and the security gate pass. Read-only runtime
verification confirms the existing production stack healthy; this source was not
built, migrated or promoted. Fieldbook migration 115, the separate synthetic DB
approval, native browser/device/field acceptance, CI coverage/native worker gates,
backup restore and complete paid/provider workflows remain open. Earlier release
and access-failure statements below are dated historical checkpoints.

Latest outcome (18 October): see `OBSERVATION_IMPORT_RELEASE_VERIFICATION.md`.
Production is healthy `80940bf7`, with all 118 applied entries and original
hashes/checked records preserved. Typography, pricing-copy, CAD/import and auth
repairs are live; 26 private HTTPS and 20 public checks pass. The legacy import
schema failure is repaired by additive migration 113. The road-quantity source
HTTP run now passes 25 checks. Browser recovery, full offline/field acceptance,
provider transactions/delivery and consent gates remain separately documented.
Older failed cutover and source-only statements below are historical checkpoints.

Latest release update: pinned application source `eac2835e` is now deployed with
all 115 migrations, unchanged historical hashes and checked customer-record
preservation. The single production application and required services are healthy.
Thirteen live HTTPS checks cover selected private alignment/pipeline reads,
cross-account denial, profile authority protection and ordinary editing. Exact
QA records were removed. Build, recovery-review and source-upgrade evidence are
in `SURVEY_RELEASE_PREPARATION.md`; these do not replace the outstanding
interaction, provider and field evidence in the table. The older dated events
below remain historical context.

This record tracks the user's workflow requests against source, browser, synthetic
HTTP and production evidence. A shipped build does not prove every interaction,
provider or field claim. On 12 October, production was image 44106f7a461e... and
release working-tree-03dc5697ba72209d; the notice/worker/mobile fixes were promoted,
with 46 actual production normal-account HTTP checks. On 13 October, the public
site briefly returned Cloudflare 530/1033 while the tunnel showed no replicas.
Starting the existing named tunnel through its existing token file with HTTP/2
registered four edge connections. Cloudflare then showed two Healthy replicas on
the same host, and repeat HTTP checks returned 200 for the homepage, pricing,
privacy, demo, help, tools, and public notice routes. Cloudflare's connector
precheck passes HTTP/2 to region 1 but reports region 2 unreachable, so tunnel
resilience still depends on outbound network access. `npm run docker:verify`
could not read Docker's process inventory due to a Docker pipe permission error;
this does not establish whether Docker is stopped. No app containers were created
or changed during this check.

| Request | Current evidence | Remaining proof / next work |
| --- | --- | --- |
| Practical drainage deliverables | Native PDF shipped; 28 source HTTP checks and 35 production normal-account checks pass, including actual private PDF/ownership/parser round trip; two-page production PDF independently inspected | Real control, instrument/receiver, engineering design approval and field pilot |
| Drainage pipe field set-out | Current project source validates the saved projected-metre CRS, manhole coordinates/chainages, pipe fall, manufacturer outside diameter and routed alignment; computes revisioned station coordinates plus interpolated invert/crown RL; leaves intermediate ground/cover explicitly unassessed. Focused current suites pass: 76 tests across eight suites covering the project drainage engine, pipe-network engine, project set-out API, both project drainage UI steps, standalone editor, pipe-network persistence schema, and project-linked pipe-network API | No production interaction or physical instrument/field validation in this pass; construction still needs approved route/design, surveyed intermediate ground, utility/cover checks and project-specific tolerances |
| Drainage pipe route and partial-flow interpretation | The project workflow persists map-derived or manually entered projected E/N bends and checks their length against manhole chainage; the standalone editor also accepts bends and blocks malformed coordinates. Developed alignment length drives hydraulic slope, auto-grade proposals, profile chainage, station schedules, plan views and DXF geometry. Both workflows distinguish full-pipe Manning rate from the higher open-channel peak (about 1.0757× full-flow rate at y/D≈0.938, derived from Manning circular-segment geometry; consistent with [FHWA HEC-22, 4th edition](https://www.fhwa.dot.gov/engineering/hydraulics/library_arc.cfm?id=189&pub_number=22) describing peak flow near 93% depth). Their solver uses the lower-depth root through the full-pipe rate and the near-crown root above it; flow beyond the peak requires pressure-flow analysis and receives no invented Froude number. Project outputs show the uniform-flow depth/velocity estimate or an explicit pressure-flow gate. Focused tests pass: 72/72 across eight suites; strict app and test TypeScript projects pass | Full storm-drain design against adopted local criteria, inlet/outlet control, downstream/backwater and hydraulic-grade-line analysis, production interaction, and physical field acceptance remain open. Standalone project persistence is implemented with owner-checked load/save, an atomic JSONB merge that preserves other engineering data, and a declared-CRS mismatch gate; source interaction tests pass, but production interaction is not verified. Screening does not replace design approval |
| Road survey preparation and point collection | Engineering project workflow saves a chainage range, station interval, left/right survey extents, selected road feature codes, required CRS reference and control/benchmark ID and source; the field collector loads the plan, guides chainage/code selection and captures GNSS or total-station points. A saved project reference-system record takes precedence over legacy datum/zone fields; legacy-derived references are labeled, while missing, corrupt, unsupported, or mismatched references block capture. NMEA latitude/longitude is transformed through the shared project CRS authority into the declared projected CRS; placeholder zero easting/northing values are never stored. The serial and BLE stream now feeds the field collector's explicit import action; road capture imports only the latest reading with the active chainage/code, while other surveys can import the stream. GNSS fixes are validated without rejecting valid zero latitude/longitude, total-station coordinates are not mislabeled as geographic coordinates, and road total-station imports require acknowledgement that the instrument uses the project's exact CRS. Duplicate instrument readings are rejected and source quality labels distinguish fixed, float, and differential fixes. Online validation binds the offline plan copy to the project CRS; old/unbound cached copies require online revalidation, and offline capture requires an explicit acknowledgement. Point IDs persist in synced note metadata, reload into the session, and set the next unused sequence; duplicate IDs are rejected. Capture stays paused until saved observations load. A point is acknowledged only after its local IndexedDB write succeeds; a storage failure leaves it available for retry. The road collector shows full feature-code labels and saved-code status for the active chainage before capture. Field preparation offers operator-applied start/end suggestions from saved design station limits and a project CRS suggestion; interval and control source remain explicit crew inputs. The connected-instrument Quick Field LSA and CSV traverse checks no longer invent zero angular closure from bearing/distance-only observations; they require observed angles or a closing azimuth before reporting a complete pass. The CSV workflow now uses the computed 1:X precision ratio directly, and the authenticated traverse API rejects missing measured distance, absolute bearing, or geographic coordinates needed for configured convergence instead of filling in zero bearings. The existing road/field suites plus new stream and CRS tests pass 24/24 across four suites; app/test TypeScript checks and scoped ESLint pass. | These are recorded instructions and coordinate transformations; they do not verify receiver configuration, GNSS fix quality, control, alignment approval, client scope/design, or field accuracy. Browser, production, desktop viewport, receiver, and field pilot remain unverified |
| GCP planning and photogrammetry exports | Candidate targets require an operator-entered, validated simple WGS 84 / UTM boundary; area is computed from that polygon and interior-spread targets remain inside it. Five is the minimum starting heuristic, with fabricated accuracy and coverage claims removed; WebODM describes five as a common minimum, while control layout remains project-specific ([WebODM GCP guidance](https://docs.webodm.org/ground-control-points/)). Planned coordinates cannot be exported. Export requires distinct measured coordinates, elevation, positive horizontal/vertical uncertainty, fixed RTK, and an explicit zone/hemisphere; zero elevation is preserved. Pix4D output follows its six-column WGS84 GCP shape. WebODM output is explicitly the GCP Editor Pro coordinate CSV in northing/easting/elevation/label order, not a finished image-mark file. Photo capture does not mark a point validated. Focused engine and panel tests pass 17/17; app/test TypeScript checks and scoped ESLint pass. | This is a source-level planner and manual observation form; it does not persist GCP records with a project, design control geometry from GSD/relief/flight overlap, verify receiver or control, attach auditable field photos, run an actual Pix4D/WebODM import, or prove field accuracy. Heights pass through unchanged and require the same vertical reference in the downstream project. WebODM coordinates require selecting the matching WGS 84 / UTM zone in GCP Editor Pro and still need image marking. Browser, production and field use remain unverified |
| GNSS RINEX baseline processing | Source contract repaired: RTKLIB now receives a real temporary config file, rover OBS before base OBS, a required known base latitude/longitude/ellipsoidal height, valid frequency and ambiguity settings, and strict FIX/FLOAT result parsing. Per-file limits are 25 MiB; processing runs outside the worker's async event loop. Focused Python subprocess-boundary tests pass 11/11; client tests pass 5/5 and cover file-size bounds and invalid-quality responses | Mocked tests do not prove RTKLIB numerical output. Need representative rover/base/navigation RINEX from known control, verified reference frame/epoch and antenna metadata, time overlap, supported binary execution, uncertainty/residual review and independent coordinate check. See [GNSS repair record](GNSS_RTKLIB_BASELINE_REPAIR_2026-10-12.md) |
| Complete general setting-out sheets | Shipped repaired template after source/native proof of all 50 points exactly once across three A4 pages, bounded table and repeated draft/reference headers. The verification harness now exercises the actual lazy registry caller `generateDocumentSafe('setting-out', ...)`; synthetic PDF inspection confirms A4 pagination, repeated headers/page numbers, and text within margins | Source now has a separate authenticated general-sheet workflow at `/tools/setting-out-sheet` with CSV/TSV parsing (including Excel UTF-8 BOM headers and strict decimal values), point preview, registered EPSG validation and coordinate-range checks, a rate-limited non-persistent PDF endpoint, and a prepared/checked signature block. Focused tests verify generated PDF content and route behavior; app and test strict typechecks pass. Production interaction after promotion, download ownership in the running container, and physical print-scale proof remain open. The `/tools/setting-out` instrument/stakeout workflow remains separate |
| Safe vertical setting-out inputs | Source route now requires finite station RL, instrument height, target height and an EPSG frame; it discovers and requires layer selection when multiple DXF layers exist. The extractor preserves zero RL, rejects malformed/missing E/N/Z without explicit fallbacks, and the engine rejects coincident station/backsight/target inputs. Targeted source suite passes 29/29 and app typecheck passes | Production route interaction after candidate promotion; instrument/receiver and survey-control evidence |
| As-built comparison integrity | As-built CSV now requires point ID/E/N, rejects malformed supplied RL, preserves omitted RL as unknown, clears stale comparison state on parse errors, and returns `INCOMPLETE` rather than a 3D PASS when vertical observations are missing. Numeric PASS copy explicitly requires separate control/specification/surveyor sign-off. Component source workflow test covers synthetic DXF upload, explicit CRS/RL/IH/TH computation, incomplete vertical comparison and stale-result clearing; focused survey suite passes 29/29. The shared AsBuiltSurveyPanel comparison now keeps unmatched observations in the denominator, reports them as not assessed, validates duplicate control chainages, avoids argument-spread limits, and shows no deviation statistic when no comparison exists | Production route interaction after candidate promotion and real field observations |
| As-built deviation screening page | `/tools/as-built-deviation` starts empty; fictional sample data is opt-in and the warning remains until both sample tables are replaced. Design and observation CSV templates/imports validate all rows before replacing a table; accepted columns are `chainage_m,design_rl_m` and `point_id,chainage_m,observed_rl_m,description`. CSV files are limited to 10 MiB and 20,000 data rows; results render 100 per page. The result CSV includes every point, declared vertical/tolerance references and formula-safe text. The page requires operator-declared vertical datum/control and tolerance-source notes, clearly labels them unverified. Profile interpolation is binary-searched only inside design coverage; invalid/duplicate controls and uncovered observations remain `NOT ASSESSED` with null deviations. All rows remain in the pass-band denominator; unsupported 95% compliance/KeNHA/RDM authority claims are removed. Focused engine, CSV, page and shared-panel suites pass 34/34; `npm run typecheck` passes | Numeric presets remain illustrative and were not verified against the current [KeNHA 2025 manuals](https://kenha.co.ke/document/updated-road-design-manuals-and-standard-specifications/) or [Roads Department archive](https://roads.go.ke/index.php/roads-and-bridges-manuals-specifications). Operator-entered datum/control and specification references are not independently verified. Production field interaction, receiver/control validation, regulatory acceptance and real field evidence remain open |
| CAD three-column tools and mobile use | Earlier `test-results/cad-workflow/browser/mobile.json`: 44/44/44 px tools, no overflow, synthetic point persistence; current production CAD worker proves two 100 m faces and 700 m unique edges | Fresh interaction/viewport review for the current build; physical touch/receiver proof |
| Professional contours, legend and export | Guards shipped; source and production DXF/CSV/SVG/A3 PDF downloads were completed through ordinary Chrome UI and independently parsed. Production worker completes in Chrome: 14 contours, two index contours, eight triangles; association and hashes are recorded under `test-results/contour-production-browser/current-release/` | Physical print scale, source quality, CAD application import and field acceptance |
| Client performance and offline loading | Production baseline records the 6,020,378-byte public chunk and confirms it is not initial for the checked routes. Contour tabs now lazy-load with accessible loading status panels; source preview generated 400 synthetic points successfully and switched through settings/map/export. | ANALYZE treemap did not complete, so no savings are claimed; candidate build and one planned app-only promotion remain required before production performance evidence |
| Desktop navigation and project map organization | Earlier source and promoted-production mobile CUA showed no overflow, six secondary map controls at least 44 px, and the map below the 65 px navbar. Current source removes the server-rendered blank desktop header, gives unauthenticated public routes public links, and groups the project map title, saved geometry kind, CRS, coordinate count, selected-point readout and Field Book action. An earlier source preview rendered `/` and `/map`; a narrow viewport screenshot showed the global map and its controls. On 13 October, a fresh unauthenticated production accessibility snapshot of `/map` loaded the global map, primary navigation, coordinate search, offline tiles, CRS cue and map tools. A first-use Field Mode tip is suppressed on `/map`. | A fresh check of the existing owned source preview returned HTTP 500 for `/`, `/map`, `/health`, and `/api/health`; the local process-owner query was denied, so the preview was not restarted. The latest production accessibility snapshot has no screenshot or measured viewport dimensions and does not cover an authenticated project map. Desktop visual review, production promotion, physical touch/device proof and field use remain open |
| Pricing and PayPal checkout | Source uses site theme tokens, exposes checkout actions and selected payment tabs, validates plan/currency/seat prices, and retires legacy one-time order/capture routes with HTTP 410. Earlier provider evidence records all 12 monthly Pro/Team/Firm plans active. The October 16 release record pins deployed source `eac2835e`; an October 18 Git comparison finds no changes from that revision to current HEAD in pricing, checkout, payment helpers, the PayPal webhook or the mail adapter. The older October 13 UI findings predate this release. | Matching pinned source is not a fresh checkout interaction or payment proof. Current Docker access is unavailable, and the PayPal approval, subscription, charge, webhook receipt and recurring renewal flow still require actual provider/runtime acceptance checks. No customer charge was performed in this pass |
| Custom verification email and business admin | The October 15 [authentication release](PRODUCTION_AUTH_RELEASE_2026-10-15.md) has saved live receipts: signup/login, received-link verification and reset, rejection of forged/replayed reset tokens, session revocation and new-password login passed. Five messages reached the owner-approved Gmail inbox, each with the inline METARDU logo; the disposable QA account was removed and existing customer passwords were unchanged. These receipts were inspected again on October 18. The admin workspace includes customer accounts, plan/revenue records, payment review, feedback, announcements and health diagnostics. Platform-wide administration excludes organization-scoped `org_admin` roles. | Current runtime inventory remains inaccessible in this command context, so the saved release receipts are historical live evidence rather than a fresh end-to-end check. Later dashboard source refinements require promotion and visual/browser review. A payment-provider subscription/charge and real customer onboarding remain separate acceptance checks |
| Landing/login/loading presentation | Promoted login mobile capture: 390 px without overflow, shared icon and frameless form; repaired Forgot password and Remember me 44 px. Source inputs 50 px, submit 52 px and footer links 44 px; actual production loading state observed | Wider transient-loader/current-route review and real provider sign-in proof |
| Shared logo and footer | Nav/login/loading use MetarduLogo; footer and PDF use canonical metardu-icon; footer includes plain legal links and review disclaimer | Cross-route visual consistency and current rendered footer verification |
| More duplication | Fresh 390×844 CUA proof: eight More destinations distinct from five primary links; Escape closes and restores focus; no horizontal overflow; viewport reset | Production/mobile-device proof; preserve useful alternate header/footer access |
| Honest marketplace | Fresh source browser reaches No listings yet; API excludes exact retired seed-title allowlist and declines evidence-free verified boolean | Production empty/error/listing states and actual inventory provenance; preserve genuine listings and avoid blanket seed cleanup |
| Pro provides real value | Subscription catalogue/gates and real computation/export paths exist; source/native/production evidence must be tied to specific features | Payment/provider delivery, entitlement enforcement and paid workflow proof remain open; template plan styling is not payment proof |
| Government registry integrations | The official public Ardhisasa pages reviewed describe portal-based user services but do not publish a developer API contract. METARDU now searches only account, shared-reference and cached records; a local miss returns `OFFICIAL_REGISTRY_ACCESS_UNAVAILABLE`, not an official not-found. The undocumented hard-coded lookup URL and unused NLIMS/NLIS/Tanzania/parcel-search throwing placeholders were removed. `/registry` forwards to the consolidated parcel page with an official portal handoff; the remaining direct Ardhisasa adapter is disabled unless explicit opt-in, contract-confirmed, HTTPS endpoint, environment and credentials are supplied | Ministry-issued API contract, authorized credentials/sandbox, verified schema and real read/submission/status round trip. Public references reviewed: [Ardhisasa FAQ](https://ardhisasa.lands.go.ke/home/faqs) and [terms](https://ardhisasa.lands.go.ke/home/terms-and-conditions). No direct registry call or production proof is claimed |
| Private ChatGPT account linking | Customer MCP disabled. New versioned notice, prominent announcement, write-once timestamp and hard 30-day OAuth/MCP gate shipped; 87 focused tests and 46 production HTTP checks pass. Actual in-platform publication: 2026-10-11T17:56:45.516Z; eligibility: 2026-11-10T17:56:45.516Z. Existing owned revocation works while new linking is off | Fresh public GETs to both OAuth discovery endpoints returned HTTP 503 `Integration unavailable`; linking remains gated. Confirm public HTTPS, elapsed notice period, enabled deployment, real human consent/use and directory approval before enabling; local publication does not prove external customer receipt |
| OAuth provider sign-in | Active NextAuth v4 route and conditional provider UI are present, but production has no Google or Azure client configuration. This is an external provider-registration/configuration gate, not a source failure | Owner registration and secure production secrets, followed by a real OAuth round trip |
| Current source promotion | The latest saved [survey release record](SURVEY_RELEASE_PREPARATION.md) pins promoted source `eac2835e` with all 115 migrations and preserved customer records on October 16. Later admin, dashboard and field changes remain outside that recorded release. The October 18 `npm run docker:verify` failed before inventory; this command context cannot freshly confirm the running source/image or service health. | Restore read-only runtime inventory, review current compatibility, backup/recovery and protected rollback evidence, then perform one planned application-only promotion and post-release workflow checks. A failed Docker access check does not establish that Docker is stopped |
| Runtime/data preservation | Read-only `npm run docker:verify` on 12 October reported one healthy production app, five healthy supporting services, and the backup service running without a configured healthcheck; the latest backup record was archive/header evidence only. Fresh 13 October verifier attempts still could not read Docker's process inventory. Public routes had returned HTTP 200 earlier that day; the current source preview now returns HTTP 500 on `/`, `/map`, `/pricing`, and health endpoints. No container was started, built, migrated, or stopped; no preview process was restarted because its owner could not be inspected. | Re-establish Docker inventory and source-preview ownership, then prove an actual backup restore and offsite recovery; review release recovery before promotion. No blanket prune, disk compaction, extra builder, duplicate app container, or applied-hash edits |

Detailed new document evidence is in
[DRAINAGE_PDF_VERIFICATION_2026-10-11.md](DRAINAGE_PDF_VERIFICATION_2026-10-11.md).
Historical source/browser artifacts remain separate from fresh production/field
proof. Do not restart completed migration/recovery work or overwrite the localhost
CAD training drawing. Continue into demonstrated source gaps while external gates
are pending; do not treat this checklist as platform completion.

PayPal lifecycle follow-up (13 October): The renewal handler now records each
completed sale in `payment_history` using the provider sale ID as an idempotency
key, and extends the paid period in the same database statement. The initial
sale near activation is recorded without granting a second billing period;
later renewals extend from the current period end. Failed subscription-payment
events now create an idempotent failed-payment record and send a recovery email.
They leave access active during PayPal's retry window; the existing suspended
and expired events remain responsible for ending access. The shared payment
failure email no longer claims every provider pauses access immediately. Three
focused PayPal route tests and 58 PayPal/email-template tests passed, along with
app and test TypeScript checks. This is source evidence only: the database
inventory is still inaccessible to the Docker verifier, the webhook event
subscription and delivery are unverified, and no live renewal or failed charge
was generated. Production promotion remains behind the inventory, backup,
migration-compatibility, and rollback checks above.

Fresh external checks (13 October 2026): The connected Resend account reports
`metardu.space` verified with sending enabled. Public GET checks from the current
host returned HTTP 200 for the homepage, pricing, and privacy page; the published
email-mark URL returned HTTP 404. The OAuth authorization-server and
protected-resource discovery URLs returned HTTP 503 with `Integration
unavailable`, so the integration currently reports unavailable publicly. The
marketing reminder, unsubscribe, and email-template source suites passed 59/59;
this does not prove production configuration, migration 105, or customer delivery.
No customer email was sent. The Docker verifier failed in both normal and
elevated runs. A direct elevated process-list request then hung for about 45
seconds; the CLI context reports `desktop-linux` and the Docker engine pipe exists,
but container inventory, backup state, migration state, and rollback image remain
unverified. The hung read-only request was interrupted; no deployment or container
lifecycle operation was performed.


Follow-up verification (13 October 2026): bearing/distance-only traverse results now keep angular closure unassessed and mark tolerance evaluation incomplete; the CSV workflow reads the computed 1:X ratio directly. Focused field, traverse, API, workflow and tolerance tests pass 65/65 across six suites, including least-squares redundancy and azimuth observation coverage; app/test TypeScript checks and scoped ESLint pass. Fresh public GETs returned HTTP 200 for the homepage, pricing, privacy and /api/payments; the capability endpoint reports PayPal enabled and M-Pesa/Stripe disabled. The public email-mark URL still returns 404, while delivered Resend messages already carry the inline mark attachment.

The repository Docker verifier again failed before inventory with the Docker pipe permission error; no container lifecycle operation or promotion was performed.

Admin billing follow-up (13 October 2026): Staff plan overrides now draw
valid plan IDs from the canonical subscription catalogue, so all current tiers
including Team and Firm are available. Email and duration inputs are validated;
the subscription upsert and audit event are written in one transaction, and a
missing account causes no write. Focused route/schema tests pass 15/15, scoped
ESLint passes, and app/test TypeScript checks pass. These are
source-level checks only; no production override was made or promoted.

## Current email, pricing and map recheck — 2026-10-13

Road field collection follow-up (13 October 2026): The road code selector now
offers an operator-controlled shortcut to the next selected code without a
saved point at the active chainage. It keeps repeated-code capture available
and explicitly avoids treating selected codes as a station-completion or
quality check. Focused selector and road-plan suites pass 14/14; app/test
TypeScript checks and scoped ESLint pass. Browser, production and field review
remain open.

- A fresh read-only Resend account check reports `metardu.space` as verified with sending enabled. The existing one-time design-check email is provider-reported as delivered; its HTML references `cid:metardu-email-mark`, and Resend lists the attached `metardu-email-mark.png` (PNG). This verifies provider-side delivery and attachment metadata, not inbox rendering or app-generated production mail. No new email was sent during this check.
- Fresh HTTPS HEAD requests returned HTTP 200 for `/`, `/pricing`, `/api/payments`, and `/api/public/chatgpt-notice`. The payment capability response reports PayPal enabled and automated M-Pesa/Stripe disabled; the distinct manual Till-claim flow still requires merchant-statement review. The version-bound ChatGPT notice remains `waiting`, is not eligible until `2026-11-10T17:56:45.516Z`, and reports `linkingConfigured=false`; new customer linking stays disabled.
- Production CUA loaded the global survey map after its dynamic import and showed the map search, survey grid, left tool rail, zoom/print controls, offline tiles and coordinate status bar at a desktop viewport. This is unauthenticated global-map evidence, not an authenticated project-map or field-use check.
- Production pricing still differs from source: after selecting PayPal, the visible plan selector has no checkout button; the page also retains an `INSTANT ACTIVATION` badge despite the source M-Pesa path requiring merchant-statement verification. Source includes the tested `Continue with PayPal` action and manual-review copy, but it has not been promoted. No checkout or charge was attempted. The public `/metardu-email-mark.png` path still returns HTTP 404 although the source file exists and the delivered test used the inline attachment.
- Opening a PayPal checkout URL while signed out redirects to `/login?next=%2Fcheckout`, dropping the requested plan/currency/provider query in production. Current source middleware preserves the full relative path and query, and `safeRedirectPath` allows safe internal query strings; this correction is not live yet. The sign-in form itself is visible and accepts an email address; no credentials were entered.
- Pricing no longer calls `ipapi.co` to infer currency from a visitor's IP address. It uses a recent saved display preference, then the browser locale, with a visible currency selector and KES fallback. The focused pricing suite passes 3/3, including the PayPal action and a no-IP-lookup regression; app/test TypeScript checks and scoped ESLint pass. The source change is not live until the controlled promotion gates are met.
- Marketing reminder review now has a `dryRun=true` mode behind the existing admin bearer key. It reuses the exact consent, verification, subscription, suppression, and 30-day delivery eligibility filters, returns aggregate counts only, and never claims a delivery or calls Resend. Manual dispatch of the GitHub workflow now runs that preview; only the scheduled path can send, and it still requires the app and repository enable flags plus production Resend configuration. Focused endpoint tests and TypeScript checks pass; live migration, secrets, audience count, and delivery remain unverified.
- A read-only Docker Desktop view confirms the lower `metardu` Compose group contains one `app` child (`metardu-metardu-app:candidate`, short ID `34a6af8d799f`, port `3000:3000`) plus `worker`, `backup`, `ntrip`, `collaboration`, `postgres`, and `redis`. The separate top entry is `metardu-schema-rehearsal-20261008`, a PostGIS container, not another app row; it was left untouched. Docker Desktop shows running indicators, but this view does not establish API health, backup freshness/restore, applied migrations, or rollback readiness. The CLI verifier remains unable to read the Docker pipe, so promotion remains gated.
- The read-only Docker verifier still cannot read `docker ps`; it did not start, build, migrate, stop, or promote any container. Docker Compose ownership labels, backup state, migration state, and rollback image remain unverified. No provider setting, DNS record, customer record, or paid campaign was changed.

## Docker MCP access check — 2026-10-13

Docker Desktop 4.82.0 shows the engine running and the MCP Toolkit open. The Toolkit cannot load profiles: its `docker mcp profile list --format=json` call reports `Docker Desktop is not running`, and the Clients page remains empty. Docker MCP CLI 0.43.1 is installed; `docker mcp client connect codex` returned the same error in normal and elevated runs. `docker mcp feature list` could not access `%USERPROFILE%\.docker\mcp\.mcp-toolkit-migration.lock`. The Docker CLI also receives permission denied on both configured Windows engine pipes, so the repository's read-only `npm run docker:verify` cannot inspect inventory, health, backups, migration state, or rollback readiness. No Codex MCP client/profile/server configuration or container was added or changed. Restore Docker Desktop Toolkit/engine access for the Windows session running this checkout, then connect Codex and rerun the read-only verifier before any promotion. Keep the one-application-container rule; no MCP server container was started.

Current-session recheck (13 October): `npm run docker:verify` again failed before inventory with the Docker pipe access error. `docker mcp client ls` says Docker Desktop is not running, and `docker mcp profile ls` cannot open the Toolkit migration lock because access is denied. Windows app/window discovery returned no Docker Desktop window, and read-only process/service checks returned no Docker Desktop process or service in this execution context. This differs from the earlier desktop view showing the UI and running indicators; it confirms that this checkout's command session cannot currently reach that engine or Toolkit. No profile/client was configured and no container was touched.

Live transaction, map and email recheck (13 October 2026): Resend lists
`metardu.space` as verified with sending enabled in `us-east-1`; receiving,
open tracking and click tracking are disabled. No email was sent. A fresh
signed-out browser visit to a PayPal checkout URL returned
`/login?next=%2Fcheckout`, dropping the requested plan, currency, seat count and
payment method. The production pricing page still displays “INSTANT ACTIVATION”
and says a Till payment gives instant access, while the current source requires
merchant-statement confirmation. Source checkout and pricing corrections have
not been promoted; no credentials were entered and no payment was attempted.
The public `/map` page finished loading and its accessibility tree showed the
desktop primary navigation, coordinate search, offline-tile control, CRS status,
map controls and eight tool-rail actions. This is unauthenticated global-map
evidence, not a visual review of a desktop viewport, project-map validation, or
field acceptance. No production setting, customer record, email, or container
was changed. Current-source pricing, safe-redirect, PayPal webhook/legacy route,
marketing-reminder, notice-gate, email-template and PayPal-plan suites pass
96/96 across nine suites. They do not prove a live PayPal approval round trip,
customer reminder delivery, or the unpromoted fixes in production.

## Five-family survey upgrade checkpoint — 14 October 2026

The requested scope now explicitly covers cadastral, engineering, road,
construction and topographical jobs through the existing tools. The continuing
acceptance matrix is [SURVEY_WORKFLOW_UPGRADE_MATRIX.md](SURVEY_WORKFLOW_UPGRADE_MATRIX.md).
This source batch repairs road PI/curve schedules, measured design/ground profile
entry and reload, cross-section geometry/drawings, current-revision CSV/PDF
schedule exports, standalone earthworks/print quantities and mixed TIN/grid
volumes. It removes invented catch points, blank-level zeros, stale quantity
overrides, fake middle-section/prismoidal quantities, hidden material factors
and incorrect universal error/height-reference assertions from these paths.

Final source verification: 411 tests across 40 suites, both strict TypeScript
projects, all changed/new source lint and whitespace checks passed. The fresh
read-only Docker verifier passed against one healthy existing production app
and required services, with recent backup completion. No service lifecycle,
image/build, migration or promotion occurred in this batch. Existing source
preview ownership was verified, but CUA navigation returned
`net::ERR_BLOCKED_BY_CLIENT`; browser/native/physical field evidence stays open.
Production remains the previously verified image and 109-entry ledger; source
migration 105 and recovery/rollback compatibility still precede promotion.
The other provider, public ChatGPT consent/listing, payment, cadastral/legal,
receiver/offline and field gates remain distinct from these successful source
checks. No dependencies, duplicate containers, builders, scanner baselines or
applied-migration hash changes were added.

Road follow-up: project vertical profiles now evaluate supplied parabolic designs
through the engineering engine, and explicit station sources feed current levels
to sections, quantities and exports. Straight/simple-circular centreline targets
include E/N, surface/formation RL and grid bearing, gated by declared CRS/height
reference and bounded coverage. Blank levels, automatic curve selection,
shortening overlapping designs and stale stored target overrides are rejected.
Analytical, input, persistence and shared export checks pass 106 tests across
14 suites. Details and remaining corridor/design/control/field gates are recorded
in the survey upgrade matrix. CUA still blocks the owned local preview; no
browser/physical print/field proof is inferred. No Docker lifecycle, image,
dependency or migration change occurred, and production remains unpromoted.

Construction follow-up: the existing pile/grid panel now retains unknown inputs,
invalidates stale results, reloads original project grid parameters, separates
staff/ground/prism height quantities and supports explicit backsight orientation.
Grid labels are unique with retained numeric padding; overflow/precision loss,
invalid setup and stale exports fail closed. CSV/DXF retain exact coordinates,
declared references and draft status; 2D DXF leaves unknown point/line Z absent.
The pile API now persists supplied criteria that it previously ignored, including
the source/rules snapshot, with each saved design; partial criteria are rejected.
101 focused tests across eight suites and strict app/test typing pass. Internal
native-format parser/extractor proof is not downstream CAD/device or field proof.
Fresh CUA navigation remains blocked, Docker still has one existing healthy app,
and no promotion or runtime lifecycle change occurred. The shared legacy capture
algorithm's fallback tolerance policy and control/height evidence remain release
gates; follow the survey workflow matrix rather than treating this batch as
completed construction acceptance.

Field capture follow-up: new source captures now use version 2, with no default
tolerance and separate horizontal/vertical uncertainty, point criteria and
reference binding. Missing evidence is retained as an explicit unassessed
observation; retries preserve it. Historic v1 snapshots keep their recorded
semantics and are identified as historical in draft reports. Current CSV/HTML/PDF
retain raw precision, unknown criteria and missing-evidence reasons. 118 focused
tests across 11 suites, both strict typing projects and changed-source lint pass;
real native PDF generation, independent extraction and visual inspection confirm
a one-page synthetic NOT ASSESSED table with full source coordinate precision.
Migration 106 is prepared, NOT executed or promoted. Its SQL compatibility,
legacy-row validation, target-column locking and restore/rollback checks remain
required. Applied migration 096 is unchanged. Docker verification passed against
the existing single app; no production lifecycle change occurred. The existing
host preview was restarted only after its old processes were confirmed absent;
automatic browser approval review could not complete inspection after a login
redirect to localhost. Browser and field acceptance remain open. Follow the
upgrade matrix for details and the continuing five-family workflow scope.

Column-plumb follow-up: source no longer treats an absent measured height as an
infinite tilt ratio or adopts a regulatory/default plumb criterion. Explicit
criteria, source/version, measured height and separate displacement/height
uncertainties govern numerical comparison. The append-only API now captures exact
observations/references/criteria under a versioned algorithm with stable delivery
IDs, replay conflict protection and a specific migration-not-ready response.
Historical results remain recorded, separately from current INFO/numerical scope.
127 tests across 13 suites, both strict typing projects and changed-source lint
pass. Migration 107 is prepared but NOT executed or promoted; PostgreSQL,
recovery/rollback and actual field checks remain required. The per-column form,
persistent device drafts/offline delivery and plumb report/CSV outputs still need
connection to this repaired API. Fresh Docker verification failed: its Linux
engine pipe was absent, so this check does not confirm current container health.
No container, image, service lifecycle or customer-data change occurred.

Plumb collector follow-up: the existing field/set-out route now exposes the
account/project-scoped column form, persistent device-first capture, stable retry
delivery and recovery backups. Unknown inputs remain blank/INFO; no default
criteria, time or uncertainty is inferred. Double taps are locked, observation
uncertainties reset, access refusals cannot activate a cached reference, and the
server rejects delivery under a different capturing account. CSV preserves exact
precision/negative numeric levels and distinguishes device-only records; JSON
backs up scoped raw entries and the visible form. A native CSV parser round trip,
99 focused tests across 10 suites and strict app/test typing pass. These are
source/jsdom/mock-network checks, not browser, applied-PostgreSQL or field proof.
Full saved plumb-history/native report outputs, cold offline authentication and
real device/session checks remain open. Migration 107 is still unapplied, Docker
access remains unavailable, and no production lifecycle or dependency change
occurred. Follow the survey upgrade matrix for the continuing full scope.

Saved plumb-history follow-up: private server-register CSV, printable HTML and
native PDF now use the existing export endpoint and field collector links, with
column/recording-time filters, bounded histories and preserved re-observations.
Current captures use original precision and validated evidence; historical
results remain separately NOT ASSESSED, without guessed current CRS/units or
criteria. Private access/scope checks precede export; mismatched evidence blocks
it. Native vector reports reuse the canonical icon/verified font and explicitly
reject unsupported characters. 55 focused tests across eight suites, strict
app/test typing, lint and actual two-page PDF extraction/render inspection pass.
These are synthetic/source proofs. New capture migration 107, actual PostgreSQL,
recovery/promotion, browser downloads/printing and independent field checks remain
unverified. Docker access still failed, with no runtime lifecycle or dependency
change. The wider platform objective remains active.

Shared field-page follow-up: account/job draft isolation, stale-response guards,
database-error retention, duplicate-tap prevention and strict atomic CSV previews
are now implemented in the existing `/field` tool. Instrument point names/heights
and original reading metadata are retained; missing projected coordinates remain
unknown/rejected. Quick bearings no longer generate fabricated full observations
to obtain a tolerance grade. 65 focused tests across four suites pass. These are
source/DOM fixtures with mocked network/device boundaries, not deployed database
or field proof. Durable offline persistence, reference binding, idempotent retries
and measured traverse/level/radiation acceptance remain open. Current Docker
verification still fails access, and no production promotion or additional
container/image/dependency was created. See the workflow matrix for full details.

Pipeline follow-up: the existing as-built tool now retains measured IDs, signed
cover and downstream fall without invented values or a universal cover standard.
A shared circular-pipe geometry authority corrects outside crown from internal
invert across as-built, network cover, project targets, auto-grading and DXF.
New saved field definitions identify generator v4; old definitions/observations
remain unchanged and need review/fresh revision before crown/cover reliance.
Strict template import, reversible full measurement CSV, evidence JSON and branded
printable HTML now exist. Actual owned source-browser CSV/HTML downloads retain
the synthetic observations and canonical PNG; native DXF parsing verifies corrected
profile geometry and caught/fixed malformed layer group codes. This is source/
synthetic proof, not production or physical field acceptance. Saved as-built design
linkage, uncertainty/provenance, long-job print/mobile/CAD and field gates remain
open, as does the legacy PipelinePanel integration. No production lifecycle,
migration, dependency or additional container action occurred; Docker verification
still fails access. The five-family workflow matrix remains the acceptance scope.

Production recovery follow-up: the Docker startup fault was traced to inaccessible
zero-byte inference and Secrets Engine IPC endpoints. Inspected stopped runtime
directories were reversibly renamed aside, preserving all entries and application,
volume, backup and credential data. The original engine/stack now passes reviewed
Docker health/ownership/duplicate inventory: one METARDU application container,
required support services healthy, no dated verification images/builders; latest
completed backup run `2026-10-14T02:00:03Z` is not restore proof. The existing named
Cloudflare connector was restarted, and fresh public home plus public health return
HTTP 200 with database/Redis ok. New source remains unpromoted; schema/recovery/
rollback and field gates remain. The endpoint recovery is a workaround, with
future restart stability still unverified. Pipeline source `13a88904` passed
normal pre-push 141 tests/17 suites and GitHub secret scanning. See the workflow
matrix for the precise source/runtime/field boundaries and recovery record.

Measured pipeline project-history follow-up (15 October): the reachable as-built
tool now offers private owner project selection, recording, paginated reopening
and archival JSON. Server computation retains raw input and numeric results;
stable delivery IDs prevent duplicate retries and conflict on changed input.
Missing schema never becomes a false save; draft inputs survive failure and
account changes clear private history. New migration 108 prepares an independent
append-only/RLS-protected archive so mutable design JSON cannot overwrite field
evidence. Its actual SQL passed the restricted-role synthetic PostgreSQL rehearsal,
including private access, immutable evidence, uniqueness, malformed-data and parent
deletion checks; the complete transaction rolled back. No production migration,
clone, image/container creation or promotion occurred in this batch. Source/API/DOM
tests and actual anonymous source-browser arithmetic are distinct from a full
authenticated recording flow, issued design comparison, uncertainty and field
acceptance. The five survey families remain in scope and the overall goal remains
active. See the workflow matrix for exact checks and unresolved release gates.

Contour follow-up (15 October): ordinary space-separated observations, valid
decimal/negative boundary levels and distinct fine elevations are retained by
the shared engine. The private project loader now requests incomplete rows for
review, retains missing values/references visibly, rejects mixed frames and
clears stale results across edits/account/project changes. Late PDF completion
is guarded. Native source-browser worker generation and actual CSV/DXF/A3 PDF
downloads agree with the known synthetic plane; native DXF parsing and PDF
rendering/extraction verify the output. An observed short-line label collision
was corrected at the arc midpoint and rechecked in the actual PDF. Wrong-project
responses and oversized source reviews fail explicitly. 64 focused
tests/eight suites pass; strict typing/lint are required final checks. These are
source/synthetic checks, not field or country submission approval. Production
now runs the separate pinned auth release (see its release record), with 112
unchanged applied hashes and only migration 108 pending. This contour batch has
no production lifecycle/schema/container/dependency change. Project recording,
terrain masks/ground selection, long-job/mobile/print/field checks and the other
survey-family gates remain open. The complete objective has not been reduced.

Private recording/security follow-up (15 October): 31 real source HTTP checks now
exercise private pipeline capture/reopening/retries and profile authorization with
disposable accounts in the existing marked synthetic database. They exposed and
then verified the closure of ordinary-account self-promotion/self-verification
through `/api/db`. Declared profile editing remains available; protected values,
mixed batches and deletion are refused. New forward-only migration 109 adds a
database trigger safeguard; 14 native restricted-role checks pass. Platform admin
contexts and global/legacy role mapping are corrected, and real HTTP assignment,
suspension and restoration checks preserve session revocation. Normal identity/
auth/profile tests and strict typing pass. See the workflow matrix for exact
source/synthetic boundaries, retained fixture evidence and scripts. Production
still runs pinned `c1591bda` with 112 applied entries; 108 and 109 are pending
reviewed promotion, so this is not a claim of live remediation or platform-wide
professional/field completion. No duplicate app container, builder, customer clone
or production database change was made for these checks.

Road/reliability follow-up (15 October): the existing spiral tab now uses corrected
left/right transition/circular geometry, finite circular-limit endpoints, exact
junctions and separate chord/tangent direction. Independent integration checks
the calculation, and actual source-browser CSV/GeoJSON downloads retain the
synthetic design's coordinates and reference metadata. The exporter requires a
declared source CRS for geographic mapping, and the form clears stale results on
edits. Middleware quotas are separated so routine API traffic cannot consume
the smaller sign-in allowance; repeated auth requests remain throttled. 71
focused checks pass across seven suites, with strict typing/lint and normal push
gates required for the final commit. See the workflow matrix for native receipts,
source/production boundaries and the exact remaining road/project/field gates.
The security repair is pushed as `cd067a8d` (351 related tests and GitHub Gitleaks
passed); live promotion of pending source remains a separate requirement.

Project transition follow-up (15 October): saved road inputs now connect equal
entry/exit spirals to the established engine, project chainages, centreline
coordinates and CSV/PDF outputs. Native synthetic CSV/PDF checks retain 99 target
rows and TS/SC/CS/ST; rendered schedules now keep printed numerical cells whole
using linked tables and explicit precision. The focused run passes 104 tests in
14 suites; strict app/test typing and changed-file lint passed. See
`PROJECT_ROAD_TRANSITION_VERIFICATION.md` for evidence and the newly traced
legacy IP mirror defects. Asymmetric transitions, corridor/superelevation,
design/control identity, persistence reconciliation, instrument/field acceptance
and promotion remain open. The read-only Docker verifier passed against the
existing single application stack; no production service/schema/image changed.

Alignment persistence follow-up (16 October): source now repairs middle-PI
stationing, zero-radius endpoint validation, canonical table/schema mismatches,
lost design/profile fields and private read/write checks. Accepted child edits
synchronize the selected canonical project draft and retain removed input notes
in immutable history. Migration 110 was verified only in the existing marked
synthetic database; no old hashes changed. The production catalog confirms
affected table row security is disabled, making these application guards a
required release change. 31 real source HTTP checks and 60 tests/nine suites
pass, with strict app/test types and changed-file lint. See
`ALIGNMENT_PERSISTENCE_VERIFICATION.md`. The original synthetic service is stopped
again and the single production stack remains healthy. Source promotion, legacy
quantity storage, full revision/issue and all broader acceptance gates remain.
