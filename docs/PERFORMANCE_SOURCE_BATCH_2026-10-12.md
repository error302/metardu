# Performance source batch — 2026-10-12

## Measured baseline

The promoted production bundle was inspected without changing the running stack. The largest emitted public chunk is `fbe89ba5.7144cd6a95cd6b78.js` at 6,020,378 raw bytes (2,134,816 gzip bytes). It is not present in the initial script list for `/`, `/tools/contour-generator`, `/map`, or `/tools/setting-out`; the public route scan therefore does not establish an initial-page regression. The chunk is above the offline precache threshold and remains a separate offline-risk item.

## Source change

`src/app/tools/contour-generator/page.tsx` now lazy-loads Import, Breaklines, Settings, Map, and Export tabs with `next/dynamic`. Each tab uses the shared METARDU brandmark as an accessible `role="status"` loading panel, so switching tabs does not produce a blank region while the split chunk arrives. The PDF generator remains dynamically imported at the export action.

## Verification

- `npm run typecheck:app` passed after the change.
- Focused contour suites passed: 2 suites, 16 tests.
- Source preview at `http://127.0.0.1:3021/tools/contour-generator` loaded the 400-point synthetic demo, generated 28 contours, 5 index contours and 722 TIN triangles in the worker, then switched through Settings, Map and Export; the Export panel was present.
- At the narrow approximately 595px source-preview width, the Export tab bar wraps to a second row and dense map point labels remain crowded. This is recorded as a responsive annotation/layout follow-up; no production claim is made from the synthetic preview.
- Production baseline route scan and public chunk inventory are recorded in `test-results/performance-source-batch/production-baseline.json`.
- The synthetic database preflight succeeded, and the isolated `ANALYZE=true` build was attempted using repo-local alternate directories. The Next build remained in its optimized production-build phase and was stopped without producing a treemap/report. The original `.next-analyze` artifacts were preserved; no bundle-savings claim is made from that attempt.

## Release boundary

This is source verification only. The current promoted production image is unchanged. A candidate build, migration/backup review and one planned app-only promotion are required before this source batch can be treated as production evidence.
