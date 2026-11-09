# CAD input, pointer and cache verification — 9 October 2026

This pass repairs CAD import validation, keyboard/tap export controls, pointer
interaction safety, coordinate precision and malformed numeric input. It also
fixes a reproduced development-cache problem that hid the corrected interface.

## Input and output controls

CAD file import now uses the complete shared structural schema, including finite
values, bounded fields, unique point IDs and valid boundary references. Invalid
or unreadable files leave the current drawing intact. Files over 8 MiB are refused
before reading. A new import aborts an earlier pending reader; stale completions
cannot replace a later selection. A valid import resets transient tools/view state
and remains undoable. The file picker can select the same file again after a failure.

The export menu uses the installed Radix menu through the existing UI wrapper.
It opens by keyboard or click, closes on Escape and returns focus to its native
button. The content is portalled, avoiding clipping by the editor's canvas shell.
Menu items have 44-pixel minimum height. The state-file label now matches its
actual `.metardu-cad` extension. The shared Button component does not forward
refs under the installed React 18 runtime, so this trigger uses a native button
with the existing `buttonVariants` styling rather than suppressing that warning.

## Pointer safety and precision

A regression reproduced Pan View moving a control from E=100/N=694 to
E=140/N=674. Entity handlers were consuming the pan gesture and starting geometry
drags. Mouse, pen and touch now use pointer events with capture, primary-pointer
filtering and a gesture snapshot. Pan, space-pan and middle-button gestures pass
through entity handlers to the viewport. Secondary touches cannot take over or
finish a primary drag. Pointer cancellation or unexpected capture loss restores
the preceding drawing/history and transient tool state. Drag previews remain out
of local saved history until release; release reads the latest document reference.

Point placement, coordinate edits and drags retain the supplied precision rather
than rounding geometry to a tenth of a canvas unit. The regression's 130.031
coordinate previously appeared at x=130 while its stored grid coordinate remained
130.031. Both representations now agree. Numeric entry uses a shared complete
decimal parser, accepts signed/scientific notation and zero, and rejects blanks,
numeric prefixes, malformed decimals, hex, nonfinite and out-of-range values.
Rejected entries do not overwrite a control point or create a new beacon.

## Cache correction and browser evidence

An actual response from the previous development origin served an unversioned
CAD chunk with `public, max-age=31536000, immutable`. Its bytes contained the new
controller while the browser still displayed the old Export button after reload.
The immutable policy now applies only in production. Development uses no-store.
Existing browser entries cached under the old policy may require a hard refresh
or a fresh origin once; the verification used an isolated fresh loopback port 3021.
Production versioned-asset caching is retained.

The fresh origin's actual chunk response is `no-store, must-revalidate, no-cache`.
Its browser presents the new keyboard menu. A real file-chooser import loaded the
labelled synthetic input with E=500100/N=694. A native browser drag starting over
that control changed the viewport by (40,20) pixels while its entity remained at
canvas (100,100). The visible schedule retained 500100.000/694.000. The actual
downloaded CSV was copied and byte-checked against those independently supplied
values. A later refreshed browser rejected `PT 130..031 674 BAD` without creating
a beacon. Mobile menu screenshots and runtime/chunk/CSV evidence are in
`test-results/cad-io/browser/`.

## Automated checks and limits

The final affected page/editor/API/DXF run passed 28 tests across three suites.
The coordinate parser passed 19 independent valid/invalid cases. Two Node tests
verify development no-store and retained production immutable caching. Strict
application/test TypeScript and scoped source lint passed. Earlier regressions
failed before the corresponding changes. The Node API test environment emits an
experimental localStorage warning under the host's Node 26; actual browser draft
storage is tested separately. The added reload assertion also passed independently.

These are local source/runtime checks. The new client has not been packaged into
the earlier verification image or deployed to metardu.space. Actual touch/pen
devices, external CAD import, all export formats, CRS/scale registration and
reference reconciliation, calibration/topological/numerical validation, raster
asset handling and legal/national acceptance remain separate gates. Structural
input validation is not field accuracy or coordinate-system verification.
No customer data, provider OAuth or public ChatGPT listing was changed.

The subsequent [reference and raster calibration pass](CAD_REFERENCE_CALIBRATION_VERIFICATION_2026-10-09.md)
adds an explicit reference form and repairs the drawing/control scale mismatch.
Its verification and remaining limits are recorded separately from this snapshot.


## 10 November 2026 follow-up

Source baseline is `5194fc29e0498582142719e6a44ee73891a1d36f` with the CAD, map and diagnostics work in the shared checkout. Browser checks used the existing synthetic preview at `127.0.0.1:3021`. Production observations below came from read-only admin diagnostics.

- A wheel up/down pair returned the CAD viewBox to its initial dimensions and position within floating-point tolerance. The document scroll remained zero. Dragging by 90/65 screen pixels moved the camera on both axes. Arrow Up and Arrow Left each moved the view by 40 screen pixels.
- A dashed rectangle and its offset copy rendered as two outlines. The document still showed 15 survey points and 16 edges. A synthetic PNG rotated 90 degrees around its center and Fit image brought it into view. Undo removed the five temporary editing steps.
- Fit selected sketch zoomed the Survey Map to the selected synthetic outline. Its scale bar changed from 50 m to 10 m.
- Fresh live admin samples scored 100 and 90 using the dashboard's FID fallback. TTFB was 567 ms and 1,486 ms. Request-to-first-byte time was 565 ms and 1,460 ms. Time before the request was 2 ms and 26 ms outside the DNS and connection buckets. The supplied 60 sample reported 4,141 ms in that pre-request bucket. The variation leaves sustained 98+ performance open.
- ezdxf 1.4.5 read the synthetic DXF and found two closed dashed rectangles, a centerline circle with a 2.5 m radius, two retained control points and one retained survey edge. Its audit reported zero errors and zero repairs.
- The focused CAD, map and performance run passed 101 tests across 11 suites. Application, test and tool TypeScript checks and scoped lint passed.
- The first Docker inventory check hit an access error. The authorized read-only retry passed application, PostgreSQL and Redis health, required services, one application container, and the completed migrator on the application image. The reported backup completion was 9 November at 17:03:42 UTC. Restore validation, source promotion, physical touch testing, receiving-CAD validation and professional field acceptance remain open.
