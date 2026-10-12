# METARDU production verification — 11 October 2026

## Current notice and worker release — 11 October 2026, 17:51 UTC

Current production is healthy image **44106f7a461e...**, release **working-tree-03dc5697ba72209d**. The notice/worker/mobile release passed 87 focused source tests, both type checks, scoped lint and 46 actual production normal-account HTTP checks. The packaged contour worker completed in Chrome. The new in-platform ChatGPT notice was published at 2026-10-11T17:56:45.516Z; its period ends 2026-11-10T17:56:45.516Z (10 November, 20:56:45.516 EAT). Customer linking remains disabled; public HTTPS and actual human consent remain separate gates. The notice record is verified in the fresh upload backup. All 109 hashes, restricted role, supporting service identities and mounts are preserved. Read [NOTICE_WORKER_VERIFICATION_2026-10-11.md](NOTICE_WORKER_VERIFICATION_2026-10-11.md) for the current evidence and rollback identities.

## Historical workflow release — 16:11 UTC

Current production is healthy image **0e488fe044a9...**, release
**working-tree-53b9aa0f9718c4ad**. Native drainage PDF, setting-out pagination and
contour guards are shipped. 64 focused source tests, strict types/lint, 28 source
drainage HTTP checks and **35 actual production normal-account checks** pass.
The actual production two-page drainage PDF was independently inspected and rendered.
Ledger 109, restricted role, all support services and mounts were preserved.
Fresh checkpoint db/uploads_20261011_161114 completed 16:11:18 UTC; archive integrity
passed, newest archive not separately restored. Customer MCP stays false.
The new image is rollback-current; 7e is rollback-workflow-baseline-verified and
650c retains rollback-previous-verified. See
[WORKFLOW_RELEASE_VERIFICATION_2026-10-11.md](WORKFLOW_RELEASE_VERIFICATION_2026-10-11.md)
for exact identities, proof boundaries and the remaining full-platform work.

## Historical connector/source promotion — 12:47 UTC

The earlier connector/source application was healthy on image
`sha256:7e73394d95c306d1c454a8735b0cf9eb1e7795ca2859126132ff4aaa3bba142e`,
release `working-tree-005381d4cdbbd68b`, source fingerprint
`005381d4cdbbd68b981da274d36a1574a3a3fc4dca0a44c50c0ad4c035527c42`.
The application-only promotion started at 12:47:25 UTC. It ships the optional
environment-validation repair, safe health diagnostics/release identity, and
per-observation ChatGPT coordinate/capture provenance. No migration was needed;
the ledger remains 109 and all six supporting services and data mounts survived
unchanged. Customer MCP remains disabled.

Before this promotion, 99 focused tests, app/test typing, scoped lint, 22 synthetic
MCP HTTP checks and 24 synthetic drainage HTTP checks passed. After promotion,
all 25 real normal-account HTTP checks passed on the current image. The two new
synthetic accounts were disabled and their credentials/sessions invalidated;
temporary upload bytes and metadata were removed. Earlier synthetic fixtures and
private immutable evidence were preserved. No customer fixtures were modified.

The checkpoint completed at 12:47:23 UTC: `/backups/db_20261011_124721.sql.gz`
and `/backups/uploads_20261011_124721.tar.gz`. Archive/header checks passed;
this checkpoint was not separately restored. Earlier actual recovery/rehearsal
proof remains distinct. `rollback-current` now protects 7e73394d...;
`rollback-previous-verified` retains the verified 650c1a18... image. Other images
and recovery artifacts remain intact. Latest `npm run docker:verify` passed.

The authenticated Cloudflare audit confirms an active zone, matching proxied
apex/www DNS and healthy four-connection tunnel to the existing localhost:3000
Docker origin. Public HTTPS traffic is still unproved; Chrome reported
ERR_BLOCKED_BY_CLIENT and independent public probes were inconclusive. No browser
protections or Cloudflare configuration were changed. Customer linking also
requires the actual privacy-notice publication date and the stated 30-day period.

Current evidence and remaining gates:
[ChatGPT and source verification](CHATGPT_AND_SOURCE_VERIFICATION_2026-10-11.md),
`test-results/connector-source-release/`, `test-results/chatgpt-source-http/`,
`test-results/drainage-source-http/`, and `test-results/chatgpt-live/`.

The sections below retain earlier export-correction, CAD, recovery and cache
evidence. Their earlier image and storage measurements are historical.

## Earlier production export behavior proved

All **25** normal-account HTTP checks passed on this image:

- Credentials sign-in, anonymous denial, private project creation and isolation.
- Saved CRS declaration, zero northing, four-decimal easting and unknown height.
- Private CSV/GeoJSON downloads, document registration and project audit isolation.
- Owned upload/download with byte equality, denial to another account, temporary
  file and metadata deletion, and actual packaged PDF text import.
- Revoked sessions denied private APIs while an unrelated session remained valid.

A separate read-only check on the labelled synthetic project confirmed the
download's SHA-256 equals its stored document revision, its recorded actor is the
authenticated owner, its registered CRS equals the declaration, and an append-only
EXPORTED evidence event contains the same hash. This is stronger than merely
receiving a download or seeing a registration-warning header disappear.

Three HTTP attempts created six clearly labelled synthetic accounts and three
private test projects. All six accounts were disabled and their credentials and
sessions invalidated. The successful attempt's temporary upload and registration
were removed. Immutable project/audit/revision evidence was retained. Existing
customer fixtures were not edited or deleted by these checks.

The first two attempts exposed an actual SQL defect: the general export route
selected nonexistent `survey_points.point_type`. Source now reads the canonical
`is_control` flag. Read-only `WHERE false` queries reproduced the failure and
validated the correction without reading customer rows. The control-flag test
first failed and then passed; **43** focused tests, app/test typing and scoped
lint passed before the corrected image was built. Failure evidence is retained.

Evidence: `test-results/production-upgrade/normal-account-http.json`,
`export-register-proof.json`, `export-column-native-red.json`,
`export-column-native-green.json`, and `application-fix.json`.

## Actual production CAD worker

CUA operated the production editor at `http://127.0.0.1:3000/tools/cad-editor`.
The owned origin had an empty drawing. All changes used the normal controls,
coordinate-reference form and CAD command input; no page storage or runtime heap
was injected. The user's localhost training origin was not opened or changed.
The browser's Update Now flow retained the labelled draft and its staged point.

Six explicit points and seven lines formed two adjacent 100 m squares. The
declared synthetic reference was EPSG:32636 with one metre per canvas unit.
Supplied coordinates were preserved. The actual browser worker displayed:

| Measurement | Observed result |
| --- | --- |
| Closed faces | 2 |
| Each face area | 10,000.00 m² |
| Each face boundary | 400.00 m |
| Total area | 20,000.00 m² / 2.0000 ha |
| Unique linework, shared edge counted once | 700.00 m |

This agrees with the earlier independent Shapely/GEOS comparison. It proves the
production browser worker for this synthetic geometry; it does not establish
physical survey accuracy, national/legal acceptance or printed-sheet scale.

Evidence: `test-results/cad-topology/production-worker-full.png`,
`production-worker.txt`, and `production-worker-proof.json`. The production QA tab
is retained as a deliverable. It contains synthetic data only.

## Data, runtime and recovery preservation

The prior 10 October upgrade applied 40 reviewed forward migrations, taking the
ledger from 69 to **109**. All original 139 customer-table content fingerprints
and historical migration hashes were preserved. Actual archive recovery and
upgrade rehearsal evidence is in the recovery review; temporary recovery copies
were removed. The 11 October correction changed only the application.

The runtime login remains `metardu_app`, without ownership, superuser/BYPASSRLS,
database/role administration, replication, schema/database CREATE or ledger-write
privilege. Its `authenticated` compatibility membership is verified safe.

PostgreSQL, Redis, compute worker, collaboration, NTRIP and backup container IDs,
images, start times and canonical data mount sets were preserved. One application
container exists. Production HTTP, database and Redis health passed after the
correction and cache cleanup. The backup sidecar's automatic run completed on
11 October at 02:00:02 UTC; the correction checkpoint completed at 09:01:43 UTC.

Correction checkpoint archives are `/backups/db_20261011_090140.sql.gz` and
`/backups/uploads_20261011_090140.tar.gz`. Existing archives were retained during
the manual checkpoint. Previous application logs were preserved privately inside
the existing backup volume, without copying their contents into the workspace.
These earlier checkpoint archives passed archive/header checks; they were not
separately restored after this application-only correction.

After the earlier HTTP and CAD proof, reusable `rollback-current` protected
image650c1a18...; that image is now `rollback-previous-verified`. Prior compatible
image80497396... is retained as `rollback-prior`; it has the known general-export
defect. Original pre-migration image d2b47891... remains protected
with its original database recovery evidence. Do not blindly run that original
image against the upgraded database or restore an older database over later writes.
Earlier image aliases were updated after cache verification; no image was deleted
or service restarted by that tagging operation. Current tag roles are recorded in
`test-results/connector-source-release/rollback-readiness.json`.

## Build cache and host storage

These measurements predate the later connector-source candidate build. They are
retained historical evidence, not a fresh claim about current cache or free space.

The inspected four-build window used only the existing desktop-linux builder.
The two failed records were retired by exact bare build IDs. Only exact, private,
reclaimable cache IDs from that window were selected for cleanup; a read-only
inventory proved the deletion selector matched precisely that allowlist.
Current dependency ancestry and APK/NPM downloads were retained.

Reported build cache fell from approximately **10.23 GB to 4.78 GB**. The planned
4 GB target was not met: approximately 1.35 GB outside the retained dependency
set is still reported as in use. Those entries were preserved. All container
identities/mounts, every image, protected rollback tags and unrelated build
history were compared before/after and remained unchanged. No blanket prune,
new builder, preview application or Docker/WSL shutdown occurred.

Windows `docker_data.vhdx` allocation is still 106,236,477,440 bytes. Measured C:
free space is 28,785,876,992 bytes. Docker-accounted reclamation and physical host
allocation are separate measurements; the live virtual disk was not compacted.

Evidence: `test-results/production-upgrade/cache-retention.json` and
`windows-storage-after.json`. The earlier cache CLI reference/filter failures
are retained; they were corrected without broadening the resource allowlist.

## Remaining release and field gates

The broader field-to-finish engineering platform is still unfinished. Live
provider OAuth and HTTPS ChatGPT/MCP integration, payment/provider delivery,
physical receiver/mobile/touch/offline workflows, offsite disaster recovery,
professional print output and national/legal accuracy remain separate gates.
The build excludes a 6.02 MB bundle from automatic offline precaching; complete
offline coverage has not been demonstrated.

The last broad source run recorded 4,035 passing tests, one CAD UI timeout,
eight skipped tests and one passing snapshot. The unchanged isolated CAD suite
then passed all 26 tests. The subsequent export correction passed its focused
43-test run, typing, lint, actual schema checks and production HTTP proof. These
results are reported separately; no assertion was weakened to manufacture a pass.
