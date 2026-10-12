# Export package verification — 9 October 2026

The PWA-enabled verification image `metardu-release-verify:20261009-export-package`
completed successfully. Its image identity is
`sha256:99fe41bbc79761085787aa03a0f4e1e9cae3c422530ca5e8780806a9fc4079ed`.
It runs only on loopback port 3015 against the marked synthetic database,
with a restricted runtime role and no customer/provider credentials.

Four native Linux packaging tests passed without skips. Seven native dependency
checks passed, followed by production compilation and strict type checking.
Runtime startup verifies 108 migration checksums. Inspection confirms Sharp
0.35.5, librsvg 2.63.2 and no root dotenv files in the portable image. The new
standalone launcher loads source-root configuration without bundling it;
packaging rejects path escapes, junction escapes and stale bundled dotenv files.

All ten public imagery HTTP checks and fourteen project-map/auth checks passed.
They cover private cache headers, actual password sessions, unrelated-account
denial, declared project reference systems, zero coordinates, soft deletion and
rejection of missing or invalid survey evidence. They use synthetic data and do
not establish deployed provider OAuth or customer-database upgrade readiness.

In the actual browser, the expanded NASA map occupies the 1280-by-720 viewport
at (0,0). Preparing its GIS ZIP retains the explicit download link, including
after clicking and capturing a screenshot. Reserved footer rows prevent the
download itself from resizing the map and invalidating the prepared view.

Browser automation's download-event and downloadMedia calls timed out, but the
host actually saved `METARDU-imagery-2026-10-09 (1).zip` in Downloads at
16:46:33 UTC. Those actual bytes were copied to the evidence folder and checked
with `scripts/verify-imagery-archive.mjs`. All six expected entries, ZIP CRCs,
PNG dimensions, raster SHA-256, honest provenance, parseable projection and
pixel-centred affine/world-file consistency passed. The independently projected
view centre agrees with the exported raster coordinates. This is actual browser
output verification, rather than a newly generated fixture archive.

Evidence: `test-results/export-package/source-verification.json`,
`archive-verification.json`, `browser/imagery.zip`,
`browser/expanded-export.png`, and the imagery/project HTTP result folders.
Source hashes were frozen before this build; the subsequent frameless login
change is verified separately and is not part of this image.

External GIS application import, field accuracy, offline/origin-outage behavior,
live provider OAuth and public ChatGPT listing remain unverified. The 6.02 MB
TVM/WebLLM chunk remains outside the PWA precache; the global limit was not raised.
No customer deployment, data or applied migration history was changed.
