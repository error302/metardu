import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { assertRuntimeArtifactPair, assertRuntimeMigrationContainer } from './runtime-artifact.mjs'
test('one explicitly selected artifact is shared by application and migration services', () => {
  assert.equal(assertRuntimeArtifactPair({ services: { 'metardu-app': { image: 'metardu-metardu-app:candidate', build: {} }, 'metardu-db-migrate': { image: 'metardu-metardu-app:candidate' } } }), 'metardu-metardu-app:candidate')
})
test('a separately versioned migration image cannot pass the artifact gate', () => {
  assert.throws(() => assertRuntimeArtifactPair({ services: { 'metardu-app': { image: 'metardu-metardu-app:candidate' }, 'metardu-db-migrate': { image: 'metardu-metardu-db-migrate:latest' } } }))
})
test('an unselected or separately built migration artifact is refused', () => {
  assert.throws(() => assertRuntimeArtifactPair({ services: { 'metardu-app': { build: {} }, 'metardu-db-migrate': { build: {} } } }))
  assert.throws(() => assertRuntimeArtifactPair({ services: { 'metardu-app': { image: 'app:pinned' }, 'metardu-db-migrate': { image: 'app:pinned', build: {} } } }))
})

test('only a successful owned migration container with the identical image can pass', () => {
  const app = { Image: 'sha256:current' }
  const migration = { Name: '/metardu-db-migrate', Image: app.Image, Config: { Labels: { 'com.docker.compose.project': 'metardu', 'com.docker.compose.service': 'metardu-db-migrate' } }, State: { Status: 'exited', ExitCode: 0 } }
  assert.doesNotThrow(() => assertRuntimeMigrationContainer(app, migration))
  for (const invalid of [undefined, { ...migration, Image: 'sha256:stale' }, { ...migration, State: { Status: 'exited', ExitCode: 1 } }, { ...migration, State: { Status: 'running', ExitCode: 0 } }, { ...migration, Config: { Labels: { 'com.docker.compose.project': 'other' } } }]) {
    assert.throws(() => assertRuntimeMigrationContainer(app, invalid))
  }
})
test('the actual resolved Compose topology shares its release artifact without an independent migration build', context => {
  const result = spawnSync('docker', ['compose', '-f', 'docker-compose.yml', 'config', '--format', 'json'], { encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024 })
  if (result.error?.code === 'ENOENT') { context.skip('Docker CLI unavailable; resolved Compose acceptance remains unverified'); return }
  assert.equal(result.status, 0, 'Compose configuration could not be resolved; output suppressed to protect environment values')
  const config = JSON.parse(result.stdout)
  assert.equal(typeof assertRuntimeArtifactPair(config), 'string')
})
