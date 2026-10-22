// Run the actual backup script with synthetic pg_dump input inside the existing
// backup service. Only an owned temporary directory is written and removed.
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const source=readFileSync('scripts/backup.sh','utf8').replace(/\r\n/g,'\n')
assert.ok(!source.includes('\nMETARDU_BACKUP_SOURCE_END\n'))
const setup=`set -eu
task_dir=$(mktemp -d /tmp/metardu-backup-regression.XXXXXX)
case "$task_dir" in /tmp/metardu-backup-regression.*) ;; *) exit 99;; esac
trap 'rm -rf -- "$task_dir"' EXIT
mkdir -p "$task_dir/bin" "$task_dir/archives" "$task_dir/uploads"
printf 'Synthetic regression file only.\\n' > "$task_dir/uploads/synthetic.txt"
cat > "$task_dir/backup.sh" <<'METARDU_BACKUP_SOURCE_END'
${source}
METARDU_BACKUP_SOURCE_END
cat > "$task_dir/bin/pg_dump" <<'METARDU_DUMP_STUB_END'
#!/bin/sh
case "$TEST_CASE" in
 dump-failure) exit 7;;
 invalid-header) printf 'This is not a PostgreSQL dump\\n';;
 valid-small) printf -- '--\\n-- PostgreSQL database dump\\n--\\nSELECT 1;\\n-- PostgreSQL database dump complete\\n';;
 valid-large) printf -- '--\\n-- PostgreSQL database dump\\n--\\n'; awk 'BEGIN { for (i=0;i<50000;i++) print "-- synthetic SQL payload " i; print "-- PostgreSQL database dump complete" }';;
esac
METARDU_DUMP_STUB_END
chmod +x "$task_dir/bin/pg_dump"
export PATH="$task_dir/bin:$PATH"
export DATABASE_URL='postgresql://invalid:invalid@invalid.invalid/synthetic_backup_only'
export BACKUP_DIR="$task_dir/archives" UPLOADS_DIR="$task_dir/uploads"
export BACKUP_RETENTION=36500 GPG_RECIPI='' BACKUP_OFFSITE_DIR='' BACKUP_LOG_FILE=''
export TEST_CASE
bash "$task_dir/backup.sh"
`
const results=[]
for (const [name,expected] of [['valid-large',0],['valid-small',0],['invalid-header',2],['dump-failure',1]]) {
  const result=spawnSync('docker',['exec','-i','-e',`TEST_CASE=${name}`,'metardu-backup','bash','-s'],{input:setup,encoding:'utf8',windowsHide:true,timeout:30_000})
  if (result.error) throw result.error
  results.push({name,expectedExit:expected,actualExit:result.status,passed:result.status===expected,output:result.stdout+result.stderr})
}
mkdirSync('test-results/backup-verification',{recursive:true})
writeFileSync('test-results/backup-verification/regression.json',JSON.stringify({synthetic:true,customerDatabaseAccessed:false,results},null,2)+'\n')
console.log(JSON.stringify(results.map(({name,expectedExit,actualExit,passed})=>({name,expectedExit,actualExit,passed})),null,2))
assert.ok(results.every(result=>result.passed),'Backup verification must accept valid large/small dumps and reject failed dumps/invalid headers.')
