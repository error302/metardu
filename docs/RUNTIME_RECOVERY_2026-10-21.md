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
