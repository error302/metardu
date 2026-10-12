// Exact, reversible one-line hotfix to the inspected backup sidecar. No restart.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
function docker(args,input) {
  const result=spawnSync('docker',args,{input,encoding:'utf8',windowsHide:true,timeout:30_000})
  if (result.error || result.status!==0) throw new Error(`Backup hotfix stopped: ${result.stderr || result.error?.message || 'operation failed'}`)
  return result.stdout
}
const original=docker(['exec','metardu-backup','cat','/app/scripts/backup.sh'])
const hash=value=>createHash('sha256').update(value).digest('hex')
assert.equal(hash(original),'20a91085dcba3a3798c179ab3f2ec8215aface2d48e5e34061ed28a680d08c54','Running script changed; inspect again.')
const old='  if ! zcat "$DB_FILE" | head -1 | grep -qi "postgresql\\|--"; then'
assert.equal(original.split(old).length,2,'Expected exactly one inspected header-check line.')
const fixed=original.replace(old,'  if ! zcat "$DB_FILE" | awk \'NR <= 10 && $0 == "-- PostgreSQL database dump" { header = 1 } END { exit(header ? 0 : 1) }\'; then')
docker(['exec','-i','metardu-backup','bash','-n'],fixed)
mkdirSync('.cache/release-verify',{recursive:true})
writeFileSync('.cache/release-verify/backup-runtime-hotfix.sh',fixed)
if (process.argv[2] !== '--apply') { console.log('Prepared and syntax-checked the one-line backup hotfix; use --apply to install.'); process.exit(0) }
docker(['exec','metardu-backup','test','!','-e','/app/scripts/backup.sh.before-20261010'])
docker(['exec','metardu-backup','cp','-p','/app/scripts/backup.sh','/app/scripts/backup.sh.before-20261010'])
docker(['cp','.cache/release-verify/backup-runtime-hotfix.sh','metardu-backup:/app/scripts/backup.sh'])
docker(['exec','metardu-backup','chmod','755','/app/scripts/backup.sh'])
const installed=docker(['exec','metardu-backup','cat','/app/scripts/backup.sh'])
assert.equal(hash(installed),hash(fixed))
const report={oneLineHotfix:true,restarted:false,originalSha256:hash(original),installedSha256:hash(installed),rollback:'/app/scripts/backup.sh.before-20261010',scope:'Backup script only. Customer records, volumes and production application configuration unchanged.'}
mkdirSync('test-results/backup-verification',{recursive:true})
writeFileSync('test-results/backup-verification/runtime-hotfix.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
