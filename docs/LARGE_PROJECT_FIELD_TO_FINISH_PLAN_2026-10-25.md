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
   `src/app/api/scheme/import/route.ts` casts UUIDs with `parseInt`, does not bind
   supplied project ID to the admitted block, splits quoted CSV by commas,
   converts zero/invalid area to null, overwrites duplicates and silently stops
   after 500 created rows. This cannot be a trusted large-job intake path.
2. Replace full-parcel downloads for scheme counts and remove invented scheme /
   default reference fallback. The current scheme overview loads all parcels to
   count status and keeps zero counts on failure. Use authoritative paged reads
   and aggregate status with explicit unavailable states.
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

## Interface checkpoint

The first source pass introduces reusable monochrome total-station, GNSS-rover,
control, parcel, traverse, level and terrain symbols. Instrument mode controls
use the actual instrument forms. Visible emoji were replaced in field capture,
GNSS help, calibration, setting out, monitoring, fee quotation and parcel guidance.
The documentation now links to the real quick-start steps rather than the
unresolved `/project/[id]` placeholder. The route checker refuses unresolved
parameter links: 237 page files and 824 static links currently have no unmatched
references. This checks link syntax, not every rendered page or administrator access.

App and test type checks and scoped lint pass. The 55-test fieldbook checkpoint
and six adjacent fieldbook/CSV/dispersion tests pass; counts overlap and must not
be added. These are source checks, not physical-instrument or large-job proof.

Public parcel guidance now validates its response, uses plain SVG icons and
describes approximate navigation without declaring the record verified. Its
existing server endpoint still needs a dedicated privacy/issue-authority and CRS
repair: it reads a project by ID without a scoped sharing token, invents missing
surveyor/monument status, and assumes Arc 1960/UTM defaults with a conversion
fallback. Do not use that endpoint as authoritative boundary navigation or
certified evidence. This is an open release blocker, not resolved by icon changes.
