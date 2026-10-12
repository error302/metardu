/** @jest-environment node */
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

function config(overrides: Record<string, string> = {}) {
  const env = { ...process.env, ...overrides }
  if (!('TEST_ADMIN_DATABASE_URL' in overrides)) delete env.TEST_ADMIN_DATABASE_URL
  if (!('TEST_RUNTIME_DATABASE_URL' in overrides)) delete env.TEST_RUNTIME_DATABASE_URL
  const moduleUrl = pathToFileURL(path.join(process.cwd(), 'scripts/rehearsal-database.mjs')).href
  const driver = `
    const { rehearsalDatabaseConfig } = await import(${JSON.stringify(moduleUrl)});
    try {
      const cfg = rehearsalDatabaseConfig();
      process.stdout.write(JSON.stringify({ database: cfg.database, runtimeRole: cfg.runtimeRole, host: new URL(cfg.adminUrl).hostname }));
    } catch(error) { process.stdout.write(JSON.stringify({ error: error.message })); }
  `
  return JSON.parse(execFileSync('node', ['--input-type=module', '-e', driver], { env, encoding: 'utf8' })) as {
    database?: string; runtimeRole?: string; host?: string; error?: string
  }
}
const admin = 'postgresql://ci:ci@127.0.0.1:5432/metardu_e2e'
const runtime = 'postgresql://ci_app:test-only@127.0.0.1:5432/metardu_e2e'

test('ignores deployment connection variables when using its disposable default', () => {
  expect(config({ DATABASE_URL: 'postgresql://owner:unused@production.invalid/metardu', DB_HOST: 'production.invalid' })).toEqual({
    database: 'metardu_release_rehearsal', runtimeRole: 'release_app', host: '127.0.0.1',
  })
})
test('accepts the explicit separated CI rehearsal logins', () => {
  expect(config({ TEST_ADMIN_DATABASE_URL: admin, TEST_RUNTIME_DATABASE_URL: runtime })).toEqual({
    database: 'metardu_e2e', runtimeRole: 'ci_app', host: '127.0.0.1',
  })
})
test.each([
  runtime.replace('127.0.0.1', 'production.invalid'),
  runtime.replace('/metardu_e2e', '/metardu'),
  runtime.replace('postgresql:', 'https:'),
  runtime + '?options=-csearch_path=public',
  runtime.replace(':5432', ':55433'),
  runtime.replace('ci_app:', 'ci:'),
  runtime.replace('ci_app:', 'invalid%22role:'),
])('rejects unsafe or mismatched rehearsal configuration %s', candidate => {
  expect(config({ TEST_ADMIN_DATABASE_URL: admin, TEST_RUNTIME_DATABASE_URL: candidate }).error).toBeDefined()
})
