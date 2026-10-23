# Missed scheduled backup and guarded catch-up

Date: 23 October 2026. This records actual operational evidence, one catch-up
backup and remaining acceptance gates. It does not deploy the source recovery
repair or establish a customer restore, offsite recovery or complete service SLA.

## Observed gap

At 10:12 UTC the required read-only runtime verifier passed, but its latest
completion was still `2026-10-22T02:00:03Z`, over 32 hours old. That is within
the verifier's existing 36-hour threshold; it does not prove that every daily
schedule ran. Archive metadata and the backup log agreed: no 23 October pair.

The exact `metardu-backup` container is
`4aa9ef36303eda12db1cf320cebc66cdf15a450c412f52c31a2e5b845f091148`, image
`sha256:7f9ce6698e7ace282e224b6c4c6f34f7f9d9fedfdbb7b31da22152ba9a99b380`.
It was running, with live `crond`, correct UTC time and crontab
`0 2 * * * /app/scripts/backup.sh >> /var/log/backup.log 2>&1`.
Sanitized daemon logs did not report an archive failure after the last success.

The host's native Kernel-Power records show entry into Modern Standby at
`2026-10-23T01:39:32.4767157Z`, followed by exit at
`2026-10-23T03:41:19.8953134Z`. That spans the scheduled 02:00 UTC run. The
missed archive and host-suspension interval support a missed execution during
standby, rather than a newly observed database-dump failure. No deliberate
sleep/resume, cron replacement or failure injection was performed to test that
inference. The entrypoint has no explicit durable missed-run reconciliation;
its manual loop is reached only when foreground cron exits.

## Guarded operational action

The catch-up helper first inspected exact container identity, compose ownership,
running state, script hash, configured schedule and mounts. `/backups` remains
the writable `metardu_backups` volume. `/uploads` remains the app's
`metardu_uploads_data`, mounted read-only in the backup service. The inspected
encryption/offsite destinations were unconfigured; this action did not change
those settings or introduce a transmission destination.

Before execution it hashed all 88 existing standard database/uploads archives,
confirmed no active `pg_dump`/gzip/tar process and verified that no archive could
qualify for a one-process `BACKUP_RETENTION=36500` override. The same unchanged
deployed `/app/scripts/backup.sh` then ran once in the existing sidecar. The
override was confined to that invocation. No scheduled configuration was changed.
No existing archive was deleted, overwritten or moved.

The result is one matching timestamp pair:

| Archive | SHA-256 |
| --- | --- |
| `/backups/db_20261023_102541.sql.gz` | `7d595266a5c9222727a74d21208d0024ea0f29b70353f6135899b8387d0432cc` |
| `/backups/uploads_20261023_102541.tar.gz` | `c3af5321672e683836c3eb19ab71ee34e49fc99782491313b4ab2122a50e3700` |

Both gzip streams passed integrity checks; the database stream had a pg_dump SQL
header and the uploads tar had a valid listing/root. Customer SQL contents and
uploaded filenames were consumed internally for validation and were not printed.
All 88 pre-existing archive hashes still matched. The backup service's script,
image, start time and protected mount identities were unchanged. No running
application/supporting service was restarted, replaced or hot-patched. The
action used the existing `pg_dump` backup path, not SQL restore or migration.

The subsequent `npm run docker:verify` passed the application/supporting stack,
HTTP/database/Redis and single-application inventory. Its latest backup receipt
is now `2026-10-23T10:25:43Z`. The guarded receipt completed at 10:26:15 UTC.

Ignored evidence: `.cache/backup-freshness/catchup.json` contains before/after
archive hashes and checks; `.cache/backup-catchup-20261023.mjs` is the exact
guarded operational harness. Archive payloads were not copied into the checkout.

## Source, hosting and recovery limits

The running backup program still has SHA-256
`5030437fdb83d9ba0845d5ce9cd9e7b3d823757aa7df96e707e9158071f8e298`.
The approved source-only fail-closed recovery repair is different and has not
been promoted. In particular, this successful actual pair does not remove the
older program's known uploads/configured-copy failure paths. Their repair and
synthetic native restore evidence remain in
`RECOVERY_FAILURE_PATH_AUDIT_2026-10-22.md`.

Daily cron on this workstation has demonstrated a missed run during a standby
interval. Dependable scheduled backup requires an available execution host and
missed-run/freshness monitoring appropriate to the adopted recovery objective.
No always-on hosting, power-setting change, wake timer, offsite destination or
new monitoring service was provisioned in this pass. Catching up once is not a
repair of that ongoing hosting/reconciliation requirement.

There is still no new restoration of this customer archive, independent offsite
copy/key recovery test, measured customer recovery time or coordinated promoted
release. The existing synthetic restoration record is a separate scope. The
full engineering-platform goal remains active.
