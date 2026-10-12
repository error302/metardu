# Workflow release verification — 11 October 2026

The runtime checkpoint below is historical. Current production is healthy image **44106f7a461e...**, release **working-tree-03dc5697ba72209d**. The notice/worker/mobile release passed 87 focused source tests, both type checks, scoped lint and 46 actual production normal-account HTTP checks. The packaged contour worker completed in Chrome. The new in-platform ChatGPT notice was published at 2026-10-11T17:56:45.516Z; its period ends 2026-11-10T17:56:45.516Z (10 November, 20:56:45.516 EAT). Customer linking remains disabled; public HTTPS and actual human consent remain separate gates. The notice record is verified in the fresh upload backup. All 109 hashes, restricted role, supporting service identities and mounts are preserved. Read [NOTICE_WORKER_VERIFICATION_2026-10-11.md](NOTICE_WORKER_VERIFICATION_2026-10-11.md) for the current evidence and rollback identities.

## Earlier workflow evidence

The existing Docker production app is healthy on image
`sha256:0e488fe044a9892a4a10ef802d05387a8f1ae58adfc46d2f28278c031a44f080`,
release `working-tree-53b9aa0f9718c4ad`, selected source SHA-256
`53b9aa0f9718c4ad834a181cc878825e4285871c95c4f9f5da09b402ed4409aa`.
App container `a11b9ba36e347563c6e7a702da3d2ccb8b0068b430856c2c7cb35108b2a30aee`
started at **16:11:20 UTC**. This ships native drainage PDF, complete setting-out
pagination, strict contour import/reference/export guards and honest compute-limit
copy. It does not establish full platform, provider or field readiness.

## Proof and preservation

- Final focused source run: **64 tests, seven suites**, application/test strict
  types and 19-file scoped lint pass. Existing native/source workflow evidence
  includes 28 drainage HTTP checks, a 15-page long-note/revision/legacy fixture,
  a complete 50-point/three-page setting-out sheet, and actual browser contour
  DXF/CSV/SVG/A3 PDF with 14 native polylines, 55 vertices and zero parser
  errors/repairs. All 13 mandatory artifacts are hash-associated with this source.
- The reusable candidate built with the existing desktop-linux builder, without
  creating an app container. Packaging verified PDFKit and its built-in font
  metrics. Compilation/type/static generation passed. A 6 MB chunk is excluded
  from PWA precache; full offline coverage is not established.
- Preflight reviewed exact current/rollback/candidate identity, configuration
  continuity, all **109 migration hashes**, restricted runtime role, required
  columns, no running background/render/drone jobs and previous recovery evidence.
- Only `metardu-app` was stopped/replaced. Fresh checkpoint
  `/backups/db_20261011_161114.sql.gz` and
  `/backups/uploads_20261011_161114.tar.gz` completed at **16:11:18 UTC**.
  Archive/header integrity passed; this newest archive was not separately restored.
  Earlier actual archive restore remains distinct.
- All six supporting service identities/images/start times and all seven services'
  mounts were preserved. Migration rows/hashes and runtime role were rechecked.
  Public local health matched the exact release ID/header. Customer MCP stayed false.
- **35 actual production normal-account HTTP checks pass**, including authentication,
  project reference/capture, zero/unknown height, CSV/GeoJSON/audit, owned storage,
  PDF parser, three precise/failed/unknown drainage captures, private native PDF,
  other-account denial, PDF round trip and session revocation.
- Independent native inspection of that actual production HTTP PDF confirms two
  A4 landscape pages, exact measurements, saved grade, repeated project/definition,
  draft/legend/footer, all text inside margins and no active content. Both rendered
  pages were reviewed. The fixture is synthetic, not field evidence.
- Both new normal-account fixtures are suspended with credentials/sessions
  invalidated. The temporary upload and its registration were removed; append-only
  fixture evidence remains. Customer fixtures were not modified.
- `rollback-current` protects 0e488fe0...; the compatible verified 7e73394d... baseline
  is protected as `rollback-workflow-baseline-verified`. The verified 650c... previous
  tag and all older images/archives remain intact. No prune or image deletion occurred.
- Post-promotion `npm run docker:verify` passed all required services and one app.

Evidence: `test-results/workflow-source-release/`, including candidate/source
association, promotion snapshots, 35 HTTP checks, actual synthetic PDF, independent
native inspection, page renders and rollback protection. Do not rerun the completed
one-time promoter as a health check.

## Continue the wider goal

The source presentation review found actionable 20 px Forgot password and 36–40 px
secondary map controls. Repair/browser-verify those in the next explicit source
batch while preserving this released source association. See
[WORKFLOW_PRESENTATION_REVIEW_2026-10-11.md](WORKFLOW_PRESENTATION_REVIEW_2026-10-11.md).

Public HTTPS remains unproven despite the prior healthy Cloudflare tunnel audit.
The customer privacy-notice publication date is unconfirmed, so the 30-day app-policy
gate cannot be satisfied. Real ChatGPT consent/use/revocation, paid entitlement and
payment delivery, registry integrations, physical devices, instrument/control/design
approval, print-scale acceptance and offsite recovery remain separate gates. Continue
[REQUIREMENT_READINESS_2026-10-11.md](REQUIREMENT_READINESS_2026-10-11.md).
