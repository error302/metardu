import { spawnSync } from 'node:child_process'
import { assertRuntimeArtifactPair, assertRuntimeMigrationContainer } from './runtime-artifact.mjs'

const services = ['metardu-app', 'metardu-worker', 'metardu-postgres', 'metardu-redis', 'metardu-collaboration', 'metardu-ntrip', 'metardu-backup']
function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 30_000 })
  if (result.error || result.status !== 0) throw new Error(`Docker ${args[0]} failed. Check Docker access; permission failure does not mean Docker is stopped.`)
  return result.stdout.trim()
}

try {
  const action = process.argv[2] ?? 'status'
  if (action === 'down' || action === 'build') throw new Error('This workflow preserves the running production stack. Build/deployment requires the migration and backup review in docs/DOCKER_RUNTIME_WORKFLOW.md; no duplicate test stack is started.')
  if (!['status', 'logs'].includes(action)) throw new Error('Use status or logs.')
  // Resolve in memory: Compose output contains deployment secrets.
  assertRuntimeArtifactPair(JSON.parse(docker(['compose', '-f', 'docker-compose.yml', 'config', '--format', 'json'])))
  const ids = docker(['ps', '-aq']).split(/\s+/).filter(Boolean)
  const containers = ids.length ? JSON.parse(docker(['inspect', ...ids])) : []
  for (const service of services) {
    const container = containers.find(item => item.Name === `/${service}`)
    if (!container || container.Config.Labels?.['com.docker.compose.project'] !== 'metardu' || container.State.Status !== 'running') throw new Error(`Production service is missing, stopped or not owned by this stack: ${service}`)
    if (container.State.Health && container.State.Health.Status !== 'healthy') throw new Error(`Production service is unhealthy: ${service}`)
    console.log(`${service}: ${container.State.Health?.Status ?? 'running (no configured healthcheck)'}`)
  }
  const app = containers.find(item => item.Name === '/metardu-app')
  const migration = containers.find(item => item.Name === '/metardu-db-migrate')
  assertRuntimeMigrationContainer(app, migration)
  console.log('Migration service: completed successfully with the application image.')
  const duplicates = containers.filter(item => item.Name !== '/metardu-app' && item !== migration && (
    /^\/metardu-.+-preview-/.test(item.Name) ||
    item.Config.Labels?.['com.docker.compose.service'] === 'metardu-app' ||
    /^metardu-release-verify:/.test(item.Config.Image ?? '') ||
    /^metardu-metardu-app(?::|$)/.test(item.Config.Image ?? '')
  ))
  if (duplicates.length) throw new Error(`Disposable/duplicate application containers found: ${duplicates.map(item => item.Name.slice(1)).join(', ')}. Inspect exact ownership and mounts before cleanup.`)
  const oldImages = docker(['image', 'ls', '--filter', 'reference=metardu-release-verify:*', '--format', '{{.Repository}}:{{.Tag}}'])
  if (oldImages) throw new Error('Dated verification images remain. Use inspected, allowlisted cleanup; never blanket prune.')
  if (containers.some(item => /^\/buildx_buildkit_metardu-release-verify-/.test(item.Name))) throw new Error('An old verification builder remains. Measure activity/cache and inspect its state mount before removal.')
  const health = await fetch('http://127.0.0.1:3000/api/public/health', { signal: AbortSignal.timeout(15_000) })
  const body = await health.json()
  if (!health.ok || body.status !== 'healthy' || body.checks?.database?.status !== 'ok' || body.checks?.redis?.status !== 'ok') throw new Error('Production HTTP/database/Redis health failed.')
  // A running cron container alone is not backup proof. Require a recent
  // completed run, and refuse an error recorded after the latest success.
  const backupLog = docker(['exec', 'metardu-backup', 'tail', '-n', '80', '/var/log/backup.log'])
  const successes = [...backupLog.matchAll(/\[([^\]]+)\] Backup complete\./g)]
  const lastSuccess = successes.at(-1)
  if (!lastSuccess || !Number.isFinite(Date.parse(lastSuccess[1])) || Date.now() - Date.parse(lastSuccess[1]) > 36 * 60 * 60 * 1000) throw new Error('The backup sidecar has no successful run within 36 hours. Inspect backup logs and preserve existing archives.')
  if (/\bERROR:/.test(backupLog.slice(lastSuccess.index + lastSuccess[0].length))) throw new Error('Backup errors were recorded after the latest completed run. Inspect the sidecar before promotion.')
  console.log(`Backup run completed at ${lastSuccess[1]}. This is archive/header evidence; restore recovery remains a separate gate.`)
  console.log('Production HTTP, database and Redis health passed. One METARDU application container; no dated verification images/builders.')
  if (action === 'logs') {
    const result = spawnSync('docker', ['logs', '--tail', '50', 'metardu-app'], { stdio: 'inherit', windowsHide: true, timeout: 30_000 })
    if (result.error || result.status !== 0) throw new Error('Reading app logs failed.')
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
