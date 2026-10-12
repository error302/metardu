# Contour import, export and mobile verification — 11 October 2026

The runtime checkpoint below is historical. Current production is healthy image **44106f7a461e...**, release **working-tree-03dc5697ba72209d**. The notice/worker/mobile release passed 87 focused source tests, both type checks, scoped lint and 46 actual production normal-account HTTP checks. The packaged contour worker completed in Chrome. The new in-platform ChatGPT notice was published at 2026-10-11T17:56:45.516Z; its period ends 2026-11-10T17:56:45.516Z (10 November, 20:56:45.516 EAT). Customer linking remains disabled; public HTTPS and actual human consent remain separate gates. The notice record is verified in the fresh upload backup. All 109 hashes, restricted role, supporting service identities and mounts are preserved. Read [NOTICE_WORKER_VERIFICATION_2026-10-11.md](NOTICE_WORKER_VERIFICATION_2026-10-11.md) for the current evidence and rollback identities.

## Earlier workflow evidence

The source contour workflow now rejects invalid measurements and incomplete
reference declarations before creating metric exports. These changes remain
source-only until the planned application promotion and production checks.

## Demonstrated defects repaired

- CSV parsing accepted Infinity, overflow and numeric prefixes. Collapsed empty
  cells shifted height/quality into northing/elevation; incomplete or reordered
  headers could substitute the wrong column. Strict finite decimal parsing now
  preserves blank cells, quoted CSV, scientific notation and genuine zero; a
  declared header must identify three distinct coordinate columns. Leading comments
  no longer cause a reordered header to be ignored.
- DXF converted non-finite values to zero, rounded away sub-millimetre coordinates
  and merged close elevation layer names. Export guards reject invalid coordinates,
  spots, bounds and intervals; full numeric values and distinct layer names survive.
- Metric exports require a registered projected metre CRS, a stated height datum/
  benchmark and explicit confirmation of metre heights. Unknown preview units stay
  labelled as source units, and cubic quantities remain withheld while declarations
  are incomplete. No reference, transformation or unit conversion is inferred.
- The normal CAD parser rejected the original polyline structure. Explicit DXF
  subclasses and the layer-table handle now produce UTF-8 DXF 2007 that passes
  normal ezdxf parsing with zero audit repairs. Index and intermediate lineweights
  are retained. Earlier invalid files remain as failure evidence.
- The PDF scale value had been positioned with spaces; endpoint labels now anchor
  directly to the ticks. PDF/SVG identify grid north. CSV source text is inert for
  spreadsheet formulas. Export failures are visible in the tool.
- Mobile download targets measured 36 px and now measure 44 px. Disabled exports
  visibly show their unavailable state. Unverified unlimited-desktop/offline/data-
  delivery promises were removed from the shared compute notice and callers.

## Browser and independent file proof

CUA operated only `http://127.0.0.1:3021/tools/contour-generator`. It rejected the
missing-northing row, parsed nine synthetic points, generated 14 contours (two
index lines) and eight TIN triangles, and withheld all four export buttons until
reference/unit declarations were complete. No page storage or application heap
was written through automation internals. The localhost training drawing was not
opened or changed.

The synthetic surface is independently defined by
`Z = 100 + 0.1(E - 500000) + 0.05(N - 9900000)` over a 100 m square. Its mean height
above 100 m is 7.5 m, giving 75,000 m³. The actual browser reported that value.
This is numerical/synthetic evidence, not a field quantity or design approval.

Normal UI controls downloaded DXF, CSV, SVG and PDF. Files were copied only after
their synthetic title/datum was checked; original Downloads files were preserved.
Download-event tracking timed out and reset automation. A fresh supported browser
tab restored control; file checks established the actual transfer rather than
assuming the button click succeeded.

Independent checks in `scripts/verify-contour-browser-files.py` establish:

- 14 actual LWPOLYLINE entities, metre units, correct elevation and 0 parser errors/
  audit repairs. Every native vertex satisfies the independent plane to 1e-8 m.
- 55 CSV vertices with the same contours, index flags, CRS and height reference.
- Valid SVG XML with 14 polylines, explicit draft/source labels and no scripts.
- One A3 landscape PDF with the source title, key, reference labels and all text
  inside the page. PNG rendering was visually reviewed.

15 focused import/export tests, strict application/test typing and scoped source
lint passed during this work. Later integrated source checks are recorded with
the release evidence. Native CAD application import, physical printed scale,
instrument accuracy, source-observation quality and field acceptance remain open.

## Mobile navigation

At the requested 390×844 viewport, document client/scroll widths were both 380 px:
no horizontal overflow. All four download controls measure 44 px high. The More
drawer's eight destinations are distinct from the five primary bottom destinations.
Escape closes it and restores focus to More. The viewport override was reset.
This is browser responsiveness/accessibility proof, not physical touch-device proof.

Evidence: `test-results/contour-source-browser/native-verification.json`, actual
downloads, rendered PDF, `reference-gate.txt/.png`, `mobile-export.png`,
`contour-map.png`, and retained failing DXF/earlier scale-label PDF files.
