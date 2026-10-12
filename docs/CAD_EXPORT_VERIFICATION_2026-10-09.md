# CAD export integrity — 9 October 2026

This pass extends the [reference and calibration work](CAD_REFERENCE_CALIBRATION_VERIFICATION_2026-10-09.md).
It repairs demonstrated export/data-loss defects and verifies actual synthetic
browser downloads. It does not establish full platform or field readiness.

## DXF

The former utility silently used 0.1 metres per canvas unit and a zero origin
when called without reference fields. Its cached boundary label could describe
a 100-metre line as 10 metres. A multiline point label could inject additional
group-code records, including a second EOF marker. Line annotations were omitted.
Eight initial regressions failed before the changes.

All direct DXF callers now pass the shared document/reference validator. A complete
projected metre CRS, scale, origins and paired point coordinates are required.
Canvas/grid disagreement fails visibly with instructions to apply the reference
form. Boundary bearings and distances come from the existing engineering engine,
and supplied point coordinates retain their full numeric precision. The latter
has a separate regression for a coordinate differing by 0.00000001 metres within
the frame reconciliation tolerance.

The existing `dxf-writer` dependency emits AutoCAD 2007 AC1021, with metre units,
layers, entity structure, line/text annotations, north arrow, scale bar and draft
metadata. UTF-8 is supported in the 2007-and-later format, unlike the earlier
header used by the handwritten generator. [Autodesk string storage reference](https://help.autodesk.com/cloudhelp/2019/ENU/AutoCAD-DXF/files/GUID-2553CF98-44F6-4828-82DD-FE3BC7448113.htm)
DXF TEXT values fold control characters and line breaks into spaces so they cannot
become group-code lines. Original identifiers remain in the saved CAD document.
Raster imagery is explicitly excluded from vector DXF; visible imagery adds that
note to the export. This is a 2D plan: entity Z=0 is the drawing plane, not a
surveyed elevation. Existing utility/readiness fixtures had inconsistent scales
and coordinates and have been corrected; the entire legacy readiness script was
not executed in this pass.

## SVG and CSV

SVG serialization works on a scene copy. It removes the editor grid, active line,
measurement/calibration previews, selection/snap rings and interaction styling;
canonical boundary paint and coordinate-derived labels replace selection state
and stale measurement text. The live editor keeps its active tool. XML namespace
handling is validated by parsing the resulting document. Exports carry a visible
draft/reference footer and machine-readable CRS, scale/origin and certification
metadata. Remote/executable image references and non-plain annotation colours
are refused; supported embedded raster images remain self-contained. Physical
print scale is not certified.

CSV retains its first four columns and appends CRS, Units and Reference. E/N are
formatted to three decimals; full precision remains in the CAD file and DXF.
Unreferenced records are marked as such, with unknown units rather than guessed
metres. Partial E/N pairs are refused; uncoordinated design points remain blank.
Text fields correctly quote commas, newlines and double quotes. Formula-like text
receives a tab prefix following [OWASP guidance](https://community.owasp.org/attacks/CSV_Injection).
That prefix is part of the CSV cell value; consumers requiring literal point
names must use the CAD file or account for the documented prefix. No universal
CSV escaping policy protects every spreadsheet and importer. Excel opening,
saving and re-opening were not tested.

The editor now renders saved line annotations. Dragging a line translates both
endpoints using its original geometry, preserving length. A point move without a
complete reference changes layout while preserving its supplied E/N. Both bugs
were reproduced in failing regressions. Beacon labels now clear a horizontal
incident boundary; general label-collision placement remains future work.

## Evidence

- 57 focused tests passed across export integrity, the real editor export and
  standalone workflows, existing DXF utilities and reference/calibration tests.
- Strict application and separate test TypeScript projects passed.
- Production-source lint was scoped to the edited editor/export modules.
- Actual browser downloads were taken from the isolated source preview on
  localhost:3021, using synthetic QA-CONTROL and QA-B at E=500100/500200, N=694.
  Their drawn boundary is 100 metres with bearing 90 degrees.
- `scripts/verify-cad-export-files.py` loaded the actual DXF through **ezdxf 1.4.4**
  using normal `readfile`, with **zero audit errors and zero repairs**. It checked
  POINT/LINE coordinates, bearing/distance text, CRS/units, Unicode draft text and
  the 50-metre cartographic scale bar. Dependencies are isolated in `.cache`, with
  no additions to the site's package manifest.
- Python's XML and CSV parsers independently checked the actual SVG and CSV
  against literal controls, including missing editing previews, label clearance,
  frame metadata and declared reference fields. Sharp rendered the actual SVG
  into `drawing.png` for visual inspection. The frame source file is retained.

Browser artifacts and hashes: `test-results/cad-export/browser/native-verification.json`.
Source/test evidence: `test-results/cad-export/verification.json`.
Logs: `.cache/release-verify/cad-export-*`, including failures before fixes.

## Remaining release gates

These changes are local source/runtime work; they have not been packaged into
the earlier verification image or deployed to metardu.space. Independent parser
ingestion is not AutoCAD desktop, instrument or field acceptance. Native raster
calibration/upload, all symbol/linetype conventions, mobile/physical-device
coverage, general topology/label placement, CAD PDF print layout, elevation-aware
CAD exchange and jurisdiction-specific accuracy/legal acceptance remain open.
Other platform gates—live provider OAuth, deployed HTTPS ChatGPT tool testing,
public listing, payments and approved customer-database migration rehearsal—are
not changed by this pass. The original production-readiness goal remains active.
