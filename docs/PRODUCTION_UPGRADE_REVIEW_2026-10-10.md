# Production upgrade review — 10 October 2026

The existing production stack remains healthy. Source has **108** migrations;
production has **69** applied rows, with **39 pending** migrations from 065
through 103. All applied checksums match source (allowing only LF/CRLF byte
conversion); there are no missing hashes or ghost versions. No ledger was
altered. This is current read-only metadata evidence, not the older synthetic
108-migration rehearsal.

The running app uses role `metardu`, which is a PostgreSQL superuser with
BYPASSRLS, CREATEDB and CREATEROLE. Current source's restricted runtime role,
migration gate and one-shot administrator service have not been promoted.
Blindly replacing the application image would be unsafe/incompatible. Review
the pending data transformations, access policies and role provisioning before
sequencing the existing production upgrade.

`scripts/audit-production-upgrade.mjs` reads migration metadata and role flags
inside an explicit read-only transaction. It does not read/copy customer table
payloads or clone their database. `test-results/production-upgrade/metadata-audit.json`
records the complete pending list and exact current production image.

## Backup defect and reversible repair

The latest initially visible archives were dated 8 October, and backup logs
reported failed SQL-header verification despite successful archive creation.
Cron was running. A direct read-only reproduction on the existing database
archive produced `PIPESTATUS: 141 0 0`: `head -1` closed its pipe early, `zcat`
received SIGPIPE, and `pipefail` converted a valid dump into failure.

Synthetic regression runs exercised the actual backup script with only pg_dump
replaced by deterministic synthetic output, inside an owned temporary directory
in the existing backup sidecar. No customer database was accessed. Before the
fix, large valid input failed and loose header matching accepted malformed
input. After replacing the header check with a full-stream reader that requires
the exact pg_dump header, all four cases pass: large valid, small valid,
malformed header rejection and dump-error rejection.

Source's existing unrelated connection-handling changes were preserved. The
runtime hotfix changes only the inspected header-check line in the original
sidecar script, preserving all other deployed code. It was syntax-checked,
installed without rebuilding/restarting any service, and verified by hash.
The exact original remains at `/app/scripts/backup.sh.before-20261010` inside
`metardu-backup`. Original SHA-256:
`20a91085dcba3a3798c179ab3f2ec8215aface2d48e5e34061ed28a680d08c54`;
fixed SHA-256:
`3f6062b9254059dd270decdad88bac82db154a2f7a5cfd919bb1c018ae729546`.
The hotfix must remain in source so a future sidecar rebuild retains it.

A fresh backup completed at **10 October 2026, 01:11:28 Nairobi**
(`2026-10-09T22:11:28Z`). Database and uploads archives are retained in the
existing production backup volume:

- `/backups/db_20261009_221125.sql.gz`
- `/backups/uploads_20261009_221125.tar.gz`

Retention was overridden to 36,500 days for this single run, preserving all
existing archives. There are now 25 database and 25 upload archives. Database
gzip/header checks and uploads gzip/tar opening passed. No restore was performed.
The pg_restore listing warning is expected for the script's plain SQL format;
passing archive/header checks cannot prove database recovery.

The runtime check now requires a completed backup within 36 hours and rejects
later backup errors; it no longer treats a running cron container as backup
proof. The next automatic scheduled run and recovery/offsite behavior remain
unverified. No new heartbeat automation was created.

Evidence: `test-results/backup-verification/regression-before.json`,
`regression.json`, `runtime-hotfix.json`, `fresh-backup.log` and
`fresh-archive-integrity.log`. Production application/image/schema were not
changed; the only runtime code change was this backup hotfix.

## Next release gates

1. Finish actual browser CAD worker verification once CUA is available; keep
   independent native/source evidence separate from browser/production proof.
2. Review all 39 pending migrations against production metadata and customer
   preservation needs; maintain the exact applied hashes and protected archives.
3. Establish authorized recovery evidence and migration/role sequencing before
   one planned candidate build and existing-app promotion. Do not bypass the
   previously rejected customer-database clone.
4. Verify normal-user/firm permissions and real field-to-finish save/reload,
   calculation and deliverable workflows after promotion. Health alone is
   insufficient, especially while current production uses a superuser.
5. Retain open provider OAuth/HTTPS ChatGPT, payments, receiver/mobile/offline,
   official datum/authority and printed professional deliverable gates. Do not
   enable or claim integrations without their contracts/credentials/live proof.

The broader professional engineering platform objective remains unfinished.
