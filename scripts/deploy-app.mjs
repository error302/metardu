// Reusable app-container deploy: stale-checkout guard, rollback tag, build,
// switch, smoke. Only ever touches metardu-app; supporting services are left
// running. Run as: npm run deploy:app   (FORCE=1 to override the guard)
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const COMPOSE_FILE = process.env.METARDU_COMPOSE_FILE || 'docker-compose.yml'
const APP_CONTAINER = 'metardu-app'
const FORCE = process.env.FORCE === '1'
const PROJECT_DIR = join(import.meta.dirname, '..')

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: PROJECT_DIR, encoding: 'utf8', windowsHide: true, timeout: 600_000, ...opts })
  if (r.error || r.status !== 0) {
    const tail = (r.stderr || r.stdout || '').trim().split('\n').slice(-6).join('\n')
    throw new Error(`${cmd} ${args.join(' ')} failed (exit ${r.status ?? 'spawn-error'})\n${tail}`)
  }
  return (r.stdout || '').trim()
}

function git(args, timeout = 60_000) {
  return run('git', args, { timeout })
}

console.log('=== METARDU app deploy ===')
console.log(`Time: ${new Date().toISOString()}`)

// ─── 1. Stale-checkout guard ────────────────────────────────────────────────
// The one-line check that would have caught the near-rollback: refuse to build
// from a checkout whose HEAD is behind origin/main unless explicitly forced.
git(['fetch', 'origin', 'main'])
const behind = Number(git(['rev-list', '--count', 'HEAD..origin/main']))
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
const head = git(['rev-parse', '--short', 'HEAD'])
console.log(`Checkout: ${branch} @ ${head}, ${behind} commit(s) behind origin/main`)
if (behind > 0 && !FORCE) {
  console.error(`ABORT: this checkout is ${behind} commit(s) behind origin/main. Deploying would roll production back.`)
  console.error('Pull/rebase first, or run with FORCE=1 to deploy anyway.')
  process.exit(1)
}
if (behind > 0 && FORCE) console.warn('FORCE=1: deploying a stale checkout on explicit request.')
const dirty = git(['status', '--porcelain'])
if (dirty) {
  const n = dirty.split('\n').length
  console.warn(`WARNING: working tree has ${n} uncommitted change(s); the image will not match any commit.`)
  if (!FORCE) {
    console.error('ABORT: commit or stash first, or run with FORCE=1 to build the working tree as-is.')
    process.exit(1)
  }
}

// ─── 2. Tag the currently running image for rollback ───────────────────────
// Captured from the RUNNING container (not `latest`), so the tag is exactly
// what production serves right now, before anything is rebuilt.
let rollbackTag = null
const inspect = spawnSync('docker', ['inspect', APP_CONTAINER, '--format', '{{.Image}}'], { encoding: 'utf8', windowsHide: true })
if (inspect.status === 0) {
  const runningImage = inspect.stdout.trim()
  rollbackTag = `rollback-${new Date().toISOString().slice(0, 13).replace(/[-:T]/g, '')}`
  run('docker', ['image', 'tag', runningImage, `metardu-metardu-app:${rollbackTag}`])
  console.log(`Rollback image tagged: metardu-metardu-app:${rollbackTag} (was serving ${runningImage.slice(7, 19)})`)
} else {
  console.warn('No running metardu-app container found; skipping rollback tag (fresh install?).')
}

// ─── 3. Build + switch (app only) ───────────────────────────────────────────
console.log('Building metardu-app image...')
run('docker', ['compose', '-f', COMPOSE_FILE, 'build', 'metardu-app'])
console.log('Switching metardu-app container (supporting services untouched)...')
run('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', '--no-deps', '--wait', '--wait-timeout', '180', 'metardu-app'])

const imageId = run('docker', ['inspect', APP_CONTAINER, '--format', '{{.Image}}'])
const envJson = run('docker', ['inspect', APP_CONTAINER, '--format', '{{json .Config.Env}}'])
const buildSha = JSON.parse(envJson).find((e) => e.startsWith('METARDU_BUILD_SHA='))?.split('=')[1]
console.log(`Running: ${imageId.slice(7, 19)} build=${buildSha || 'unlabelled'}`)

// ─── 4. Smoke ───────────────────────────────────────────────────────────────
console.log('Smoke checks...')
const smoke = spawnSync(process.execPath, [join('scripts', 'smoke-production.mjs')], {
  cwd: PROJECT_DIR, encoding: 'utf8', windowsHide: true, timeout: 120_000,
  env: { ...process.env },
})
process.stdout.write(smoke.stdout || '')
process.stderr.write(smoke.stderr || '')
if (smoke.status !== 0) {
  console.error('SMOKE FAILED after the switch.')
  if (rollbackTag) {
    console.error(`Roll back with:\n  docker compose -f ${COMPOSE_FILE} up -d --no-deps --no-build metardu-app  # after:`)
    console.error(`  docker tag metardu-metardu-app:${rollbackTag} metardu-metardu-app:latest`)
  }
  process.exit(1)
}
console.log('=== Deploy complete: guard passed, rollback tag captured, smoke green ===')
if (rollbackTag) console.log(`Rollback available as metardu-metardu-app:${rollbackTag}`)
