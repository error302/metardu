import test from 'node:test'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { workflowUpgradeTarget, workflowUpgradeRegistry } from '../scripts/verify-workflow-upgrade.mjs'

test('workflow upgrade can target only its dedicated loopback synthetic database', () => {
  const source = 'postgresql://fixture:synthetic@127.0.0.1:55433/metardu_runtime_verify'
  assert.equal(new URL(workflowUpgradeTarget(source)).pathname, '/metardu_workflow_upgrade_verify')
  assert.equal(new URL(source).pathname, '/metardu_runtime_verify')
  for (const changed of [source.replace('127.0.0.1', 'customer.example'), source.replace('55433', '5432'), source.replace('metardu_runtime_verify', 'metardu'), source + '?sslmode=require', source + '#other', source.replace('postgresql:', 'https:')]) {
    assert.throws(() => workflowUpgradeTarget(changed))
  }
})

const pending = ['115_fieldbook_delivery_revisions', '116_surface_request_recovery', '117_scheme_import_receipts', '118_block_identity_retention', '119_reviewed_parcel_boundary_drafts', '120_scheme_export_requests', '121_parcel_draft_sharing', '122_retained_parcel_traverses', '123_boundary_request_recovery']
const files = Array.from({ length: 115 }, (_, index) => ({ version: `${String(index).padStart(3, '0')}_baseline` })).concat(Array.from({ length: 4 }, (_, index) => ({ version: `04${index}_additional` })), pending.map(version => ({ version })))
test('workflow rehearsal pins the complete 119-to-128 migration registry', () => {
  const original = structuredClone(files)
  const result = workflowUpgradeRegistry(files)
  assert.equal(result.baseline.length, 119)
  assert.deepEqual(result.pending.map(file => file.version), pending)
  assert.deepEqual(files, original)
  for (const bad of [files.slice(1), files.concat({ version: '124_unreviewed' }), files.map((file, index) => index === 119 ? { version: '115_unknown' } : file), files.map((file, index) => index === 118 ? files[0] : file)]) {
    assert.throws(() => workflowUpgradeRegistry(bad))
  }
})


test('contract imports work without any installed runtime package', () => {
  const loader = "import {isBuiltin} from 'node:module'; export async function resolve(s,c,next) { if(!isBuiltin(s)&&!s.startsWith('.')&&!s.startsWith('/')&&!s.startsWith('file:')) throw new Error('Runtime package loaded during contract import: '+s); return next(s,c) }"
  const source = "import {register} from 'node:module'; register('data:text/javascript,'+encodeURIComponent(process.argv[1]),import.meta.url); const verifier=await import(process.argv[2]); if(typeof verifier.workflowUpgradeTarget!=='function'||typeof verifier.workflowUpgradeRegistry!=='function') throw new Error('Contract exports missing')"
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source, loader, new URL('../scripts/verify-workflow-upgrade.mjs', import.meta.url).href], { encoding: 'utf8', windowsHide: true, timeout: 30000 })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
})
