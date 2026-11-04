# Topographic PDF and mobile source verification — 2026-11-04

Base commit: 04838d6d69dbcbb20b03498253961937315c7b2a. The files below were uncommitted when verified; their hashes identify this source snapshot and do not identify a deployed artifact.

- Complete `npm run lint`: 3,415 files; zero ESLint errors, warnings, and accessibility findings; exit 0 after corrections to two PDF tests.
- All three TypeScript checks passed before the test-only lint fixes; the test TypeScript check passed again afterward.
- Eight focused Jest suites passed 51 tests before the test-only lint fixes; the two PDF suites passed all nine tests again after those fixes.
- PDF scale and recovery tests use synthetic data and mocks; they do not prove a production export, a physical print, a field measurement, or independent surveyor approval.
- Browser presentation of both maps and the marketplace remains unverified because Computer Use reports local browser use disabled.
- Production remains on the separately accepted b172cbc7595670e0057a4c9eb7ff4374945871d9 until a later exact deployment receipt proves a change.
- The last observed scheduled backup remained overdue; a successful scheduled run, restore and offsite recovery are separate gates.
- Retain field, independent surveyor, receiving CAD and calibrated print, provider, physical phone, security-deferral, offsite/key recovery, and signing rotation gates.
- This snapshot does not establish app-wide mobile responsiveness, international font coverage, or professional contour accuracy.

## SHA-256 of checked source files

- `src/app/api/topo/export/dxf/route.ts`: `c74f3ca2e43327a3447cca8e59eaa3f0be61805fad2b71e710a066f30f09e632`
- `src/app/api/topo/export/pdf/route.ts`: `39e34a505411fe74c2dd2ae35934c2c7752965fbb586d16bfda33a6ff7b5986d`
- `src/app/globals.css`: `a6334d99207ba5dfdfe6ca0b1062ddbaa548d1849095b8d1f6975cbcabffa5f1`
- `src/app/marketplace/page.tsx`: `e6ccfef1f2bbdf71f7ccdbe1c71586851dce9755249ef3189bafb7c73a8f70a1`
- `src/app/marketplace/marketplace.module.css`: `0c6c2742b613f6c11b3626453ec63c44d97d176fb0c698f0e3475bdd87725313`
- `src/app/project/[id]/topo/page.tsx`: `e26a64263a41be0ec24558f901c3f0dbe20d485a2759153403bcea3dd4303d30`
- `src/components/drawing/TopoEntityCanvas.tsx`: `8b80189f96068af4c95a322fd8e27e6f940f0dd848246baf2ca6d5cb0e6d8fd3`
- `src/lib/map/layers.ts`: `e42ff99311d171386077b9f87cac648b50b8062b17b5be3e95dfb94db3c3cf45`
- `src/lib/topo/surfaceDrawing.ts`: `f5698b03c08180932ba73d20b4d40b92dc323199b2e45aa3e38aa52a16aaba40`
- `src/lib/topo/surfaceDrawingPdf.ts`: `96da1204f2fff3f17d3f32ee7e557b9b1946f05d656c589b2058effd506c8088`
- `src/lib/topo/surfaceExport.ts`: `fd49433a23a0e0b614e01250f07faf8e21e7b624069d31918664240b56200358`
- `src/lib/topo/surfaceExportHttp.ts`: `13e43c8eb9acea669a48752dc4425ec7287f8d95f30817925a5c0c3506ff7017`
- `src/lib/topo/surfacePending.ts`: `9b66af1dc72c8297d4ad19ae952e2345b48e2145909ae4f9d58c28d386355b89`
- `src/lib/topo/surfaceRequest.ts`: `a362993cac47a5ff1109ba018225bbae90b8c20e18ad74bfacec3f9d8a5b2735`
- `src/lib/topo/__tests__/surfaceDrawingPdf.test.ts`: `a99d83c0119c37733e252c282d7464e3df7af03f04af8105f0da551f6f356819`
- `src/lib/topo/__tests__/surfacePdfRecovery.test.ts`: `341aeb45d74a686332233af08f3acdd5b9283d826d1ccde430a0b0e2d5c637cb`
- `src/lib/topo/__tests__/tinContours.test.ts`: `88c1314ce4ca57bd050bec62541c580793da03ff3ad5f66f03426e2caa46e299`
- `tests/saved-surface-workspace.test.tsx`: `5e87ae515447ce93a06e9dfc6a5253b4bafd052b8ba04ca7431c975060bcecde`
- `tests/surface-export-auth-context.test.ts`: `e199bf8d4627c6bc23409cf79fbe973f250f4e8f234b901c7b281164e1eca997`
- `tests/surface-pending-recovery.test.ts`: `9d1576e698f617fb1705f5f51cad1a60cb39e331391a4add3ce469e574b42e07`
- `tests/topo-canvas-presentation.test.tsx`: `b0cc68d9ffd63e5d7d682a41e71efef865be942672df60d8ef4b30acf0ca1d25`
- `tests/marketplace-mobile-interactions.test.tsx`: `cbcdf2e2c2656faeeb605ecf96ef1baea73461f5cc35f5194aa5657baa364bd3`

## Later contour validation change

After the full lint scan, TIN contour generation was changed to reject invalid indices, repeated vertices and zero-area or non-finite triangle area before flat or contour-free early exits. The full-scan result above applies to the earlier snapshot, not these two current files. Focused ESLint, eight contour tests and the application TypeScript check passed for this later snapshot. This is numerical input validation, not independent field accuracy acceptance.

- `src/lib/topo/tinContours.ts`: `5a9ecea97190e1abc511ac5ec514b21250bd97769dd305c619653d9a9dd51d2d`
- `src/lib/topo/__tests__/tinContours.test.ts`: `e7b1598718029bdeea62527daabf650b4962ce8b74a206f16ad21092dbb5f4db`

Additional focused verification: six contour-level, route-parity, terrain-domain, drawing, and retained-persistence suites passed all 46 tests after the later contour validation change. A fresh full lint scan was started for that source snapshot; its final result is not implied by this entry.

The subsequent complete `npm run lint` scan passed with exit 0: 3,415 files, zero ESLint errors, zero warnings and zero accessibility findings. The current contour implementation and test hashes matched the later snapshot recorded above when this result was appended.

## Synthetic PostgreSQL route verification

The existing `verify-surface-runtime.mjs` passed all 20 checks against `metardu_runtime_verify` using a restricted non-owner runtime role. It exercised the actual saved-surface and ad hoc contour route handlers with synthetic sessions, verified ridge contours, retained revisions, refusal cases and a DXF export/re-import. It is not browser, production, provider, receiving-CAD or field proof.

The current synthetic receipt `test-results/runtime-database/surface-runtime.json` has SHA-256 `f105434c4315df25779fc48ae2f4acf6a950520212a3dd27dadc2b6d78917988`.

The first attempt used the verifier default `metardu_release_rehearsal` and stopped because its `survey_points` table lacks `horizontal_crs`; that attempt created uniquely named synthetic fixtures and suspended its test profiles in its finalizer. Its failure is retained here and in the execution transcript; the current receipt was overwritten by the subsequent successful run against `metardu_runtime_verify`. No customer database was targeted.

## Restored browser and real PDF registration

Chrome extension access recovered on 4 November 2026. Source preview was started only on 127.0.0.1:3021 using metardu_runtime_verify, isolated storage and disabled reminder sending. Its owned process receipt and original next-env reference are retained under `.cache/topo-mobile-review-2026-11-04/`. The preview was later stopped and its temporary type reference restored, as recorded below.

A direct call through the real PDF exporter, database transaction, register and local file storage passed. Project 474f92f6-0e90-4129-83fb-d514db596876, revision 812605fe-a54d-420f-bbee-10ff8f64f2d6, request 8d111266-1e4f-414b-8423-b73c4f94cc90, deliverable 6ab0a132-4ef8-4036-a31d-462efa4f2c88. The 13,826-byte PDF SHA-256 is c5181a6c559ccf244c1e12ba1eecfcda1ad653aa279a92a8133d4f9e30e32fa5. Recovery returned identical bytes and one registered revision. Entitlement was mocked; production HTTP and paid authorization are not proved by this check. Files are retained in the isolated temporary storage root recorded in the execution transcript.

Actual source-browser checks covered the empty marketplace, filters, free-account posting restriction and the existing five-point saved topographic revision. At requested 390 px width, document client and scroll widths were both 380 px. Fit survey, visible markers, and unobstructed PDF/DXF buttons were reviewed. No new surface was computed through the browser. Populated marketplace cards/gallery were subsequently tested below; the real Enterprise 42-point final plan remains separate acceptance.

The unified project map first displayed the 20 m site at a zoom-18 cap as small dots and a three-point cluster. Its actual point loader was changed to allow a zoom-22 initial fit, stronger singleton markers and site-scale point labels with decluttering. After reload, all five distinct labels P1-P5 were visually verified on desktop and phone, with document width 380/380. Basemap imagery did not load in this source preview; provider delivery is unproved. The 0 saved features badge describes drawn features, not the field-point total.

This later change to `src/lib/surveyMapEngine/ol/pointLoading.ts` has SHA-256 `1a10dbea33cff2a31a1663ef623af799338d78b6520e0cd31d7438b32bb5775a`. It postdates the complete lint result above, so requires final source admission.

Screenshots: `C:/Users/user/.codex/visualizations/2026/10/22/01a165b5-7f3e-74f2-8335-e70c5dd35dcf/unified-map-desktop.jpg`, `unified-map-phone.jpg` and `marketplace-phone.jpg`. Viewport override was reset.

## Populated marketplace follow-up

A single labelled synthetic listing 6f77e1ad-8b7b-4b88-b292-c98381bc4fb7 was inserted only into the verified metardu_runtime_verify database for layout QA. It contained two clearly labelled synthetic test images and was not a real offer. Browser checks at 390 px exercised the populated card, long text/price/location, image navigation, fullscreen lightbox and closing back to details. The phone drawer measured client/scroll width 368/368, within a 380 px page.

The observed duplicate heading was removed while retaining the named Radix dialog. Long listing titles now wrap. Lightbox next/previous and close controls have 44 px minimum targets. Focused lint, all three interaction tests and the application TypeScript check passed. These changes postdate earlier complete scans.

The exact test listing was removed after checking it had no inquiries. Original listing IDs matched the pre-test inventory. No production data or subscription was changed. Browser viewport override was reset, the owned tab closed, and the exact owned preview process tree stopped. The original next-env.d.ts reference was restored after a compare check.

Screenshot evidence is retained alongside the earlier captures as marketplace-populated-phone.jpg and marketplace-populated-desktop.jpg.

- `src/app/marketplace/page.tsx`: `b2b23eb64a3dc38ba3a084a7b6a3cb97387e914a41bed043361540f32c6d771f`
- `tests/marketplace-mobile-interactions.test.tsx`: `070d4e83b2846f8fdda1a12d96082a4b0080066e2ca90a4907c930f2e359546e`
- `src/lib/surveyMapEngine/ol/pointLoading.ts`: `1a10dbea33cff2a31a1663ef623af799338d78b6520e0cd31d7438b32bb5775a`

## Final source review additions

All three TypeScript projects, the 71 release-contract tests, and the security invariant gate passed after preview cleanup. A later marker-only review set control and cluster image declutter mode to none, preserving their symbols while labels declutter; focused ESLint passed. That loader now has SHA-256 `38c140639e20bcf8295e151ebc5027c90e0adfac633abd5a7b18a797807a53e4`. The complete lint scan remained running at this entry.

The actual retained synthetic PDF c5181a6c559ccf244c1e12ba1eecfcda1ad653aa279a92a8133d4f9e30e32fa5 was independently opened and rendered with PDF.js and the native canvas runtime. It contains one 594 by 420 mm A2 landscape page, 184 extracted text items, the COMPUTED DRAFT warning and the declared EPSG text. The raster is retained as `C:/Users/user/.codex/visualizations/2026/10/22/01a165b5-7f3e-74f2-8335-e70c5dd35dcf/retained-draft-pdf.png`. Visual inspection found a separated map, legend, grid north, scale and reference footer; physical print and professional acceptance remain unverified. The attempted PyMuPDF check was unavailable because fitz is not installed; no package was installed to perform this check.

Final complete source scan: `npm run lint` finished with exit 0 after all source changes above: 3,415 files, zero ESLint errors, zero warnings and zero accessibility findings. All 71 release-contract tests and the security invariant gate passed. Final source admission and exact-SHA CI remain required before promotion; no production image was built or replaced for this checkpoint.
