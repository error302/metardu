# Topographic paper map release acceptance - 2 November 2026

Application revision: b172cbc7595670e0057a4c9eb7ff4374945871d9
Image: sha256:9f8ef7052704d00dc8b459d78ca7c5da8a9be86ab88eef419ef7840b95fa10ea
Branch: codex/metardu-workflow-readiness-2026-10-12

## Result

The saved terrain project opens in a white paper map with dark annotations, brown contour hierarchy, independent point/leader/grid controls and full-width fit. Retained height range, relief, interval and footprint context explain the landform. The maximum contour segment length is explicitly geometric densification. Existing terrain geometry, registered DXF generation and entitlement are unchanged.

## Source and CI

- All three TypeScript projects passed; 71 release-contract tests and 24 related tests passed.
- Whole-source lint: 3,406 files; zero errors, warnings and accessibility findings.
- Exact application CI 41414735747 passed all 17 jobs; CodeQL 41414735536 and gitleaks 41414735695 passed.
- Regression proves Tools and saved project isolines agree for identical observations/constraints; renderer tests cover paper contrast, index hierarchy and reversible controls without entity mutation.
- Local browser read the existing five-point synthetic R1; mobile wrapping, controls and no horizontal overflow passed. Preview stopped; next-env.d.ts restored exactly.

## Promotion and preservation

One candidate built and one app promotion performed using the established guarded release procedure. Existing rollback images were preserved. All 129 applied migration hashes matched production and the existing synthetic rehearsal; no SQL was pending. Actual current-image rollback verification and runtime contracts passed before the build.

Fresh checkpoint: /backups/db_20261102_091502.sql.gz and /backups/uploads_20261102_091502.tar.gz. Archive integrity is distinct from restore/offsite proof. Original-record fingerprints, required running support IDs/start times/mounts and uploads were preserved. The completed migration service is image-aligned and exited zero. Only the existing METARDU_BUILD_SHA environment setting was updated; all other Compose settings were compared unchanged.

## Deployed acceptance

Public and origin health identify the exact application revision. Home/login load; dashboard/equipment/admin correctly redirect anonymous users. Five live PWA assets match deployed bytes. Native PDF runtime and worker artifact/task/RTKLIB parity passed.

Existing Enterprise demo project R1 loaded its 42 retained observations, four contour levels and 0.5 m interval. Observed heights are 100.001 to 102.149 m (2.148 m relief). Paper mode, point/leader controls and zoom/Fit worked in the live app. At requested phone width 390, document and scroll widths were both 380. The download button was enabled and unobstructed; its layout height is 44 px (hover transform measured 43.12 px). No new project, observation, surface or paid-plan fixture was created; no new DXF export requested in this release acceptance. Prior actual downloaded DXF/parser evidence remains separate.

Live screenshots are in the chat visualization folder as topo-paper-live-b172cbc7.png and topo-paper-live-phone-b172cbc7.png. Consolidated evidence: .cache/release-verify/unified-release/b172cbc7595670e0057a4c9eb7ff4374945871d9/release-verified.json.

## Retained limits

The existing 6.02 MB Workbox chunk remains outside precache. This release does not establish full offline operation, field accuracy, instrument acceptance, receiving-CAD/print acceptance, physical Android/iPhone installation or closed-app reminders, provider/offsite/key recovery or signing rotation. Legacy parcel containment remains a separate gate. Reviewed feature strings and a registered vector PDF/issue workflow remain subsequent engineering work; see TOPOGRAPHIC_MAP_RESEARCH_AND_IMPROVEMENTS_2026-11-02.md.

Any following documentation-only commit records this acceptance and does not change the deployed application identity above.
