# Topographical app capture and project setup — 2 November 2026

## Scope and publication status

The user requested a topographical survey demonstration captured directly while operating METARDU, using the existing Enterprise account, and a review of repetitive entry on New Project. No LinkedIn post has been published. Generated direct-engine previews are internal diagnostics and excluded from public demonstration media.

## Actual app interaction

A dedicated production project, DEMO - Topographical survey - synthetic site A, was created through the normal UI: 242f3a64-f1cf-4b7f-96a0-70e86aa5b616. No existing project, account, role, plan, billing or notification setting was changed. The existing Enterprise display is supplied by the configured administrator-email policy; it is not proof of a paid provider lifecycle.

The explicitly declared reference is EPSG:21037, metres and grid distances, with a synthetic local assumed height basis. It is not field control, a verified benchmark or a real site. The original file contains 42 synthetic ground points over a 100 m by 80 m sampling footprint, including road and structure ground features.

The actual import UI rejected a deliberate duplicate G01 with no points imported. The corrected file saved 42 points and its original reference evidence together. Capture ID: 3c151e32-6aaa-457d-b193-414027703e9e. Original-file SHA-256: 71217340b6446e6a774d4bd35eb09aace98996b223e871759f0c49ddce6c2613.

The saved terrain R1 is 408583cf-7da5-4653-8fd6-bb056ab7ce27, input hash 181852184491c53e5c74dea869fa8eb6d86686159d28260fc8ffe70e8268c18b. The operator retained the reviewed E1-E4 hard road-edge chain and a 0.5 m contour interval. The UI returned 42 retained observations and four contour levels. No legal boundary or roof was inferred.

## Defects found and source corrections

The retained-revision drawing joined building corners in canonical observation-ID order, producing crossing lines. Canonical identity ordering is not feature-connection evidence. Retained drawings now preserve measured feature points and computed contours and draw only explicitly retained XYZ breaklines. Ordinary source-sequence drafting also preserves intervening code breaks instead of joining separate runs after bucketing. Full reviewed feature-line editing and receiving-CAD acceptance remain separate work. Export generator version advances to 1.1; historical retained artifacts are not rewritten.

Registered DXF export first returned HTML and a JSON parsing error. Recovery for request 84414efb-8ccd-4daa-a1d7-004c164516b2 reported no committed export. Retrying that same request through the UI returned the Pro entitlement rejection despite the existing Enterprise billing display. No DXF download or registered export was obtained. The initial HTML cause remains unresolved. The source correction forwards the verified server-session email to the existing entitlement policy, which already uses that email for the configured Enterprise grant. Client-supplied email remains rejected, project ownership remains required, and no new grant is created.

## New Project improvements

- Surveyor Name fills from the signed-in account; manual edits and an intentional blank survive session refresh.
- Country / Jurisdiction follows the existing saved preference until the user chooses another value.
- Client Name offers trimmed, case-insensitive unique suggestions from up to 50 owner-visible recent projects, fetched on focus without caching. Manual entry remains available if the request fails.
- The optional site sketch follows the core fields and its map mounts only when opened. It remains reconnaissance evidence, not a measured boundary.
- Templates use professional SVG icons and jurisdiction-neutral descriptions. Datum, zone, hemisphere and height evidence are not copied from another project or inferred from country.
- Breadcrumb, Cancel and the mobile Back control return to /projects; the mobile title reads New project.

Actual source-browser QA used the ordinary synthetic surveyor at 127.0.0.1:3021 and a 390 px phone viewport. Name autofill, collapsed sketch, editable details, no horizontal overflow, unobstructed Cancel/Create controls, and Back to Projects were verified. The fixture has no previous named clients, so populated suggestions are test evidence, not positive browser evidence. No project was submitted in that QA session. The viewport was reset, the owned host preview stopped and next-env.d.ts restored. An earlier preview startup failed opening its generated next-env file; the succeeding attempt prepared that exact preview-only reference first.

## Verification and release boundary

Focused typed lint passed all 23 changed source/test files with zero errors, warnings and accessibility findings. All three TypeScript projects passed. The combined 17-suite regression run passed 152 tests, and 66 release/security/recovery contract tests passed. Historical 305d2b01 CI and whole-repository lint are not evidence for these new changes; exact committed-source admission and CI still precede promotion.

The running image remains sha256:71f91ec1812f9272a117efa4390c89666de727c20f7cf049bcab0e73a7f7844d, with OCI application revision 305d2b0139202bca035c42454b3ce59122ad16ba. The later container recreation has METARDU_BUILD_SHA=unknown; public and origin health therefore do not currently prove an exact runtime release ID. This is distinct from the immutable image identity. No production replacement or migration has occurred for this follow-up.

The required Docker verifier found backup freshness beyond 36 hours; the latest observed pair was db_20261031_020001.sql.gz and uploads_20261031_020001.tar.gz. The missed scheduled run's cause is unestablished. Fresh verified backup and exact release identity remain promotion gates. No applied migration was edited and no new SQL is introduced by this follow-up.

## Retained acceptance

Public media must wait for the drawing and Enterprise export corrections to be deployed and rechecked through the actual app. Preserve the failed captures as diagnostics. Then inspect the downloaded file in receiving CAD and review drawing legibility before making output claims. Do not represent source previews as the deployed product or synthetic coordinates as a field survey.

Physical instruments/control, independent surveyor calculations, calibrated printing, phone installation and closed-app reminders, provider entitlement lifecycle, offsite/key recovery, signing rotation and ward-scale collaboration/reconnect acceptance remain distinct gates. This checkpoint does not establish the entire platform as production ready.

Local captures and fixture files: artifacts/marketing/survey-workflow-series-2026-11-02/. Source QA receipts: .cache/source-followup-2026-11-02/. Neither directory is a publication receipt.

## Follow-up admission findings

Application checkpoint b8e00115aed82fc06e688eaa57e109942cfc64a6 was pushed with every ordinary pre-push gate passing. Its CI 41364372428 browser shards and accessibility job failed during browser installation, before their tests ran: ubuntu-latest selected ubuntu-26.04, which installed Playwright 1.59.1 explicitly rejects. The follow-up pins only e2e and axe-sweep to ubuntu-24.04, supported by the installed Playwright platform table. Browser dependency installation, every test command, matrix and blocking outcome remain unchanged. Original failure receipts are retained. Its local source admission passed typing, 71 release contracts and 139 Git-selected related tests, but whole lint was deliberately stopped when this workflow correction superseded it; no whole-lint pass is claimed. The updated exact revision needs fresh admission and CI before promotion.

A fresh manual backup pair completed 1 November 2026 at 23:53 UTC: db_20261101_235302.sql.gz and uploads_20261101_235302.tar.gz. Complete gzip/SQL-header/tar checks passed and all 96 prior archive hashes remained unchanged. The subsequent Docker runtime verifier passed required services, migration-image parity, public health, database/Redis and backup freshness. This manual run did not replace the sidecar or prove future scheduled/offsite recovery.

The final form review reproduced another regression before production replacement: collapsing and reopening the optional map remounted OpenLayers, clearing its visible outline while the parent retained coordinates and estimated area. A new stateful interaction regression first failed, then the panel was changed to mount its map once on first opening and preserve it while collapsed. The existing drawing stays visible on reopening; no previous project or browser storage is copied. Exact a1bb24a7 admission was deliberately superseded for this correction, retaining its incomplete lint receipt.

The corrected sketch lifecycle also passed actual source-browser QA: draw an unsaved approximate outline, collapse and reopen the panel, and verify the same outline and estimate remain visible. At 390 px requested width, document/client widths both measured 380 px; Cancel and Create were visible and unobstructed. Surveyor autofill remained present, datum and zone stayed unset. Cancel returned to Projects with the original one-project synthetic register unchanged. The viewport was reset, the owned preview stopped and its generated type reference restored. All nine form regressions and focused lint passed.

Supported-runner CI a1bb24a7 reached the real browser tests: desktop and mobile shard 2 both failed the old main Dashboard breadcrumb assertion at e2e/project-crud.spec.ts:105. The deliberate navigation change returns to Projects. The test now clicks that breadcrumb and requires the Projects URL, register heading and absence of its load-error alert. The old no-assertion Projects-to-Dashboard test now checks the real owner-register behavior as well. These checks remain blocking and must pass on the final revision; the original failed CI job is 125023410042.
