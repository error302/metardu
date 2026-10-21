# Existing production runtime recovery, 21 October 2026

The existing `metardu-app` is healthy again on `127.0.0.1:3000`. This restores
source `08fae42763aae6d6c4fa24e7f32ec359bf41ddc7`, image
`sha256:06103336484035d2aad7d3a1d45cf9bb37b8a814507b190108f5ae1586a9d0b0`.
It does not promote the newer Fieldbook client/service or migration 115.

## Cause and source repair

The app had been recreated into `created` state while its separately built,
older migration container exited 1. That migrator contained 110 migration files,
rejected applied 052 and lacked nine later applied versions. The retained app
artifact contained all 119 files, including historical checksum pins: comparison
against the actual production ledger found no missing, mutated or ghost versions.
The checkout additionally contains unapplied `115_fieldbook_delivery_revisions`.
No applied SQL or ledger checksum was edited to resolve this incident.

Compose now selects the same explicit image for the app and migration service
through `METARDU_APP_IMAGE`, defaulting to the retained `latest` tag. The migration
service no longer has an independent build. The host runtime verifier checks
resolved artifact selection and requires the owned migration container to have
exited successfully with the same immutable image ID as the running app. It
exempts only that validated migration container from duplicate app detection.
Five focused Node tests pass, including actual resolved Compose configuration,
stale-image rejection, failed/incomplete bootstrap rejection and ownership checks.
Node syntax checks, `git diff --check` and the source security gate also passed;
the gate verified all 119 pinned applied migration files.

## Preservation and normal restoration

Before restoration, read-only inspection confirmed exact ownership, IDs, mounts,
image and rollback references, runtime credentials/configuration continuity,
119 applied checksums, and the restricted `metardu_app` role. Full admin-side
fingerprints covered 155 public tables and 9,617 rows; RLS-restricted partial
reads were not used as full customer preservation evidence. Table/sequence
grants, default privileges and upload contents were recorded separately.

The unchanged backup program in the existing sidecar created:

- `/backups/db_20261021_123314.sql.gz`, SHA-256
  `33dc464ffa3835e2487ff85b0150bd4f0a869eedc1110528d60561e948803abb`.
- `/backups/uploads_20261021_123314.tar.gz`, SHA-256
  `c3af5321672e683836c3eb19ab71ee34e49fc99782491313b4ab2122a50e3700`.

All 44 database and 44 uploads archives were retained. The inspected preservation
retention window deleted no files. The service did not automatically create host
copies; the restore guard stopped before any service change. Exact new copies
were then added without overwrite under the existing `backups` host mount and
verified byte-identical. Both gzip streams, uploads tar listing and database SQL
header passed. Host copies are local recovery copies, not offsite proof. This
checkpoint was not restore-tested; earlier recovery evidence is in
`RECOVERY_AND_MIGRATION_REVIEW_2026-10-10.md` and later release records.

After a Compose planning run and guarded identity/configuration/checksum checks,
the existing services were restored with normal `compose up -d --no-build --wait
--wait-timeout 120 metardu-app`. Its packaged migration bootstrap reported
**all migrations up to date**, then verified all 119 through the restricted login.
No dependency gate was bypassed, no new SQL applied and no source image built.
Only the existing app and migration containers were recreated; required supporting
services were preserved. No customer clone refusal was overridden.

## Independent post-check, 12:40 UTC

- All 155 table fingerprints and 9,617 rows, all migration records, upload hash,
  table/sequence/default privileges and protected image tags matched the checkpoint.
- PostgreSQL, Redis, worker, collaboration, NTRIP and backup retained their exact
  container IDs, images, start times and mounts. App/migrator mounts were preserved.
- App and migrator share the retained image; migrator exited 0. The app is healthy.
- The runtime role remains non-owner, non-superuser, without RLS bypass,
  database/schema/role creation or migration-ledger mutation rights.
- `npm run docker:verify` passed all seven required services, migration artifact
  agreement, HTTP/database/Redis health, recent backup completion and the single
  application/no dated verification image/builder inventory.
- Health and login HTTP endpoints returned 200. This is runtime/HTTP evidence,
  not signed-in workflow, native-browser, receiver or field acceptance.

Private evidence is retained in `.cache/runtime-recovery/`: migration comparison,
checkpoint/restored fingerprints, backup integrity, Compose output, role/HTTP
restoration report, focused test results and `verify-restored.log`. Credentials
and customer record values were not printed or committed.

## Remaining work

The marked synthetic database is still stopped, and the Fieldbook native rollback
probe/browser/device/retention/archive-restoration gates remain open. Migration
115 is absent from production. The deferred signing-key rotation is unchanged.
Payment/provider, engineering release and physical field acceptance remain
separate requirements; this recovery does not establish platform-wide readiness.

## User-requested obsolete image retirement

After recovery, the user requested identification of the image in use and removal
of redundant METARDU images. Fresh production verification passed before and
after cleanup. Full Docker inventory established that both the running app and
successful migration container consume `061033364840…`; `latest` and `candidate`
are aliases for that single image, not separate stored copies. The protected
`rollback-current` image `604238eef9cd…` was retained.

Eight exact unused images were removed without force or prune:

| Retired tag | Image ID prefix |
| --- | --- |
| `metardu-metardu-app:rollback-e7b2ad11fd8969ec` | `e7b2ad11fd89` |
| `metardu-metardu-app:rollback-af17d7af4559e416` | `af17d7af4559` |
| `metardu-metardu-app:rollback-b2e12ba5e0a2c414` | `b2e12ba5e0a2` |
| `metardu-metardu-app:rollback-3f97a2ebefae129a` | `3f97a2ebefae` |
| `metardu-metardu-app:rollback-fd7c870ce441fd67` | `fd7c870ce441` |
| `metardu-metardu-db-migrate:latest` | `694e8f3a965c` |
| `metardu-metardu-app:rollback-prior-current` | `44106f7a461e` |
| `metardu-metardu-app:rollback-previous-verified` | `650c1a183f09` |

The allowlist checked every running and stopped container consumer, exact full
image IDs and repository aliases. A guard initially stopped because Docker
returned mounts in a different order; sorting by destination confirmed identical
mount contents before any deletion. Each deletion rechecked consumers and tags.
Independent before/after comparison confirmed all nine container identities,
images, statuses, start times and mounts unchanged, all 25 volume names retained,
and every remaining image/tag/digest unchanged. No containers, volumes, backups,
builders or caches were removed. Supporting services and unrelated projects were
preserved, including the stopped synthetic database.

Unique local images dropped from 20 to 12. Docker now accounts for **5.122 GB** of
images across all projects; build cache is zero. These are Docker logical figures,
not a claim about Windows free space or VHDX shrinkage. No disk compaction or
Docker/WSL shutdown was performed. Exact private inventory, allowlist, individual
removal output, before/after disk reports and preservation report are retained
under `.cache/image-retirement/`. Historical release records still identify their
former artifacts; removed rollback tags are no longer available for execution.
