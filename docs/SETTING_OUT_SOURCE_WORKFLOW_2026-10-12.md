# Setting-out source workflow — 2026-10-12

This is source and synthetic browser-test evidence only. It does not establish production, instrument, receiver, datum-control or field proof.

The component workflow test uploads an in-memory synthetic DXF through the real file input, enters station E/N/RL, instrument height, target height, registered projected CRS `EPSG:32737`, and backsight coordinates, then computes the stakeout list. It pastes an as-built row without RL and verifies the comparison is `INCOMPLETE` with the vertical measurement shown as unknown. A subsequent malformed easting clears the previous comparison and shows an error.

The test is `src/app/tools/setting-out/page.test.tsx`. It passed together with the focused survey suite (`29/29`) and `npm run typecheck:app`.

The separate general setting-out sheet caller was also traced through the lazy document registry. `scripts/verify-setting-out-pagination.ts` now invokes `generateDocumentSafe('setting-out', ...)`, writes the returned PDF through the same source path, and `scripts/inspect-setting-out-pagination.py` checks the artifact. With 50 synthetic design points, the registry caller produced three A4 portrait pages; all 50 point IDs occurred exactly once, each page repeated the draft/reference header and page number, and all extracted text stayed within the page margins. This is source/native PDF evidence only; the repository does not expose a production UI route for this general template, so production interaction and physical print-scale proof remain open.

The current production image was not changed. The existing candidate is tied to source hash `3b06c0222c304aa38556a4de1cc00ed9c77aecc7157c69c867c6c20a6a7389bf`, while the current checkout includes later contour, setting-out and comparison changes. The existing promotion helper is mutation-capable despite lacking a true dry-plan mode, so promotion remains gated until a new current-source candidate is built and reviewed.
