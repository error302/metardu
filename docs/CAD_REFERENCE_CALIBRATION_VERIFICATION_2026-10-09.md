# CAD reference and raster calibration — 9 October 2026

## Reproduced defect

The previous calibration handler divided a picked 100-unit span by a supplied
50-metre distance and changed the whole drawing to 0.5 metres per canvas unit.
Existing control coordinates were left unchanged. A control at canvas (100,100)
with E=100/N=694 therefore disagreed with its saved frame. The UI regression
failed with expected scale 1, received 0.5 before the fix.

## Implemented behavior

Reference and calibration operations now live in `src/lib/cad/cadReferenceFrame.ts`.
They use the established CRS registry, coordinate mapping, structural validator
and boundary measurement engine. No CRS, datum or ground-to-grid factor is guessed.

For a complete referenced drawing, two-point calibration resizes the raster only,
uniformly about the first picked point. It preserves drawing scale, origins,
control coordinates and boundary measurements. The supplied distance must be a
project grid distance. Both picks must lie inside the raster, accounting for
rotation; invisible or locked rasters, coincident picks, invalid distances and
results exceeding model limits are rejected without saving. A frame that disagrees
with supplied control coordinates must be reconciled through the reference form.

For an unreferenced sketch, calibration can establish metric scale and edge
measurements without generating grid coordinates or a CRS. A drawing containing
supplied E/N needs an explicit reference before calibration; a referenced drawing
without a raster uses the reference form for layout scale changes.

The properties pane now has an expandable Coordinate reference form: registered
project CRS, metres per canvas unit, anchor point and E/N. Supplied anchor
coordinates are read-only there. Existing controls retain their E/N through a
scale change and are replotted. Raster and annotation locations follow the prior
frame where it exists. An uncoordinated anchor receives its explicitly entered
coordinates; other design points follow the declared frame. Changing an existing
registered CRS requires the transformation workflow. Geographic, display-only,
unsupported CRS and partial coordinate pairs fail closed. Print-scale metadata
becomes a draft requiring verification. These declarations do not verify accuracy
or convert drafting points into field observations.

Calibration uses a labelled, focus-contained Radix dialog with visible errors,
Escape dismissal and return focus. Native Radix primitives avoid the installed
React 18 ref incompatibility in the shared overlay wrapper. New mouse-placed
points receive E/N only when a complete valid survey frame exists.

## Verification

Fresh checks passed:

- 61 focused tests across the real standalone editor workflow, reference engine,
  complete coordinate parser and project CAD preparation.
- Strict application and separate test TypeScript projects.
- Scoped production-source lint for the edited editor, reference form and engine.

The focused tests include preservation, undo/redo, reload, zero northing, unsuitable
CRS, partial coordinates, rotated raster bounds, locked/hidden images, limits,
an explicit uncoordinated anchor and inconsistent saved controls. The added
reference-form regressions failed before the form existed. The two edge regressions
failed before their fixes. Logs are in `.cache/release-verify/cad-reference-*`.
Application lint rules applied directly to the test files also report existing
fixture/mock issues and prohibit literal fixture CRS codes; this pass does not
claim a clean whole-repository/test lint run.

Actual browser checks used the isolated source preview at localhost:3021 with
private dotenv values disabled and synthetic controls only:

1. Added QA-B at E=500200/N=694 beside QA-CONTROL at E=500100/N=694.
2. Applied 0.5 metres per canvas unit. Canvas positions became (100,100) and
   (300,100), with both supplied grid coordinates preserved.
3. Reloaded and observed the saved scale and both points.
4. Downloaded the actual CSV and compared all 115 bytes against the independently
   supplied values, including both labels/symbols. SHA-256 is
   `c4b85cadb3f1e8da965a9bbc797012beac7a6de507113aeb36adc7ff41d531ed`.
5. Rejected Web Mercator with visible survey-CRS guidance, then restored the
   valid form without altering supplied controls.

Artifacts are in `test-results/cad-reference/browser/`. The frameless login
preview was also re-observed and captured; its earlier desktop/mobile evidence
is in `test-results/login-frameless/verification.json`.

## Limits and next work

This extends the prior [input and pointer pass](CAD_INPUT_POINTER_VERIFICATION_2026-10-09.md).
Actual browser raster upload/calibration, the new reference form at a mobile
viewport, physical touch/pen, independent CAD/GIS ingestion, national datum/grid
accuracy and legal acceptance remain unverified. The attempted responsive override
did not resize this background CAD tab, so it is not counted as mobile evidence.
Raster calibration is tested through the real editor regression and pure engine.

These edits have not been packaged into the earlier verification image or deployed
to metardu.space. No customer database, OAuth provider or public ChatGPT listing
was changed. Remaining CAD work includes strict export geometry reconciliation,
CSV escaping/metadata, transient overlays in SVG export and external format
interoperability. The platform-wide production-readiness goal remains active.

The subsequent [export integrity pass](CAD_EXPORT_VERIFICATION_2026-10-09.md)
verifies actual DXF/SVG/CSV downloads and closes specific export and drag defects.
Its evidence and remaining gates are separate from this historical snapshot.
