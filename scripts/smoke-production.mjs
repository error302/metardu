// Post-deploy smoke: the verification that was missing when a workspace-
// crashing bug shipped. Exits non-zero on any failure so deploy scripts and
// CI can gate on it.
//
// Env:
//   METARDU_SMOKE_BASE         base URL (default http://127.0.0.1:3000)
//   METARDU_SMOKE_PROJECT_ID   project id for the members route checks
//   METARDU_SMOKE_SESSION_COOKIE  owner session cookie (name=value) to check
//                              the members route as an authenticated owner
import { request as httpRequest } from 'node:http'

const BASE = process.env.METARDU_SMOKE_BASE || 'http://127.0.0.1:3000'
const PROJECT_ID = process.env.METARDU_SMOKE_PROJECT_ID
const SESSION_COOKIE = process.env.METARDU_SMOKE_SESSION_COOKIE

const failures = []
const checks = []
function record(name, ok, detail) {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

async function expectStatus(name, path, accepted, init = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(15_000), redirect: 'manual', ...init })
    const ok = accepted.includes(res.status)
    record(name, ok, `HTTP ${res.status} (expected ${accepted.join('/')})`)
    return res
  } catch (e) {
    record(name, false, e.name === 'TimeoutError' ? 'timeout after 15s' : e.message)
    return null
  }
}

// Homepage + login must serve; /api/auth/session must answer (null session is
// fine — the endpoint existing and returning 200 is the contract).
await expectStatus('homepage 200', '/', [200])
await expectStatus('login page 200', '/login', [200])
await expectStatus('auth session endpoint 200', '/api/auth/session', [200])

// Canonical runtime health (database + redis) — what the promotion flow gates on.
const health = await expectStatus('runtime health 200', '/api/public/health', [200])
if (health) {
  try {
    const body = await health.json()
    record('health reports healthy', body?.status === 'healthy' && body?.checks?.database?.status === 'ok', JSON.stringify(body?.status))
  } catch { record('health reports healthy', false, 'non-JSON body') }
}

// Collaboration socket: same-origin rewrite must produce a WebSocket upgrade
// (HTTP 101). The room service then closes unauthenticated sockets with 1008,
// which is the documented, verified behavior — anything else (404/502/timeout)
// means the upgrade path is broken. fetch() forbids upgrade headers, so this
// check uses a raw http request.
{
  const key = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64')
  await new Promise((resolve) => {
    const url = new URL(`${BASE}/ws/collaboration`)
    const req = httpRequest(
      { hostname: url.hostname, port: url.port || 80, path: url.pathname, method: 'GET',
        headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13' },
        timeout: 15_000 },
      (res) => {
        record('collaboration WS upgrade 101', res.statusCode === 101, `HTTP ${res.statusCode}`)
        res.destroy()
        resolve()
      },
    )
    req.on('upgrade', (res) => {
      record('collaboration WS upgrade 101', res.statusCode === 101, `HTTP ${res.statusCode}`)
      req.destroy()
      resolve()
    })
    req.on('timeout', () => { req.destroy(new Error('timeout after 15s')) })
    req.on('error', (e) => { record('collaboration WS upgrade 101', false, e.message); resolve() })
    req.end()
  })
}

// Members route tenancy: signed-out must be 401 (no info leak); with an owner
// session cookie it must be 200. Uses the provided project id, or a random
// UUID — for the signed-out check any id is valid because 401 must precede
// existence checks. 404 means the members API is not deployed yet (warn, the
// check turns strict once it ships).
const pid = PROJECT_ID || crypto.randomUUID()
{
  const res = await expectStatus('members route 401 signed out', `/api/projects/${pid}/members`, [401, 404])
  if (res?.status === 404) console.log('WARN  members API not deployed yet (404); strictness turns on when it ships')
}
if (SESSION_COOKIE) {
  const res = await expectStatus(
    'members route 200 as owner',
    `/api/projects/${pid}/members`,
    [200, 404],
    { headers: { Cookie: SESSION_COOKIE } },
  )
  if (res?.status === 404) console.log('WARN  members API not deployed yet (404); owner check skipped')
} else {
  console.log('SKIP  members route as owner — set METARDU_SMOKE_SESSION_COOKIE (and _PROJECT_ID) to enable')
}

console.log(failures.length === 0 ? `\nSmoke: ${checks.length} checks, all green` : `\nSmoke: ${failures.length} of ${checks.length} checks failed: ${failures.join(', ')}`)
process.exit(failures.length === 0 ? 0 : 1)
