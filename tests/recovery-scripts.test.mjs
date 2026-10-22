// Execute the real shell scripts with synthetic data and stub PostgreSQL/GPG
// commands. This suite never invokes Docker, a real DB client or customer files.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync, gunzipSync } from 'node:zlib'

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const evidence = path.join(repository, '.cache', 'recovery-script-tests')
mkdirSync(evidence, { recursive: true })
const runRoot = mkdtempSync(path.join(evidence, 'run-'))
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/usr/bin/bash'
const results = []
const scripts = Object.fromEntries(['backup', 'restore'].map(name => [name, readFileSync(path.join(repository, 'scripts', `${name}.sh`), 'utf8').replaceAll('\r\n', '\n')]))
const sql = '--\n-- PostgreSQL database dump\n--\nSELECT 1;\n-- PostgreSQL database dump complete\n'
const stubs = {
  mktemp: `#!/usr/bin/bash
# Reproduce BusyBox's trailing-X template requirement without replacing the
# host's random-name generation or file/directory creation.
if [ "$TEST_CASE" = portable-mktemp ]; then
  case "\${@: -1}" in *XXXXXX) ;; *) printf 'mktemp: Invalid argument\\n' >&2; exit 1;; esac
fi
exec /usr/bin/mktemp "$@"
`,
  pg_dump: `#!/usr/bin/bash
printf 'pg_dump\\n' >> "$TEST_TRACE"
case "$TEST_CASE" in
 dump-failure|safety-dump-failure) printf '%s\\n' "$DATABASE_URL" >&2; exit 7;;
 invalid-header|safety-invalid-header) printf 'invalid database archive\\n'; exit 0;;
esac
printf -- '--\\n-- PostgreSQL database dump\\n--\\n'
if [ "$TEST_CASE" = valid-large ]; then awk 'BEGIN { for (i=0;i<50000;i++) print "-- synthetic SQL payload " i }'; fi
printf -- 'SELECT 1;\\n-- PostgreSQL database dump complete\\n'
`,
  pg_restore: '#!/usr/bin/bash\nexit 1\n',
  psql: `#!/usr/bin/bash
printf 'psql' >> "$TEST_TRACE"
printf ' <%s>' "$@" >> "$TEST_TRACE"
printf '\\n' >> "$TEST_TRACE"
if [ "$TEST_CASE" = client-failure ]; then printf '%s\\n' "$DATABASE_URL" >&2; exit 7; fi
if [ "$TEST_CASE" = sql-error ]; then
  printf 'ERROR: synthetic SQL failure\\n' >&2
  case "$*" in *ON_ERROR_STOP=1*) exit 3;; esac
fi
exit 0
`,
  tar: `#!/usr/bin/bash
if [ "$1" = -czf ]; then
 case "$TEST_CASE" in
  uploads-tar-failure) exit 23;;
  uploads-corrupt-output) printf 'invalid-gzip-tar' > "$2"; exit 0;;
  uploads-invalid-tar) printf 'valid gzip, invalid tar' | gzip > "$2"; exit 0;;
 esac
fi
exec /usr/bin/tar "$@"
`,
  cp: `#!/usr/bin/bash
source_file="\${@: -2:1}"
destination="\${@: -1}"
case "$source_file" in *uploads_*)
 if [ "$TEST_CASE" = uploads-offsite-failure ]; then exit 23; fi
 if [ "$TEST_CASE" = uploads-offsite-corrupt-copy ]; then
   if [ -d "$destination" ]; then destination="$destination/$(basename -- "$source_file")"; fi
   printf 'invalid-copy' > "$destination"; exit 0
 fi
esac
exec /usr/bin/cp "$@"
`,
  find: `#!/usr/bin/bash
printf 'find' >> "$TEST_TRACE"
printf ' <%s>' "$@" >> "$TEST_TRACE"
printf '\\n' >> "$TEST_TRACE"
exec /usr/bin/find "$@"
`,
  gpg: `#!/usr/bin/bash
printf 'gpg\\n' >> "$TEST_TRACE"
if [ "$TEST_CASE" = decrypt-failure ] || [ "$TEST_CASE" = encrypt-failure ]; then exit 9; fi
output=''
while [ "$#" -gt 0 ]; do
  if [ "$1" = --output ]; then output="$2"; shift 2; else input="$1"; shift; fi
done
if [ -n "$output" ]; then cat "$input" > "$output"; else cat "$input"; fi
`,
}

function runCase(name, { script = 'backup', offsite = false, skipSafety = false, confirmation = 'RESTORE\n', encryption = false } = {}) {
  assert.match(name, /^[a-z][a-z0-9-]+$/)
  const root = path.resolve(runRoot, name)
  assert.ok(root.startsWith(runRoot + path.sep))
  for (const dir of ['bin', 'archives', 'offsite', 'tmp']) mkdirSync(path.join(root, dir), { recursive: true })
  if (name !== 'uploads-directory-missing') {
    mkdirSync(path.join(root, 'uploads'))
    writeFileSync(path.join(root, 'uploads', 'synthetic.txt'), 'Synthetic file only.\n')
  }
  for (const [command, contents] of Object.entries(stubs)) writeFileSync(path.join(root, 'bin', command), contents)
  writeFileSync(path.join(root, 'source.sh'), scripts[script])
  writeFileSync(path.join(root, 'input.sql'), sql)
  writeFileSync(path.join(root, 'input.txt'), sql)
  writeFileSync(path.join(root, 'prior-archive.txt'), 'preserve-original')
  writeFileSync(path.join(root, 'archives', 'db_20000101_000000.sql.gz'), 'preserve-original')
  writeFileSync(path.join(root, 'archives', 'uploads_20000101_000000.tar.gz'), 'preserve-original')
  const input = name === 'missing-input' ? 'missing.sql' : name === 'invalid-extension' ? 'input.txt' : ['corrupt-input', 'truncated-input', 'restore-gzip'].includes(name) ? 'input.sql.gz' : ['decrypt-failure', 'restore-encrypted'].includes(name) ? 'input.sql.gz.gpg' : 'input.sql'
  if (name === 'corrupt-input') writeFileSync(path.join(root, input), 'not-gzip')
  if (name === 'invalid-sql-header') writeFileSync(path.join(root, input), 'SELECT 1;\n')
  if (name === 'truncated-input') writeFileSync(path.join(root, input), gzipSync(sql).subarray(0, -4))
  if (['restore-gzip', 'restore-encrypted'].includes(name)) writeFileSync(path.join(root, input), gzipSync(sql))
  if (name === 'decrypt-failure') writeFileSync(path.join(root, 'input.sql.gz.gpg'), 'synthetic ciphertext')
  if (name === 'existing-backup-lock') mkdirSync(path.join(root, 'archives', '.backup.lock'))
  if (name === 'archive-name-collision' || name === 'archive-directory-collision') {
    writeFileSync(path.join(root, 'bin', 'date'), `#!/usr/bin/bash\nif [ "$*" = "-u +%Y%m%d_%H%M%S" ]; then printf "${name === 'archive-directory-collision' ? '19990101' : '20000101'}_000000\\n"; else exec /usr/bin/date "$@"; fi\n`)
    if (name === 'archive-directory-collision') {
      mkdirSync(path.join(root, 'archives', 'db_19990101_000000.sql.gz.gpg'))
    }
  }
  const setup = `#!/usr/bin/bash
set -eu
cd -- "$(dirname -- "$0")"
fixture_dir="$PWD"
export PATH="$fixture_dir/bin:/usr/bin:/bin"
chmod +x "$fixture_dir/bin/"*
export TEST_CASE='${name}' TEST_TRACE="$fixture_dir/trace.log"
export DATABASE_URL='postgresql://synthetic:RECOVERY_TEST_PASSWORD@invalid.invalid/synthetic_only'
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE || true
export BACKUP_DIR="$fixture_dir/archives" UPLOADS_DIR="$fixture_dir/uploads" TMPDIR="$fixture_dir/tmp"
export BACKUP_OFFSITE_DIR=${offsite ? '"$fixture_dir/offsite"' : "''"}
export BACKUP_RETENTION=36500 GPG_RECIPI=${encryption ? "'synthetic-only'" : "''"} BACKUP_LOG_FILE=''
export SKIP_SAFETY_BACKUP=${skipSafety ? '1' : '0'}
exec bash "$fixture_dir/source.sh"${script === 'restore' ? ` "$fixture_dir/${name === 'decrypt-failure' ? 'input.sql.gz.gpg' : input}"` : ''}
`
  writeFileSync(path.join(root, 'run.sh'), setup)
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]]))
  const execution = spawnSync(bash, ['--noprofile', '--norc', path.join(root, 'run.sh').replaceAll('\\', '/')], { env, input: confirmation, encoding: 'utf8', timeout: 20000, windowsHide: true, maxBuffer: 1024 * 1024 })
  if (execution.error) throw execution.error
  const output = execution.stdout + execution.stderr
  const trace = existsSync(path.join(root, 'trace.log')) ? readFileSync(path.join(root, 'trace.log'), 'utf8') : ''
  const result = { name, script, status: execution.status, output, trace, root }
  writeFileSync(path.join(root, 'output.log'), output)
  results.push({ name, script, status: execution.status, output, trace })
  writeFileSync(path.join(runRoot, 'summary.json'), JSON.stringify({ synthetic: true, realDatabaseAccess: false, results }, null, 2) + '\n')
  assert.equal(readFileSync(path.join(root, 'archives', 'db_20000101_000000.sql.gz'), 'utf8'), 'preserve-original')
  assert.equal(readFileSync(path.join(root, 'archives', 'uploads_20000101_000000.tar.gz'), 'utf8'), 'preserve-original')
  return result
}

for (const name of ['valid-small', 'valid-large']) test(`backup accepts a verified synthetic pair: ${name}`, { timeout: 30000 }, () => {
  const result = runCase(name)
  assert.equal(result.status, 0, result.output)
  assert.match(result.output, /Backup complete\./)
})

for (const name of ['dump-failure', 'invalid-header', 'uploads-directory-missing', 'uploads-tar-failure', 'uploads-corrupt-output', 'uploads-offsite-failure', 'uploads-offsite-corrupt-copy', 'encrypt-failure']) {
  test(`backup refuses completion and retention after ${name}`, { timeout: 30000 }, () => {
    const result = runCase(name, { offsite: name.startsWith('uploads-offsite'), encryption: name === 'encrypt-failure' })
    assert.notEqual(result.status, 0, result.output)
    assert.doesNotMatch(result.output, /Backup complete\./)
    assert.doesNotMatch(result.trace, /find[^\n]*<-delete>/)
  })
}

test('backup verifies both configured offsite copies before reporting completion', { timeout: 30000 }, () => {
  const result = runCase('offsite-success', { offsite: true })
  assert.equal(result.status, 0, result.output)
  const names = readdirSync(path.join(result.root, 'offsite'))
  assert.equal(names.filter(name => name.startsWith('db_')).length, 1)
  assert.equal(names.filter(name => name.startsWith('uploads_')).length, 1)
})

for (const skipSafety of [false, true]) test(`restore succeeds with honest safety status: ${skipSafety ? 'skipped' : 'default'}`, { timeout: 30000 }, () => {
  const result = runCase(skipSafety ? 'restore-skip-safety' : 'restore-default-safety', { script: 'restore', skipSafety })
  assert.equal(result.status, 0, result.output)
  assert.match(result.output, /Restore complete\./)
  assert.doesNotMatch(result.output, /RECOVERY_TEST_PASSWORD|SAFETY_FILE: unbound variable|will DROP/i)
  assert.match(result.trace, /psql[^\n]*ON_ERROR_STOP=1/)
  assert.match(result.trace, /psql[^\n]*(?:--single-transaction|<-1>)/)
  assert.match(result.trace, /psql[^\n]*(?:--file|<-f>)/)
  assert.match(result.trace, /psql[^\n]*<-X>/)
  assert.equal(result.trace.includes('pg_dump'), !skipSafety)
  if (skipSafety) assert.match(result.output, /safety backup.*skipped/i)
})

test('restore creates a usable private safety archive with portable trailing-X mktemp', { timeout: 30000 }, () => {
  const result = runCase('portable-mktemp', { script: 'restore' })
  assert.equal(result.status, 0, result.output)
  assert.match(result.output, /Safety backup verified/)
  const directories = readdirSync(path.join(result.root, 'archives')).filter(name => name.startsWith('pre_restore_'))
  assert.equal(directories.length, 1)
  const safety = path.join(result.root, 'archives', directories[0], 'database.sql.gz')
  assert.match(gunzipSync(readFileSync(safety)).toString('utf8'), /-- PostgreSQL database dump/)
  assert.match(result.output, /pre_restore_[^\s]+\/database\.sql\.gz/)
  assert.match(result.trace, /pg_dump[\s\S]*psql/)
})

for (const name of ['sql-error', 'client-failure', 'safety-dump-failure', 'safety-invalid-header']) test(`restore never reports success after ${name}`, { timeout: 30000 }, () => {
  const result = runCase(name, { script: 'restore' })
  assert.notEqual(result.status, 0, result.output)
  assert.doesNotMatch(result.output, /Restore complete\.|RECOVERY_TEST_PASSWORD/)
  if (name.startsWith('safety-')) assert.doesNotMatch(result.trace, /psql/)
})

for (const name of ['missing-input', 'invalid-extension', 'invalid-sql-header', 'corrupt-input', 'truncated-input', 'decrypt-failure']) test(`restore validates ${name} before any database command`, { timeout: 30000 }, () => {
  const result = runCase(name, { script: 'restore' })
  assert.notEqual(result.status, 0, result.output)
  assert.doesNotMatch(result.trace, /pg_dump|psql/)
  assert.doesNotMatch(result.output, /Restore complete\.|RECOVERY_TEST_PASSWORD/)
})

for (const name of ['restore-gzip', 'restore-encrypted']) test(`restore materializes a complete ${name} archive before applying SQL`, { timeout: 30000 }, () => {
  const result = runCase(name, { script: 'restore' })
  assert.equal(result.status, 0, result.output)
  assert.match(result.output, /Restore complete\./)
})

for (const name of ['existing-backup-lock', 'archive-name-collision', 'archive-directory-collision', 'uploads-invalid-tar']) test(`backup preserves existing archives and refuses completion after ${name}`, { timeout: 30000 }, () => {
  const result = runCase(name, { encryption: name === 'archive-directory-collision' })
  assert.notEqual(result.status, 0, result.output)
  assert.doesNotMatch(result.output, /Backup complete\./)
  assert.doesNotMatch(result.trace, /find[^\n]*<-delete>/)
})

test('restore abort does not contact the database', { timeout: 30000 }, () => {
  const result = runCase('restore-abort', { script: 'restore', confirmation: 'ABORT\n' })
  assert.equal(result.status, 0, result.output)
  assert.doesNotMatch(result.trace, /pg_dump|psql/)
  assert.doesNotMatch(result.output, /Restore complete\.|RECOVERY_TEST_PASSWORD/)
})
