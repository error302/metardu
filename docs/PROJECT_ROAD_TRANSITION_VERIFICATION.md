# Project road transition connection

Source checkpoint: 15 October 2026. This extends the existing project workflow;
it is not construction approval or a completed road-design acceptance record.

## Reproduced gap and repair

The standalone symmetric clothoid engine already evaluated TS/SC/CS/ST geometry,
but project horizontal schedules rejected every transition, and project input
forms offered no transition lengths. Five integration checks and three component
checks failed before repair. The project now delegates to that same engine,
retains explicit entry/exit lengths, evaluates both turns, and accounts for full
transition-plus-circular length when chaining later curves. Tangent overlap,
incomplete/nonfinite/conflicting lengths and transition data on endpoints or
collinear PIs block a fabricated schedule. Explicit zero/zero uses the circular
limit. Unequal lengths remain visible and are rejected rather than averaged.

The independent numerical reference integrates the defining linear curvature
law; see [Esri's clothoid definition](https://pro.arcgis.com/en/pro-app/latest/sdk/api-reference/topic75875.html).
No survey formulas were moved into React, and no new dependency was installed.

## Project inputs and outputs

Middle PIs accept supplied transition lengths. Rejected saves retain the entered
values and show an error. The complete project JSON remains authoritative over
the older relational mirror; hydration checks retain transition fields.
Project outputs and CSV/PDF exports now retain curve type, both spiral lengths,
full curve length, TS/SC/CS/ST, projected CRS and draft status. The circular
TC/CT fields are blank for a transition, with SC/CS labelled separately; the
internal circular-start/end values continue to support existing calculations.
Centreline targets evaluate actual entry/circular/exit coordinates and tangent
bearings, with declared height reference and explicitly selected levels.

Rendering exposed split numeric cells in the expanded horizontal PDF table.
Printed road schedules now use two complete linked column groups, with PI
repeated, human-readable headers and three decimal places. CSV values retain
full calculated precision. The PDF generator rejects column groups that omit
source columns. Other engineering PDFs retain their previous default precision.

## Evidence and boundaries

The ignored reusable artifacts begin
`.cache/release-verify/project-road-transition-source`: horizontal and target
CSVs, synthetic input JSON, PDF, two rendered pages and native verification JSON.
The QA-only generator uses installed TypeScript; it does not install packages,
build the app or create containers. Native Python CSV/PDF parsers check 99 target
rows against an independently integrated R=300 m, delta=90 degrees, Ls=60 m
fixture, retain all four junctions, check draft/reference metadata, and confirm
that critical printed numerical values are whole cells. The five-page A3
landscape export was rendered; its parameter/stationing and transition-target
pages were inspected. Numerical regression agreement is not physical accuracy.

Final source verification: 104 tests passed across 14 suites covering project
road geometry/inputs/outputs/persistence, vertical alignment, standalone spirals,
CSV/PDF and drainage output compatibility. Both strict TypeScript projects and
ESLint on every changed/new source and test file passed. The final PDF-only
regression rerun also passed all four tests. No hook or scanner suppression was
introduced.

The existing read-only `npm run docker:verify` passed with healthy application,
PostgreSQL, Redis, worker, collaboration and NTRIP services, the existing backup
service and one application container. Its backup receipt is archive/header
evidence, not a restore test. No production service, image, builder, volume or
schema was changed. No browser/project save, customer database, downstream
instrument import, physical print scale or field check is claimed here.

## Open acceptance work

The legacy IP persistence defects were reproduced and repaired in the subsequent
source batch documented in `ALIGNMENT_PERSISTENCE_VERIFICATION.md`. Native HTTP
checks now cover its server calculation, private access and canonical draft
synchronization. Migration 110 and the pinned source were subsequently promoted;
see `SURVEY_RELEASE_PREPARATION.md`. Old computed columns are not field truth.
Draft step-completion indicators still
need evaluation/evidence-based gating across the workspace.

Asymmetric/compound/reverse transitions, corridor offsets, superelevation,
approved design/control/revision identity, real device round trips and field
acceptance remain open. The completed source promotion does not prove those
field workflows. The cadastral, drainage, construction, topographic, ChatGPT,
provider, payment and release gates in the workflow/readiness trackers remain
part of the full platform objective.
