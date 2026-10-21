# One METARDU application runtime

Use the existing production stack at `http://127.0.0.1:3000`. PostgreSQL,
Redis, the compute worker, collaboration, NTRIP and backup are supporting
services and must stay running. They are not duplicate application previews.

## Daily checks

Run `npm run docker:verify` (also `npm run docker:test`). This checks the seven
services, ownership, HTTP/database/Redis health and accumulated duplicate
application containers, dated verification images and verification builders.
It also requires a completed backup within 36 hours and no later backup errors;
running cron alone is insufficient. This does not prove a successful restore.
The app and one-shot migration service must select the same explicit image via
`METARDU_APP_IMAGE` (default `metardu-metardu-app:latest`). The migration service
has no independent build. Verification requires its successful exit using the
same immutable image ID as the running app; it is then excluded from duplicate
application detection. An old failed migrator is a release failure, even if an
app container happens to be running.
It never starts services, mutates records, migrates, builds or deletes anything.
The old PowerShell testing launcher delegates to this check; Build and Down
flags stop with an explanation. `docker:test:down` also refuses teardown.
The historical testing compose file is preserved but is not the runtime workflow.

Keep source checks on the host: focused Jest tests, lint and type checks. The
existing port-3021 host preview supports source/browser CAD verification against
the synthetic database. Protect the user's localhost training drawing; use the
owned 127.0.0.1 origin for QA. This does not prove production has these changes.

## Planned promotion of verified source

Finish a coherent milestone before rebuilding. Review the whole changed runtime
and migration surface, applied hashes, restricted database role, backup freshness
and restore evidence. Synthetic rehearsal cannot establish customer-database
compatibility. Do not bypass the rejected customer clone or change ledger hashes.

Keep one exact current-production rollback tag. Build one candidate using a
reusable image tag; do not create dated preview images, application containers
or additional builders. Review configuration and migration sequencing before
updating only the existing service. Current compose adds an administrator
migration service and restricted app role; blind `compose up`, `--build` or
`--no-deps` is not a safe migration plan here.
Select a release artifact for both services, and review its normal dependency
execution before promotion. Historical app-only override/promotion scripts do
not establish that the migration service matches a newly selected image.

The reviewed restoration on 21 October retained the previous application image,
ran the matching packaged bootstrap with no pending SQL, and independently
verified unchanged customer data and supporting services. See
[the recovery record](RUNTIME_RECOVERY_2026-10-21.md). It did not release later
Fieldbook source or apply migration 115.

After a reviewed promotion verify health and actual workflows. Retire a previous
candidate/rollback only after its replacement is verified. Bound cache ownership
and retention during that planned build; never prune a shared builder to tidy this
project.

## Storage cleanup

Inspect IDs, labels, mounts, consumers and activity. Record credential-free
before/after evidence. Remove exact allowlisted resources only; never blanket
prune. Preserve production PostgreSQL, uploads, Redis, backups, rollback and
unrelated projects. The 10 October cleanup script is a one-time allowlist tied to
its evidence, not a general garbage collector. It defaults to inspection.

The inventory/report live in `test-results/docker-consolidation` and
`docs/DOCKER_CONSOLIDATION_2026-10-10.md`. Docker's Windows virtual disk may retain
physical allocation after internal space is freed. Report Docker-accounted and
host space separately. Compaction needs a planned production maintenance window;
do not stop Docker/WSL or manipulate the live disk during normal checks.
