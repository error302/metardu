# CAD draft and attachment verification — 9 October 2026

Later same-day input, pointer and cache work is recorded in
[CAD input and pointer verification](CAD_INPUT_POINTER_VERIFICATION_2026-10-09.md).
Its evidence supersedes the earlier mouse-handler/hover-menu/import limitations
below; actual device and wider engineering-output gates remain open.

This pass repairs reproduced CAD workflow problems, with separate source,
browser and synthetic database evidence. It does not establish full CAD or
platform production readiness.

## Repairs

- Standalone edits now notify the draft-save callback after committed history
  changes. Previously that callback was only exposed by the project-mode save
  button, so standalone edits could disappear and attachment used an older
  document. Transient drag previews do not write large image-bearing drafts to
  local storage on every mouse movement.
- Standalone attachment uses the existing owner-checked CAD artifact endpoint.
  It no longer reads and replaces the whole project boundary object, invents
  coordinates from fallback origins, or replaces adjusted survey stations.
- A new blank sheet starts without an assumed metric scale or grid origin.
  Metric distances, perimeter, area and scale bar remain unavailable until the
  drawing is calibrated. Explicit coordinate input remains part of the draft;
  attachment does not turn it into certified survey observations.
- The fixed mobile sidebar previously left only 92 pixels for the canvas at a
  390-pixel viewport. A closable properties drawer now preserves a 380-pixel
  canvas, with no horizontal overflow. The drawing tools remain in three columns;
  mobile columns measure 44 pixels each. Desktop properties remain visible.
- The line-preview mouse callback now refreshes its tool, start point and ORTHO
  state. A test reproduced a mid-line ORTHO switch producing y=120 instead of the
  required constrained y=100 before this correction.

Project-list loading, sign-in failures, malformed server responses and failed
saves are visible instead of appearing as an empty workspace or a successful
save. Local storage failures warn that the current in-memory drawing needs a
downloaded backup. Restored standalone documents use the shared structural
validator. Numeric guards express valid finite origins/scales without non-null
assertions, and both changed CAD source files now pass scoped lint.

## Evidence

The regression suite initially failed for lost local edits, unsafe attachment,
invented blank-sheet scale and hidden authorization failures. The properties and
ORTHO regressions also failed before their respective fixes. The final affected
run passed 14 tests across the actual standalone page/editor, CAD artifact API
and DXF utility suites. Strict application and test TypeScript checks passed.
The test run emits a Node 26 experimental localStorage warning in its Node
environment; the browser-storage workflow itself runs in JSDOM and the actual
browser, rather than relying on that experimental Node feature.

Actual source-preview browser checks on loopback port 3020 confirm a synthetic
beacon with zero northing survives reload, mobile properties open and close, the
canvas width improves from 92 to 380 pixels, and signed-out attachment presents
the sign-in return path. Seven subsequent CAD commands formed a four-point closed
synthetic draft. Its metrics remain labelled uncalibrated instead of displaying
assumed survey values. Screenshots and layout measurements are in
`test-results/cad-workflow/browser/`.

The existing packaged owner-checked artifact API on loopback port 3015 passed 21
HTTP checks against the marked synthetic database: fourteen project/auth checks
and seven CAD checks. Actual PostgreSQL reads prove the CAD artifact round-trips
while exact original adjusted stations, including zero coordinates and sibling
project metadata, survive. Another account cannot read or replace the artifact;
invalid dimensions return 400 and failed writes leave the complete stored object
unchanged. Synthetic verification profiles are suspended at completion.

JSON object equality in this HTTP verifier uses structural comparison: PostgreSQL
JSONB property order is not evidence of changed data. Results and source hashes
are recorded in `test-results/cad-workflow/verification.json` and `http/result.json`.

## Remaining CAD gates

- The updated client is source-preview verified, not included in the earlier
  export-package image or deployed to metardu.space.
- Touch drawing/panning still uses mouse handlers and needs a deliberate pointer
  interaction implementation plus device verification.
- The export menu depends on hover, and CAD file import still performs a shallow
  cast/check instead of the shared complete document validator.
- Standalone CRS/scale registration and project-reference reconciliation need a
  usable, explicit workflow before unreferenced drawings can produce survey-grid
  deliverables. No default CRS or guessed origin should be added to bypass this.
- Complete CAD numerical/topological validation, bearing formatting, calibration,
  SVG/CSV/DXF/print exports, and external CAD application import remain separate
  work. These focused checks do not certify drawing accuracy or national acceptance.

No customer deployment, project, observations, provider OAuth or applied migration
history was changed.
