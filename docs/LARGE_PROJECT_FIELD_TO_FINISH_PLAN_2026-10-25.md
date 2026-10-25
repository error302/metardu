# Large-project field-to-finish adoption

The owner's 25 October direction is the acceptance standard: METARDU must help
an individual or a team carry a substantial survey from planning through field
capture or imported observations to reviewed results. Mwavumbo is the cadastral
example; the same evidence and job-management backbone must support the other
survey disciplines. Product interfaces use coherent geomatics and interface
SVG symbols, not emojis. This plan extends the active production goal; it does
not declare the large-project capability complete.

## Mwavumbo subdivision campaign

Treat the ward as programme context, with its actual instructed parent parcels
and work packages underneath. Do not turn an administrative ward outline or
basemap tracing into a surveyed property boundary. The county identifies
[Mwavumbo Ward](https://kwale.go.ke/project/rehabilitation-of-ward-offices-mwavumbo/),
but this is not parcel-boundary or ownership evidence.

| Stage | Surveyor's work | Required METARDU behavior |
| --- | --- | --- |
| Commission and scope | Identify the client, instructed parent parcels, relevant records, required approvals, deliverables, programme and team. | Keep an explicit job brief, source-document register, parent-parcel identity, responsibility and review requirements. A ward campaign can contain multiple separately authorised projects. |
| Reconnaissance and control | Recover control and boundary evidence, assess access and terrain, plan occupations and independent checks. | Map evidence without promoting approximate positions to control. Declare horizontal/vertical reference, units, grid/ground basis and transformation provenance. Retain instrument checks and control status. |
| Divide the work | Allocate blocks, occupations, features and checking tasks to crews or one surveyor. | Persistent assignments, role-scoped access, unique station/point names, offline job packs and visible progress based on actual receipts. Assignments do not grant platform-administrator privileges. |
| Observe directly or import | Connect a supported total station/GNSS receiver, record manual observations, or bring back instrument files and field notes. | Both paths create attributable observation batches with original bytes, hashes, source CRS/units, instrument/setup details, operator and timestamps. Preserve corrections and rejected readings rather than overwrite originals. |
| Reduce and adjust | Review setups, reduce observations, compare redundant measurements and adjust supported networks. | Run shared engines against a retained input/control revision. Show missing evidence, residuals, closures and adopted criteria. A numerical pass is distinct from field/professional acceptance. |
| Design the subdivision | Review the actual parent boundary, constraints, proposed lots, access and required reserves. | Retain design versions and supplied constraints. Check topology, duplicate IDs, overlaps/gaps, shared boundaries and parent/child area reconciliation. Keep ownership documents separate from proposed geometry. |
| Set out and check | Transfer the reviewed design to the field, mark/check points and record discrepancies. | Export supported controller files or guide instrument-linked capture with the declared reference. Compare design and observations, retain tolerances and revisit/rework tasks. Never infer centimetre accuracy from an ordinary map location. |
| Review and issue | Independently check the work, prepare the required plans/schedules/reports, resolve comments and track submission. | Issue revision-bound packages with source hashes, reviewer decisions and supersession history. Track external acceptance explicitly rather than infer it from generating a file. |

The exact approval/submission checklist depends on the instructed land and
workflow. The Lands service describes subdivision-scheme approval requirements
including county approval and, for agricultural land, relevant Land Control
Board consent; its [service requirements](https://lands.go.ke/approval-sub-divisionamalgamation-schemes)
must be checked against the actual job. The
[Survey Act](https://new.kenyalaw.org/akn/ke/act/1961/25/eng%402022-12-31/source.pdf)
places responsibility for survey correctness and completeness on the surveyor.
METARDU supports the record and review process; it does not manufacture that
authority or external approval.

## Three operating paths, one evidence model

1. **Alongside instruments:** supported transport/protocol, station/backsight and
   antenna/prism setup, capture, immediate checks, local durable storage and
   acknowledged synchronisation. Maintain an explicit instrument/OS/browser
   acceptance matrix rather than claim universal connections.
2. **Field-to-office import:** retain the original file, identify its actual
   format, review station/target semantics and source reference, preview errors,
   then import under one recoverable identity. Replaying the same request must
   recover its receipt rather than duplicate or overwrite later work.
3. **Standalone office work:** process existing observations, coordinates,
   designs and imagery with declared provenance; compute, draft, compare and
   prepare outputs. New ground measurements still require a measurement source.
   Imported or traced geometry keeps its actual evidence status.

One surveyor follows the same workflow with the roles combined. Team work adds
assignments and independent review; it must not add a second, inconsistent
computation or CRS implementation.

## Apply the backbone across disciplines

| Survey | Distinct inputs and checks | Reviewable outputs |
| --- | --- | --- |
| Cadastral/subdivision | Parent evidence, control, boundary observations, parcel topology, approved design constraints, field beacon checks. | Parent/child schedules, draft plans and applicable forms, set-out records, review/submission package. |
| Topographic | Coded observations, heights, ground selection, breaklines, retained outer/exclusion boundaries and contour settings. | Retained TIN/contours, coded linework, sections, DXF/GIS/drawing/report revisions. |
| Road/corridor | Control, chainage/offset observations, ground sections, alignment/profile versions, project-adopted geometry and quantity criteria. | Set-out schedules, profiles/sections, quantities, as-built comparisons and evidence-bound drawings. |
| Drainage/utilities | Cover/invert observations, network connectivity, design pipe/manhole data, hydraulic criteria and constructability checks. | Network/profile drawings, quantities, setting-out and as-built records. |
| Construction/building | Site calibration, design grids/levels, approved design revision, offsets, redundant setting-out and verification observations. | Grid/pile/column schedules, level and verticality checks, deviation records and as-built reports. |
| Geodetic/control | GNSS/total-station/levelling observations, occupation metadata, network constraints, adjustment model, uncertainty and datum/height evidence. | Adjusted control, covariance/residuals, benchmark records, transformation and network reports. |
| Monitoring | Stable reference, comparable epochs, instrument/observation uncertainty, explicit significance and alert rules. | Displacement series, confidence/significance assessments, alerts and review history. |
| Drone/photogrammetric | Source imagery/processing report, GCP/check-point evidence, image/height reference, residuals and ground classification. | Reviewed orthophoto/point-cloud/terrain handoffs and derived deliverables. Processing and sensor support require their own acceptance. |
| Additional specialist surveys | Name the required sensors, vertical/tidal/time references, engines and independent checks before implementation. | A hydrographic, mining or other specialist workflow is not supported merely by reusing a generic map or export button. |

## Scale is a measured requirement

Initial proposed benchmark profile: **1,000,000 observations, 10,000 parcels,
100 work packages and 20 concurrent crew/reviewer sessions**. These are targets
for synthetic acceptance, not measured capacity claims or assumed Mwavumbo
parcel counts. Add larger profiles after the first is proved.

- Server-side counts, pagination and viewport-based geometry; do not download
  every parcel/observation to render a summary or a map.
- Bounded display windows and local reads on field devices; retain all original
  records while rendering only the relevant rows.
- Background imports, computations and exports with bounded chunks, progress,
  cancellation semantics, durable checkpoints and exact resumable receipts.
- Stable identifiers, idempotent commands, transaction/ownership checks and
  explicit handling of simultaneous edits to a shared point, parcel or design.
- Retained source/control/design/computation/QA revisions. A changed input makes
  downstream review and outputs visibly stale until re-evaluated.
- Measure elapsed time, memory, database work, transport size and cancellation /
  recovery behavior on stated hardware. Fast initial rendering cannot substitute
  for complete import, adjustment, export or receiving-application acceptance.

## Current source findings and implementation order

Existing foundations include scheme blocks/parcels/team screens, field capture,
coordinate import, CRS authority, shared computation engines, retained terrain
and civil artifacts, and recovery work. Their presence is not end-to-end
large-project acceptance.

1. Repair scheme metadata import correctness and receipt semantics. Current
   source checkpoint `SCHEME_METADATA_IMPORT_ACCEPTANCE_2026-10-25.md` replaces
   the UUID/project-binding/quoted-CSV/truncation and overwrite defects with a
   reviewed, bounded 10,000-row atomic intake and retained source/request receipts.
   Its 34 native cases and focused UI/source tests are not production acceptance;
   migration 117, ordinary-account/browser and broader background recovery remain.
2. Replace full-parcel downloads for scheme counts and remove invented scheme /
   default reference fallback. `SCHEME_OVERVIEW_ACCEPTANCE_2026-10-25.md` now
   records authoritative aggregate counts, 24-row pages, metric-only projection
   and explicit unknown/read-failure states for the overview. Complete the same
   bounded/validated approach in map and legacy consumer paths. Block detail now
   has 50-row reads, global totals and exact-version metadata commands recorded
   in `BLOCK_PARCEL_REGISTER_ACCEPTANCE_2026-10-25.md`. Block management now has
   24-row reads, exact-version commands and retained-record deletion safeguards
   recorded in `BLOCK_MANAGEMENT_ACCEPTANCE_2026-10-25.md`; migration 118 is
   fixture-only. Broader map/traverse/crew workflows still need acceptance.
3. Validate crew/member access, assignments, concurrent changes and cross-account
   isolation with ordinary identities. Do not confuse organisation administration
   with platform access or subscription privileges.
4. Connect retained observations to supported calculations, design versions,
   field checks and revision-bound outputs. Preserve the existing server
   admission/snapshot and exact-artifact release gates.
5. Run the quantitative profile above, interrupt imports/capture/exports, recover
   on another authorised device and check output completeness independently.
6. Complete physical instrument, receiving-CAD/print, professional field and
   production release acceptance. Add a named international workflow through the
   same core with independently checked reference/criteria packs.

The initial production acceptance target remains the defined topographic workflow;
the broader cadastral/engineering adoption objective stays active. Do not release
new menus as substitutes for these completed work paths. The UI/navigation and
existing-administrator browser audit continues alongside this work.

### Next map and boundary integrity work

Read-only source review after block checkpoint `b4825c93` found concrete defects
to address together rather than enabling the existing conversion button alone:

- The prior `useTraverseParcelPreview` expected `data.hasTraverses`/`data.parcels`, while the
  summary endpoint returns an array of project computation records. It also
  chose the first parcel again on confirmation instead of retaining an explicit
  parcel/computation selection. A project computation record is not a parcel ID.
- The prior `traverseToParcel.createParcelFromTraverse` called two absent singular-parcel
  boundary routes, then could return a calculated result after both saves failed.
  Its caller could consequently announce creation without persisted geometry.
  The replacement requires an exact, revision-bound server acknowledgement.
- The old helper assumed EPSG:21037; it now requires the reviewed saved grid.
  The dedicated map now consumes the authoritative saved project reference;
  the stored-geometry checkpoint below removes its independent EPSG:21037 assumption.
- Legacy traverse GET orders coordinates by station label; map SQL similarly
  orders by station label and references `station_name`/`elevation`, while the
  legacy application writer/reader use `station`/`rl`; the canonical table uses
  `station_name`/`elevation`. Label sorting does not establish
  a reviewed boundary chain. Preserve exact computation/observation revisions,
  explicit ordered boundary membership and topology checks before geometry writes.
- The former `/api/scheme/map` downloaded all coordinate-bearing parcels and
  built rings in application memory. The stored-geometry checkpoint below
  replaces it with bounded spatial reads and actual stored geometry.

`REVIEWED_BOUNDARY_DRAFT_ACCEPTANCE_2026-10-25.md` now records the explicit parcel /
retained-source / ordered-vertex review, authoritative-grid draft persistence,
retained original observations/prior geometry and exact recoverable receipts.
The legacy first-record and failed-save success paths are replaced with that
workflow. Migration 119 is fixture-only. The remaining map, computation, export,
offline/crew, applied-schema and field gates remain open.

The unresolved entries are source findings, not accepted map behavior. The preserved training
drawing and map storage remain untouched. They remain release blockers alongside
ordinary-account, browser, receiving-application and professional field evidence.

### Stored geometry and large views

`PARCEL_DRAFT_SHARING_ACCEPTANCE_2026-10-26.md` adds an explicit reviewer/client
handoff from a retained geographic draft: review disclosed fields, create a 1/7/30
day capability link, recover the same grant after interruption, and revoke it.
The recipient sees saved 2D geometry and provenance rather than invented beacon,
professional or approval details. No device location is requested automatically.
The new source workflow closes the project-ID lookup defect; applied-schema,
deployed-access/rollback, ordinary-account, valid-link browser and professional
acceptance remain separate. Migration 121 is fixture-only.

`RETAINED_SCHEME_EXPORT_ACCEPTANCE_2026-10-25.md` adds the next output step:
select exact parcels across register pages, review their saved grid/revisions,
produce a registered 2D draft, and recover the same stored bytes or durably
cancel an uncertain request. Batches of 1–50 parcels and 24-row request history
are explicit; larger asynchronous campaign delivery remains separate work.
DXF retains the grid; geographic GeoJSON retains conversion provenance without
claiming a field-verified local datum operation. Migration 120 is fixture-only,
and actual browser/paid/receiving-CAD/field/release acceptance remains open.

`STORED_GEOMETRY_MAP_ACCEPTANCE_2026-10-25.md` connects the reviewed parcel draft
to an owner-bound spatial view. Whole-project counts, at most 50 individual
polygons or 500 display-only density groups, explicit omitted records and saved
grid/evidence admission replace full-project station-ring reconstruction.
Unchanged reviewed drafts alone supply snapping geometry. Project/grid changes,
pan/zoom, hidden layers and failures invalidate stale requests and snapping;
background vertices never seed the user's drawing. Native synthetic coverage
includes 10,000 stored polygons. This is not actual ward, concurrency or field
proof. Deployed privacy controls, legacy traverse intake,
crew/offline work and the existing release gates remain open.

## Interface checkpoint

The first source pass introduces reusable monochrome total-station, GNSS-rover,
control, parcel, traverse, level and terrain symbols. Instrument mode controls
use the actual instrument forms. Visible emoji were replaced in field capture,
GNSS help, calibration, setting out, monitoring, fee quotation and parcel guidance.
The documentation now links to the real quick-start steps rather than the
unresolved `/project/[id]` placeholder. The route checker refuses unresolved
parameter links: 240 page files and 823 static links currently have no unmatched
references. This checks link syntax, not every rendered page or administrator access.

App and test type checks and scoped lint pass. The 55-test fieldbook checkpoint
and six adjacent fieldbook/CSV/dispersion tests pass; counts overlap and must not
be added. These are source checks, not physical-instrument or large-job proof.

The initial public-guidance/icon pass did not repair the server's project-ID
privacy, invented-status or default-CRS defects. The 26 October retained-draft
sharing checkpoint above replaces those source paths and removes phone arrival
claims. It remains a review copy, not authoritative boundary navigation or
certification. Deployed access and the corresponding release/field gates stay
open until independently verified.
