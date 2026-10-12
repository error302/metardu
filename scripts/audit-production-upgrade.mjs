// Read-only migration metadata and role review; no customer records are copied.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { migrationChecksums } from './verify-migrations.mjs'

function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding:'utf8', windowsHide:true, timeout:30_000 })
  if (result.error || result.status !== 0) throw new Error(`Read-only Docker audit failed: ${result.stderr?.trim() || result.error?.message || 'nonzero status'}`)
  return result.stdout.trim()
}
const app = JSON.parse(docker(['inspect','metardu-app']))[0]
const env = Object.fromEntries(app.Config.Env.map(item => { const index=item.indexOf('='); return [item.slice(0,index),item.slice(index+1)] }))
const runtimeRole = env.DATABASE_URL ? decodeURIComponent(new URL(env.DATABASE_URL).username) : env.DB_USER
if (!runtimeRole || !/^[a-z_][a-z0-9_]{0,62}$/i.test(runtimeRole)) throw new Error('Runtime role needs manual inspection.')
const sql = `BEGIN TRANSACTION READ ONLY;
SELECT jsonb_build_object(
 'ledger', (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM public.schema_migrations s),
 'runtimeRole', (SELECT to_jsonb(r) FROM (SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname='${runtimeRole}') r)
);
ROLLBACK;
`
const metadata = JSON.parse(docker(['exec','-i','metardu-postgres','sh','-c','exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],sql))
const applied = new Map(metadata.ledger.map(row => [String(row.version ?? row.filename).replace(/\.sql$/, ''),row]))
const files = readdirSync('src/lib/db/migrations').filter(name=>name.endsWith('.sql')).sort()
const pending = [], mutated = [], missingChecksums = []
for (const file of files) {
  const version=file.slice(0,-4), row=applied.get(version)
  if (!row) { pending.push(version); continue }
  const hashes=migrationChecksums(readFileSync(`src/lib/db/migrations/${file}`))
  if (!row.checksum) missingChecksums.push(version)
  else if (![hashes.checksum,...hashes.equivalentChecksums].includes(row.checksum)) mutated.push(version)
}
const ghosts=[...applied.keys()].filter(version=>!files.includes(`${version}.sql`))
const role=metadata.runtimeRole
const restrictedRole=Boolean(role && !role.rolsuper && !role.rolbypassrls && !role.rolcreatedb && !role.rolcreaterole)
const report={readOnly:true,customerRecordsCopied:false,productionImage:app.Image,runtimeRole:role,restrictedRole,sourceMigrationCount:files.length,appliedMigrationCount:applied.size,pending,mutated,missingChecksums,ghosts,compatibleForBlindPromotion:pending.length===0 && mutated.length===0 && missingChecksums.length===0 && ghosts.length===0 && restrictedRole}
mkdirSync('test-results/production-upgrade',{recursive:true})
writeFileSync('test-results/production-upgrade/metadata-audit.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
