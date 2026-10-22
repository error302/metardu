# Backup and restore failure-path audit

Local date: 22 October 2026. Evidence timestamps are UTC, 21 October 2026.
Source HEAD: `8e0048bd` with existing unrelated survey-plan edits preserved.
The original audit below records the deployed failure paths. The approved
source-only repair is now verified by synthetic regressions; it has not been
deployed and is not a fresh customer archive restoration.

## Production read-only checkpoint

The required `npm run docker:verify` passed after obtaining Docker access. The
sandbox's initial access failure was not interpreted as a stopped service.
App, worker, PostgreSQL, Redis, collaboration and NTRIP are healthy; backup is
running without a configured healthcheck. App/migration image agreement,
HTTP/database/Redis checks and single-application inventory passed. The latest
logged backup completion remains 2026-10-21T12:33:15Z, within the verifier's
36-hour window. No services were started, stopped, rebuilt or migrated.

An additional read-only inspection at 2026-10-21T21:03:05Z checked exact owned
app/backup identities before reading fixed script/archive hashes. It reported
only selected metadata and configuration booleans; environment values and
customer payloads were suppressed.

- App image: `sha256:06103336484035d2aad7d3a1d45cf9bb37b8a814507b190108f5ae1586a9d0b0`.
- Backup container: `4aa9ef36303eda12db1cf320cebc66cdf15a450c412f52c31a2e5b845f091148`.
- Backup image: `sha256:7f9ce6698e7ace282e224b6c4c6f34f7f9d9fedfdbb7b31da22152ba9a99b380`.
- Backup `/uploads` is the same named volume as app `/app/upload`, mounted
  read-only in backup. Writable archive and host-copy mounts are present.
- `GPG_RECIPI` and `BACKUP_OFFSITE_DIR` are both unconfigured in this running
  sidecar. A writable host-copy mount alone does not configure automatic offsite
  replication. This check does not establish any independent offsite system.
- Deployed `/app/scripts/backup.sh` is byte-identical to the audited source,
  SHA-256 `5030437fdb83d9ba0845d5ce9cd9e7b3d823757aa7df96e707e9158071f8e298`.
- Existing `/backups/db_20261021_123314.sql.gz` retains SHA-256
  `33dc464ffa3835e2487ff85b0150bd4f0a869eedc1110528d60561e948803abb`.
- Existing `/backups/uploads_20261021_123314.tar.gz` retains SHA-256
  `c3af5321672e683836c3eb19ab71ee34e49fc99782491313b4ab2122a50e3700`.

Those archive hashes match the previous preservation record. They are not a new
restore test or a claim that every customer update since that backup is covered.
Earlier actual recovery evidence for the different October 9 archive remains in
`RECOVERY_AND_MIGRATION_REVIEW_2026-10-10.md` and its retained report. Its guarded
rehearsal helper uses stop-on-error/single-transaction handling; it is a different
program from the ordinary `scripts/restore.sh` audited below. No rejected clone
or pending synthetic database approval was bypassed.

## Reproduced failure paths

The host audit executed normalized copies of the actual source scripts with
fake pg_dump, pg_restore, psql and gpg commands. Selected tar/copy failures were
injected into synthetic fixture directories under `.cache/recovery-audit/`.
Successful fixture paths used the installed host gzip/tar utilities. No Docker,
database client, customer archive, browser state or production storage was
accessed by this synthetic probe. Source hashes were unchanged afterward.

| Probe | Actual wrapper outcome | Meaning |
| --- | --- | --- |
| Valid synthetic DB/uploads pair | Exit0, backup complete | Positive shell/fixture control |
| Upload tar exits23 | Warning, exit0, backup complete, retention invoked | Missing uploads can be counted as a successful backup |
| Upload directory missing | Exit0, backup complete, retention invoked | Required application files are not a completion precondition |
| Upload offsite copy exits23 | Warning, exit0, backup complete, retention invoked | Configured offsite copy can be incomplete without failure |
| Tar returns0 with invalid gzip bytes | Exit0, integrity verified, backup complete, retention invoked | Only database integrity is checked |
| Normal fake-client restore | Exit0, restore complete | Positive restore wrapper control |
| Fake psql prints SQL error but exits0 | Exit0, restore complete | Wrapper lacks SQL-error rejection flags |
| SKIP_SAFETY_BACKUP=1 | Restore complete, then unbound SAFETY_FILE, exit1 | Reported success contradicts final status |
| Fake database client exits7 | Restore failed, exit1 | Nonzero client exit does stop the wrapper |

These are nine executed audit cases, not nine passing recovery acceptance tests.
The SQL-error case simulates psql's default behavior; no SQL transaction was
actually run. The observed command trace supplies neither `ON_ERROR_STOP` nor
single-transaction options for `restore.sh`. PostgreSQL documents that psql
normally continues after SQL errors and describes the stop-on-error exit status
and transaction options in its [official psql reference](https://www.postgresql.org/docs/16/app-psql.html).
The [official dump recovery guidance](https://www.postgresql.org/docs/16/backup-dump.html)
also distinguishes a transactionally complete restore from continuing after
errors. This establishes the wrapper gap without inventing database test proof.

All four restore probes printed the synthetic URL's password marker. The source
prints `DATABASE_URL` directly. No real connection string or credential was
used or disclosed by the audit. `restore.sh` also says it will drop/recreate the
database although it only replays the supplied SQL; that warning is not evidence
that target creation/cleanup actually occurs.

Independent Node decompression/header inspection accepted the positive fixture
upload archive and rejected the deliberately invalid output. Source review also
shows that encryption, when enabled, applies to the database archive alone;
uploads remain unencrypted. Do not advertise encryption of the entire recovery
set based on that option.

## Why ordinary health is insufficient

The runtime verifier requires a recent `Backup complete` log line and rejects
`ERROR:` after it. These failed uploads paths use warnings/skips before a success
line, so the verifier can pass without a complete recoverable pair. Its existing
health result remains valid within that limited contract. It must not be
reported as fresh restore proof or whole-recovery-set integrity proof.

## Proposed bounded repair

The existing flows are available to repair without adding a new recovery
subsystem: require the configured uploads directory and validate database gzip/
SQL header plus uploads gzip/tar listing before completion or retention; make
required uploads and configured offsite-copy failures fatal; preserve earlier
archives on failure. Keep encryption's actual scope explicit rather than claim
uploads encryption. Add synthetic regression cases that exercise these paths
and the existing valid large/small dump checks.

For ordinary restore, redact connection credentials, verify the chosen input
before applying it, use clean-session stop-on-error transactional psql execution,
make safety-backup reporting correct for both modes, and explain that supplied
SQL is applied to the selected target without silently promising a drop/recreate.
Cover SQL/client/decompression failures, abort, invalid input and skipped/default
safety backup with synthetic tests. Real transactional restore still needs a
separately authorized isolated database test; mocked flags are not that proof.

The user approved this bounded source-only repair on 22 October. Deployment,
offsite destination choice, encryption/key recovery policy, customer restore
rehearsal and retention/RPO/RTO acceptance remain separate actions.

## Approved source repair and verification

`scripts/backup.sh` now requires the configured uploads directory, stages a
database/uploads pair privately, checks database gzip/header and uploads gzip/
tar listing, and fails any required archive/encryption/configured-copy error.
Both configured copies must match their source bytes before retention or the
completion line. A local directory lock serializes backup publication and
retention. Publication refuses to replace an existing timestamp, including a
directory at that name. Retention only visits matching regular files directly
inside the configured archive directories; no recursive cleanup is performed.
Earlier archives remain untouched in the failure regressions.

The lock intentionally fails closed if it already exists. After an interrupted
run, an operator must inspect active backup processes before removing that exact
`.backup.lock` directory. Failed runs may leave newly published partial pairs or
partial offsite copies; they do not report completion or trigger retention. An
archive filename alone is not evidence of a complete pair. Local staging needs
hard-link support in the archive filesystem; unsupported publication fails.

`scripts/restore.sh` validates and completely decompresses/decrypts the trusted
input before database contact. Cancellation makes no database calls. After
confirmation, a default safety dump must pass gzip/header checks before SQL is
applied. It invokes psql with `-X`, `ON_ERROR_STOP=1`, `--single-transaction` and
a fully materialized SQL file, then propagates failure instead of reporting
success. The skipped-safety mode reports its actual status and exits correctly.
Connection strings and client/safety-dump diagnostics are withheld from console
output to prevent credential disclosure. The warning accurately describes SQL
application rather than promising database creation or uploads restoration.

SQL archives execute code and must be trusted; a header is not a signature or
proof of semantic compatibility. A transaction flag does not make arbitrary SQL
safe, nor prove a real rollback occurred. Restore remains an explicit operator
action against a deliberately chosen target.

The maintained command is `node --test tests/recovery-scripts.test.mjs`. It runs
the actual normalized source scripts with isolated synthetic files, real host
gzip/tar/copy utilities, and stub PostgreSQL/GPG commands. All 30 cases pass,
zero skipped (40.6 seconds on Windows Git Bash). The first 21-case run against
unchanged source produced 14 expected failures; valid small/large dump controls
passed. Additional tests exposed credential leakage in pg_dump errors, a tar
implementation accepting non-tar gzip as an empty listing, and publication into
an existing directory. Each was reproduced before correction. The final suite
also covers truncated compressed input, invalid SQL headers, required safety
dump failure, copy corruption, archive collisions, and both gzip/encrypted input
branches. The positive GPG branch is a stub, not real cryptographic/key recovery
evidence. Existing positive regression fixtures now provide required synthetic
uploads. The existing CI Node gate includes the maintained suite; GitHub-hosted
execution and Alpine sidecar compatibility remain unverified.

Node syntax checks, scoped whitespace checks, CI YAML parsing and the existing
security/migration-immutability gate pass. No production service, customer
archive, database, migration, offsite configuration or encryption policy was
changed by this repair. The inspected running sidecar still uses the older
script and retains the original failure paths until an approved promotion.

Additional ignored evidence: `.cache/recovery-audit/source-repair-red.log`,
`source-repair-edge-red.log`, `source-repair-final.log`, and per-case outputs and
traces under `.cache/recovery-script-tests/run-*/`. Automatic approval review
initially disconnected before execution; those rejected attempts are not test
results. Subsequent host execution succeeded through the normal approval path.

Ignored evidence: `.cache/recovery-audit/audit-synthetic.mjs`,
`synthetic-summary.json`, `synthetic-run/` command traces/output/fixtures,
`independent-fixture-integrity.json`, `inspect-runtime.mjs` and
`runtime-summary.json`. Audited restore source SHA-256:
`99b7a5f52dc916318b47c50dab253eb978bc2c89cb422e061ff812f1861f166a`.
