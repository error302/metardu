# Docker consolidation — 10 October 2026

The authorized cleanup is complete in the existing checkout. No new worktree,
preview application container, image build or application deployment was made.

## Inspected and removed

- 20 mount-free METARDU web previews dated 8–9 October: 19 stopped and one
  running export preview. Exact IDs, purposes, images, networks and writable
  layers are recorded in `test-results/docker-consolidation/containers-before.json`.
  All had owned synthetic/release-preview purpose labels, no compose ownership,
  no mounts and only the owned rehearsal network. Only that running preview was
  stopped; all 20 were removed without a volume-removal flag.
- 22 images in the exact inspected `metardu-release-verify` repository/date
  allowlist. IDs/tags and consumers were rechecked immediately before deletion.
  No other container consumed them. Images were removed without force.
- The idle `metardu-release-verify-20261008` Buildx builder and its exact state
  volume `buildx_buildkit_metardu-release-verify-202610080_state`. Docker measured
  the state volume at **41.4 GB**. Build history had only Completed/Error runs,
  and none of 339 cache records was in use. Buildx removed both daemon and state.

The image table's initial UNIQUE SIZE values total approximately **8.84 GB** for
the 22 removed images. This is initial Docker image accounting, not an exact
additional physical-space saving. Shared layers and the builder cache cannot be
summed from virtual image sizes. Detailed before/after tables are saved.

## Preserved and verified

All seven production container IDs, images, mount definitions and start times
match the initial snapshot: app, PostgreSQL, Redis, worker, collaboration, NTRIP
and backup. Six configured container healthchecks are healthy; backup is running
without a configured Docker healthcheck. HTTP health reports database/Redis OK.
`production-preservation.json` records each comparison.

Production volumes `metardu_postgres_data`, `metardu_uploads_data`,
`metardu_redis_data` and `metardu_backups` remain mounted. No customer database
records were cloned or changed by cleanup. Unrelated volumes/images, historical
METARDU rollback images and generic BuildKit image were left intact.

The current production image is additionally tagged
`metardu-metardu-app:rollback-20261010`, SHA-256
`d2b47891fb9fac7064cc446709a1d2cd3fb684d13c6f126c1aae39628f626fc0`.
This tag shares the existing image and does not create a duplicate image layer.

The synthetic schema database and its approximately 212.4 MB anonymous volume
remain because the existing CAD host preview depends on them. It is distinct
from customer PostgreSQL; retiring it requires preserving useful rehearsal
evidence and stopping its known source-preview consumers first.

## Storage and prevention

After cleanup Docker reports 27 distinct images using 15.3 GB, eight containers
using 16.75 MB, and 24 volumes using 1.578 GB. The owned 41.4 GB builder volume
is absent. Default engine build-cache accounting is zero; that did not include
the retired container-builder state volume before cleanup.

Windows `docker_data.vhdx` remains **106,236,477,440 bytes** before and after.
Host C: free space changed from 29,458,526,208 to 29,392,244,736 bytes during
this work. Thus internal Docker storage was freed, while physical Windows
allocation was not reclaimed. No live disk compaction, Docker/WSL shutdown or
production outage was attempted. Physical compaction is a separate maintenance
window, or part of the planned VM migration.

`npm run docker:verify` and the old `docker:test` entry point now inspect the
existing production stack and flag duplicate previews/images/builders. Teardown
is refused; the old PowerShell launcher no longer starts a testing stack.
`AGENTS.md`, README and `DOCKER_RUNTIME_WORKFLOW.md` establish the same rule.

The later backup-script hotfix and fresh archives are recorded in the production
upgrade review. They kept the same sidecar and data mounts and were not part of
the disposable-resource cleanup. The application image remains unchanged.
