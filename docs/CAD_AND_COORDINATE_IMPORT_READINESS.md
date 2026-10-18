# CAD workspace and coordinate import

Continuation results and the current release boundary are recorded in
`CONTINUATION_ACCEPTANCE_2026-10-18.md`. That record adds the normal browser import,
exact source download/retry, 505-point project-CAD save, source-grid/asynchronous
load/save guards and verified fixture cleanup; the checkpoints below are earlier.

This increment continues the unified METARDU checkout and its existing production
release process. It is not completion of field-to-finish platform acceptance.

## Changes prepared

- Both CAD routes use a focused workspace with no marketing footer. Site
  navigation expands on demand without remounting the drawing. Mobile dock
  clearance is reserved by the workspace shell rather than a paper-sized page.
- A theme-aware, continuous SVG camera supports pan, focal wheel zoom, zoom
  buttons and fit-to-geometry. Camera state does not change document coordinates,
  reference settings or undo history. Model geometry may extend beyond the old
  sheet. SVG exports include those extents with a clean white export background;
  workspace grids and camera transforms are excluded. Printed scale remains
  unverified; DXF/CSV use the declared survey frame.
- Mobile navigation turns through four groups by swipe, next button or arrow
  keys. The More drawer remains available. There is no automatic timed rotation
  while a surveyor is working. Development query tooling is explicitly opt-in.
- Coordinate import stages source, project/reference, units, selection and
  acknowledgement. It preserves unknown heights, explicit zero heights, original
  UTF-8 bytes (including BOM), SHA-256 and the reviewed reference snapshot.
  A single transaction stores points, import session, source capture and audit.
  Stable retries and semantically identical new request IDs replay the original
  receipt. Existing names reject a new import rather than overwrite points.
- CSV uses quoted-field parsing and headers or explicit E/N column order. Strict
  decimal parsing rejects numeric prefixes. JobXML and LandXML parse on both
  client and server; GSI coordinate unit precision is read per word, with an
  explicit international/US survey foot definition where needed. LandXML unit
  declarations cannot be ambiguous or partially converted. Angular observation
  processing and proprietary binary formats are separate workflows.
- Bounds: 2 MiB UTF-8 source and 5,000 coordinate records; no silent truncation.
  Coordinate source and height datum require operator declarations. This does
  not establish instrument accuracy, certification or a datum transformation.

## Source and synthetic evidence

The focused regression set passed 209 tests in 21 suites. The original failures
included zero-height substitution, ambiguous CSV axis interpretation, GSI unit
scaling, unacknowledged database success, static mobile dock access, and an
incorrect fit button.

`scripts/verify-point-import.mjs` passed 17 real PostgreSQL/HTTP checks against the
existing loopback preview and explicitly marked synthetic database. They include
foreign-owner denial, stale-reference and hash rejection, exact durable receipt,
NULL/zero height distinction, WGS84 geometry, exact source download, concurrent
retry deduplication, duplicate name refusal, native transaction rollback after a
later capture failure, and a 501-point import spanning multiple SQL chunks.
The initial run cleaned its exact fixtures. A later run temporarily retained
explicit synthetic browser fixtures for normal-UI acceptance; final cleanup is
recorded with the release evidence.

CUA phone inspection confirmed the original 15-point / 16-edge localhost
training drawing remained present. Panning changed the SVG viewBox while every
rendered entity label/transform remained identical. The footer was absent and
site navigation expanded/collapsed. No browser storage injection or drawing
replacement was used. Final release and browser evidence is recorded in
`UNIFIED_METARDU_CONTINUATION.md`.

## Production boundary

No schema migration was added. Existing applied migration hashes must stay
unchanged. Promotion requires pinned source checks, the existing synthetic
rehearsal, actual rollback-image startup verification, backup/recovery review,
storage reserve and the one-container promotion controller. Supporting services,
customer records and the existing rollback image remain protected.

Physical Android/controller connectivity, offline conflict/quota/reconnect tests,
manufacturer job-file acceptance, independent numerical/printed deliverable
comparisons, payment-provider acceptance and notice evidence remain separate
platform gates. No claim of universal format or instrument compatibility is made.

## Reference material

- [NIST: international and US survey foot](https://www.nist.gov/pml/us-surveyfoot).
- [Autodesk: LandXML unit conversion](https://help.autodesk.com/cloudhelp/2024/ENU/Civil3D-UserGuide/files/GUID-2592133C-49CA-4600-9B6D-7A830A8E5315.htm).
- Leica, *GSI ONLINE for Leica TPS*, word-position/unit table and WI81–86;
  manufacturer-authored manual, [archived copy](https://www.geoskola.hr/~slavicek/instrumenti/Leica_gsi_manual.pdf).
