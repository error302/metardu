# Backup catch-up, 25 October 2026

The fresh `npm run docker:verify` reported healthy required services but failed
its 36-hour backup freshness gate. The last completion was 24 October at
02:00:04 UTC. The existing backup daemon was running; no archive job was active.
This observation does not establish why the scheduled run was missed.

An owned catch-up run used the already installed script in the existing
`metardu-backup` sidecar. Container identity, Compose ownership, the exact
backup volume and read-only uploads mount were checked. Its installed script
hash stayed `5030437fdb83d9ba0845d5ce9cd9e7b3d823757aa7df96e707e9158071f8e298`.
The one process used `BACKUP_RETENTION=36500`, after proving that no existing
file was eligible for that retention window. No persistent configuration,
installed script, service, account or application image was changed.

The job completed at **2026-10-25T16:59:14Z**. Its exact new archives are:

- `/backups/db_20261025_165912.sql.gz`, SHA-256
  `9589eebf02b8d62feac16dfdf39c7652e2e8f401956f6bad79a66479cb83adf4`.
- `/backups/uploads_20261025_165912.tar.gz`, SHA-256
  `c3af5321672e683836c3eb19ab71ee34e49fc99782491313b4ab2122a50e3700`.

The database gzip/header checks, both gzip integrity checks and uploads tar
listing succeeded. All **88** earlier archive files retained their exact
hashes. The operational receipt is `.cache/backup-catchup-20261025.json`.
A fresh `npm run docker:verify` then passed with one existing application and
its required services. This is local archive/header and runtime evidence;
restored recovery, off-host disaster recovery, scheduler reliability and
promotion of the stronger source backup implementation remain separate gates.
