# Map, deed-plan and Fourier review

Source review: 20 October 2026. Changes are not production deployment evidence.

## Source changes

- Deed-plan browser requests now use `/api/deed-plan/generate` with same-origin credentials. A build-time public URL cannot divert authenticated project input to another deployment. HTTP/HTTPS cookie handling and database session-version revocation remain enforced; no token minting or hardcoded session version is a fix.
- The cadastral workflow has a six-row loading skeleton with a status announcement and reduced-motion support. It does not change saved checklist state.
- Gemini's shared desktop/mobile map dock is retained. Its overlapping hide control is moved into the toolbar, panel buttons expose expanded state, the header wraps on constrained desktop widths, and panel height accounts for header/status/toolbar clearance. The former precision vertex toolbar remains available under Capture. No training drawing or browser storage is cleared.
- Fourier FFT/IFFT, Hann periodogram, filtering and harmonic-fit foundations are retained. Density normalization is `factor * |FFT(window*x)|² * interval / sum(window²)`; integrated power uses bin width. Padding does not create additional observation resolution. Invalid samples, spacing, inverse-transform size, cutoffs and unresolved harmonic designs are rejected. Harmonic fitting uses Householder QR rather than normal equations.
- Road spectra remove linear grade, integrate density over wavelength bands and withhold 0.1 cycles/m density when the record cannot resolve it. ISO class, IRI and ride quality are explicitly unavailable: a slope proxy is not a validated quarter-car model or compliance procedure.
- Tidal fits report a fitted intercept and algebraic amplitude envelope. They do not establish MSL, LAT, HAT or Chart Datum. Unknown/duplicate constituents, duplicate times and insufficient constituent separation span are rejected. Evaluation is limited to the observation span, and depth reduction requires an explicit independently verified datum offset in the same gauge reference.

Practical uses are investigating repetitive road-profile features, comparing derived filtering previews with retained raw observations, and diagnostic harmonic fitting. These helpers are library foundations; a complete user-facing spectral workflow, uncertainty budget, instrument validation and field acceptance are still required. Do not use filtered heights as replacement survey observations.

## Live location and parcel evidence

The existing Chrome METARDU map accepted device-location tracking. The visible reported accuracy varied around 187–212 m before tracking was stopped. That reading cannot identify parcel corners. The supplied mobile screenshot shows satellite imagery, a pale-blue-roofed house and enclosed compound, GPS off, a rotated view, and no selected survey CRS. Its cursor coordinate is a map reference, not a measured boundary observation or guaranteed image-centre position.

Any compound traced from that imagery must remain an unverified reconnaissance outline. No boundary markers, elevations, datum, official parcel number, professional credentials or statutory status may be invented. A field survey needs confirmed corner evidence, control/reference information, measurement provenance and owner/surveyor review.

Live polygon capture correctly rejected the attempt with no selected survey CRS. No polygon or survey points were saved. Chrome browser control subsequently disconnected. A private reconnaissance record is retained under `.cache/takeover/`, outside the source commit; no owner home coordinates or customer files belong in the code push.

## Security finding and deployment dependency

Five untracked helper scripts embedded the current production signing secret and fabricated account sessions. The credential match was checked in memory without recording its value in the evidence report. The copied value was removed and those helpers disabled; none was executed or included in the source commit. They remain outside the reviewed commit scope. Existing production configuration has not been changed by this cleanup.

Production secret rotation is required. Prepare a new cryptographically random signing secret without logging it; update the existing configuration's signing-key variables consistently; recreate only the current application and collaboration services with their exact current images, mounts, ownership and non-secret configuration preserved; leave PostgreSQL, Redis, worker, NTRIP, backup and all data volumes intact. Re-run runtime health and ordinary sign-in/session checks. Existing sessions and collaboration connections will be invalidated. Recovery must retain the new secret rather than reinstate the exposed key. No database migration is required for these source changes or credential rotation. Coordinate this session interruption with the owner before executing it.

The owner explicitly deferred rotation on 20 October to finish current work. Honor that deferral; the exposed production key remains an open security blocker until rotation and ordinary sign-in verification are completed.

Evidence: `.cache/takeover/helper-security.json` and `helper-scrub.json` contain booleans and filenames only, never the credential. The helper cleanup does not establish that the key was absent from earlier logs or external transcripts; rotation is the remediation.

## References

- [W3C Geolocation](https://www.w3.org/TR/geolocation/): device-derived location includes accuracy and can come from network positioning; actual location is not guaranteed.
- [SciPy periodogram documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.periodogram.html): density versus spectrum units and one-sided negative-frequency power treatment.
- [NOAA tidal datum definitions](https://tidesandcurrents.noaa.gov/datum_options.html): datum benchmarks/epochs and astronomical extremes differ from a short-record fitted intercept or sum-of-amplitudes envelope. These definitions do not establish an applicable Kenyan datum or hydrographic acceptance.

## Remaining proof

Source: application and test type checks pass; focused regression tests pass (47 checks in nine suites, plus the new variance-report check). Changed-source/test lint is clean. The security/bug gate passes with all 119 applied migration hashes pinned. A staged-patch check found no matches to six protected running-app credential values. This is not a complete historical secret audit.

Browser: the source desktop Capture panel exposed drawing, measurement and vertex actions with expanded-state semantics. Final precision-control, hide/reopen and narrow-width inspection remains incomplete after browser disconnection. Live: these edits need the planned promotion and authenticated deed-plan regression. External/field: measured parcel corners, verified CRS/control, instrument and professional acceptance; actual tide/road reference datasets; validated IRI and ISO reporting remain outstanding. ChatGPT notice/deployment/consent gates stay unchanged.

## Follow-up from the first pre-push gate

The first push was rejected by the local lint gate; no remote update occurred.
Security/schema/typing gates and 64 related tests in 14 suites passed. The full
push range included an earlier CI/UI commit whose four tool pages still had lint
errors. Unused imports and untyped legal-description updates were corrected.
The flagged stakeout CRS belongs to explicitly synthetic preset metadata; it is
now carried by that preset rather than applied as a literal in its handler.
Real observation mode still starts with an empty reference.

The legal-description review exposed a broader issue: fabricated initial parcel
and professional details and automatic certification language. The page now
starts empty, makes synthetic examples opt-in and retains that label after edits,
requires confirmation of the entered metre grid, and rejects incomplete or
non-finite coordinates without turning blanks into zero. Unrecorded marker types
remain unknown. Exports are unverified review drafts, with grid-relative quadrant
bearings and planar distances; they do not claim True North, ground distance,
statutory compliance or professional certification. Entered text is escaped in
HTML/Word exports. This is not a full cadastral topology or title-evidence audit.

The owner requested a visible end-to-end home-survey simulation and supplied the
shared floating map-control layout as the cross-device reference. Browser control
was recovered by opening a fresh allowed HTTP preview tab. The simulation uses a
labelled ordinary-credentials account in the already-marked synthetic database;
no production login, signing key or customer record is altered by that setup.

## Visible source simulation: follow-up repairs

The fresh in-app browser reached the source preview with an ordinary synthetic
sign-in. A project was created through the UI, with WGS 84 / UTM 37S explicitly
declared as a simulation working grid; heights, survey control, field accuracy,
legal boundary and professional acceptance remain unknown. A four-corner outline
of the owner-indicated compound was traced, labelled as an unverified simulation,
saved to that synthetic project and downloaded. Native PostGIS checked the
projected outline and its planar leg values. These checks do not measure the
parcel or establish independent traverse closure.

The first GeoJSON download was double-encoded. The browser exporter now writes
the formatter's JSON string directly; a normal GeoJSON reader parses the file
once. A repeat browser download verified the object contract. A current-map PDF
was downloaded and rendered for review; it retains the simulation feature label,
source credit, working CRS and non-certified current-view disclaimer. Private
geometry and artifacts stay under `.cache/survey-simulation/`, outside Git.

Additional verified source defects and repairs:

- New-project country selection silently guessed datum, zone and hemisphere.
  Both UI and create API now allow an honestly absent reference or require a
  complete supported explicit metre grid. Sketches suggest a zone without
  overwriting the user's chosen reference. No migration is required.
- The project map refused to open before survey points existed. Its route now
  opens the shared capture map with the linked project's declared CRS; the old
  coordinate review remains at `/project/[id]/map/review`.
- The scheme overlay queried two columns absent from the applied canonical
  schema: optional `blocks.block_name` and `parcel_traverses.computed_at`.
  The read query tolerates absent optional names and orders eligible traverse
  records by their existing update timestamp. Both query shapes ran against the
  marked synthetic schema. This is not a full scheme boundary-ordering audit.
- Map drawing controls expose pressed state. COGO now has an explicit decimal
  degree / DDD.MMSS selector, clears old inputs/results on notation changes, and
  rejects malformed coordinates and invalid minute/second fields. Resection
  angle examples agree with the selected notation. Claims of automatic SoK
  compliance were removed; calculations remain planar project-grid results.
- Observation batches saved successfully but were invisible because the panel
  expected a nested response while its API returns top-level `batches`. The
  panel now consumes the actual contract, reports malformed responses, and
  exposes source/observation notes. The saved simulation batch became visible.
- The legacy dynamic field book started empty and could upsert over saved rows.
  It now loads the canonical project field-book endpoint before enabling edits,
  preserves existing raw metadata and fixed-column values, and uses an explicit
  save through its transaction. Load failure disables editing. A content-bound
  revision is required on replacement; stale revisions are rejected before
  mutation. Changes remain on screen after save failure. Deletion uses the
  existing route's soft-delete/version history rather than a blind proxy write.

The simulation has not established field observations or legal acceptance. The
legacy field-book proxy writers and navigation with unsaved drafts still need a
broader concurrency/recovery audit. Initial new-project location sketches are
currently submitted by the UI but not persisted by its create API; that separate
gap must not be described as a saved boundary. Native projection in the existing
Python worker is unavailable because `pyproj` is missing; the marked synthetic
PostGIS check is a separate source-test capability. Final responsive checks,
complete project computations, draft document issuance and a consolidated
production promotion remain outstanding. No customer database was modified and
the owner's signing-key rotation deferral remains in force.

Verification checkpoint: the nine focused suites passed all 22 checks, and both
application and test TypeScript checks passed. Browser save/reopen retained all
four labelled simulation legs. The inline traverse action correctly withheld a
result without a starting coordinate, but directed the user to settings that do
not expose that input. The project computation route also needs review of its
legacy observation-table contract and fallback starting coordinates before this
simulation can claim a complete compute-to-draft path. These are remaining source
blockers, separate from the already exported reconnaissance map. No production
promotion of this follow-up has occurred.

The first push of `fdd32462` was blocked locally. Its related virtualization
tests needed a canonical read-response fixture; the touched legacy field-book
transaction also needed explicit database row types. Those corrections retain
the load-before-edit protection and add an ownership recheck on the locked
project row. The hook now scans the actual push base and prints its success
message only if no gate recorded a failure; no gate is bypassed.

Responsive inspection reached the lower mobile Capture controls and precision
toggle. Scrolling exposed backdrop-compositing trails; opaque floating controls
removed those trails after reloading the source stylesheet (computed backdrop
filter `none`, with a rendered tablet check). A narrow-tablet scale/dock overlap
was also found and its clearance adjusted. These are browser-emulated viewport
checks, not physical-device or offline acceptance. Final tablet-clearance and
short-phone checks remain to be recorded.


### Saved field-book computation and draft-renderer follow-up

The synthetic parcel-workflow simulation now has four explicitly labelled grid-distance
legs and a user-entered, CRS-bound starting coordinate saved through the visible
browser. The computed boundary was saved as design revision R01 with one
computation run and mandatory QA records. A read-only transaction against the
marked synthetic database compared all four adjusted positions, area and
perimeter with the independent native PostGIS outline: agreement within 1e-6 m
for coordinates and 1e-6 m² for area. These are imagery-simulation results,
not measured parcel dimensions. Private dimensions are retained only in the
local verification artifacts. Closure is constructed, not independent field evidence.
Private source observations, geometry and rendered artifacts remain outside Git.

Source repairs in this follow-up:

- Starting coordinates have an explicit project-grid confirmation and source /
  limitations note; blanks stay unknown. Row and control edits save together.
  Omitted control metadata is retained. Revision tokens include the starting
  coordinate, and concurrent ownership/input changes reject before mutation.
- The compute route reads canonical project_fieldbook_entries, validates closed
  station order and explicit grid-distance basis, and requires the declared
  project CRS. Missing control, un-oriented circle readings and unsupported
  slope reductions cannot turn into a default origin, bearing or EDM model.
- The transaction writes existing applied-schema fields and persists adjusted
  and original coordinates alongside the source revision. Boundary sketches
  remain intact. Mandatory design/computation/QA failures roll back the save.
  Input provenance now identifies the field-book content revision separately
  from the previous design revision. That last metadata change has focused
  source-test proof; the existing R01 browser run predates that refinement.
- Closure feedback reports original leg residuals, not the zero residual of the
  forced adjusted polygon. No monument type, height, instrument correction or
  professional acceptance is manufactured. Every result remains draft_unverified.
- Documents reject a saved grid computation when its declared CRS or current
  field-book revision differs. The entered starting coordinate does not become
  verified control. The server deed-plan draft no longer inserts certification.
- Visible Form No. 4 preview exposed false compliance/certification wording,
  guessed 12 m road widths, truncation claims and issued revisions. Both layout
  paths are being changed to explicit review drafts without automatic approval
  or seals. Explicit recorded road width is distinct from road classification.
- The scale bar previously labelled a 40 mm bar at 1:200 as 800 m. Its corrected
  physical relationship is 8 m. The PDF exporter used a nonexistent addSvg API;
  the installed library exposes svg. PDF and preview must use the same selected
  layout. Downloaded SVG review also exposed raw-coordinate label placement and
  rotation-dependent grid bearings; regression checks and repairs are ongoing.

Verification remains split: 80 focused field-book/geometry/atomicity tests passed,
then the added document-evidence suite and geometry suite passed 43 checks. App
and test TypeScript passed before the later renderer work; final renderer checks,
updated layout evidence, PDF download and the combined push gate are outstanding.
The first broader renderer run passed 140/143; its remaining expectations were
old certification copy and the changed layout snapshot. No production promotion
or production signing-key rotation has occurred. Physical field accuracy,
professional acceptance, private offline-device evidence, legacy proxy-writer
concurrency and unsaved-navigation recovery remain separate unfinished work.


The corrected form layout was subsequently downloaded as an unsigned PDF through
the normal browser control. The one-page file was parsed and rendered locally:
four named simulation stations, unknown heights, visible leg labels, declared
grid, physical scale bar and unverified-draft notices are retained; automatic
certification, seals, default road widths and fabricated revision issuance are
absent. Raster review found off-sheet leg labels (grid metres used as SVG pixels)
and display rotation changing printed grid bearings. New regression checks
reproduced both defects before their repair. The corrected renderer maps label
positions into the page viewport and retains bearings from original grid points.
DMS display also carries rounded seconds correctly across minute/degree limits.
All 144 targeted renderer/geometry/draft checks passed. The existing standard
layout snapshot is being refreshed for the reviewed draft/scale/layout changes.
Final combined gates and a repeat PDF check after legend/footer refinements are
still required. The unsigned draft is not a certified deed plan or field survey.

### A3 paper rendering repair — 20 October 2026

The viewer previously called `window.print()` on the entire workspace, including
the scroll-limited, zoomed preview. It now prepares a separate owned print document
with 420 × 297 mm sheets, explicit page breaks and a screen-only print toolbar.
Navigation and preview transforms are excluded. Loading/blocked-popup failures
leave the saved plan intact and report an actionable error. The same sanitized
sheet splitter supplies the unsigned PDF exporter, which adds one A3 page per
recorded sheet instead of shrinking the combined viewport onto one page.

Both review layouts use physical 7/9 mm sheet borders, an in-bounds compact project
identity block, visible grid area/perimeter/working CRS, and lower notices inside
the printable region. Unassigned drawing/revision references are not fabricated.
Coordinate grid lines and labels stay inside the drawing frame; the axis-aligned
grid is omitted for rotated views. Print labels use an available Helvetica family
in both SVG and PDF; scale-bar labels were enlarged. Printed planar area reuses
the translated-origin coordinate engine to avoid cancellation at large eastings
and northings. No field observations, legal corners, heights or approvals were added.

Source evidence: 156 focused print/export/renderer/geometry checks and the reviewed
layout snapshot passed. App and test TypeScript passed; final focused test lint
is recorded separately in the working verification log. Browser evidence: the ordinary synthetic account opened
the dedicated owned print sheet; DOM/CSS confirmed one A3 sheet with no navigation
or transform. Its actual unsigned PDF download was parsed and raster-reviewed:
one 420 × 297 mm page, all four simulation station labels, Helvetica/Helvetica-Bold
fonts, unverified-draft notices and at least 10 mm text clearance from each paper
edge. Private parcel artifacts remain outside Git.

Live/external limits: no production promotion or physical printer acceptance is
claimed. Print A3 landscape at actual size/100%, disable browser headers/footers,
and verify the physical scale bar. The existing multi-sheet renderer repeats
parcel content rather than implementing engineered extent tiling, and the legacy
paper-size option does not implement A4 geometry; neither is accepted as complete.
Unrelated concurrent offline/field-work edits remain preserved for their own review.
