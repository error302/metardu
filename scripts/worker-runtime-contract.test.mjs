import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { WORKER_FILES, WORKER_PACKAGES, WORKER_TASKS, workerContractFailures, verifyWorkerRuntime } from './worker-runtime-contract.mjs'

const expected = Object.fromEntries([
  'main.py', 'gnss_processor.py', 'rtklib_baseline.py', 'pointcloud_processor.py',
  'osm_feature_server.py', 'osm_streaming.py', 'osm_overpass.py', 'spatial_cache.py', 'requirements.txt', 'compute-contract.json',
].map(name => [name, 'a'.repeat(64)]))
const current = () => ({
  files: { ...expected },
  packages: Object.fromEntries(['numpy', 'fastapi', 'pydantic', 'laspy', 'lazrs', 'pyproj'].map(name => [name, '1.0'])),
  declaredTasks: ['bowditch_traverse', 'levelling_closure', 'gnss_baseline_process', 'gnss_process_rinex', 'gnss_process_rinex_multi', 'parse_lidar'],
  rtklibAvailable: true, parseError: false,
})
const container = () => ({ Id: 'b'.repeat(64), Name: '/metardu-worker', Image: `sha256:${'c'.repeat(64)}`, Status: 'running', Health: 'healthy', Labels: { 'com.docker.compose.project': 'metardu', 'com.docker.compose.service': 'metardu-worker' } })

test('current worker artifact contract is explicit and accepts all required artifacts', () => {
  assert.deepEqual(WORKER_FILES, Object.keys(expected))
  assert.deepEqual(WORKER_PACKAGES, Object.keys(current().packages))
  assert.deepEqual(WORKER_TASKS, current().declaredTasks)
  assert.deepEqual(workerContractFailures(current(), expected), [])
})

test('a healthy older worker fails for absent LiDAR and baseline artifacts', () => {
  const snapshot = current()
  snapshot.files['pointcloud_processor.py'] = null
  snapshot.files['rtklib_baseline.py'] = null
  snapshot.files['main.py'] = 'd'.repeat(64)
  snapshot.declaredTasks = snapshot.declaredTasks.filter(task => task !== 'parse_lidar')
  snapshot.packages.laspy = snapshot.packages.lazrs = snapshot.packages.pyproj = null
  const failures = workerContractFailures(snapshot, expected)
  for (const name of ['pointcloud_processor.py', 'rtklib_baseline.py', 'main.py', 'parse_lidar', 'laspy', 'lazrs', 'pyproj']) {
    assert.ok(failures.some(message => message.includes(name)), `Missing actionable failure for ${name}`)
  }
})

test('missing native executable, unparsable task declarations and damaged evidence fail closed', () => {
  for (const snapshot of [null, {}, { ...current(), rtklibAvailable: false }, { ...current(), parseError: true }, { ...current(), files: null }, { ...current(), packages: null }, { ...current(), declaredTasks: null }]) {
    assert.ok(workerContractFailures(snapshot, expected).length)
  }
})

test('runtime verifier inspects ownership then probes only the immutable owned worker ID', () => {
  const calls = []
  const snapshot = current()
  for (const name of WORKER_FILES) snapshot.files[name] = createHash('sha256').update(readFileSync(new URL(`../python_worker/${name}`, import.meta.url))).digest('hex')
  const report = verifyWorkerRuntime({ docker(args, options) {
    calls.push({ args, options })
    return JSON.stringify(calls.length === 1 ? container() : snapshot)
  } })
  assert.deepEqual(report.failures, [])
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0].args.slice(0, 3), ['inspect', '--type', 'container'])
  assert.equal(calls[0].args.at(-1), 'metardu-worker')
  assert.deepEqual(calls[1].args, ['exec', '-i', 'b'.repeat(64), 'python', '-B', '-'])
  assert.match(calls[1].options.input, /ast\.parse/)
  assert.doesNotMatch(calls[1].options.input, /import main|import spatial_cache|os\.environ|subprocess|urllib|write_text|write_bytes/)
})

test('foreign, stopped, unhealthy or ambiguous containers are refused before exec', () => {
  for (const invalid of [
    { ...container(), Name: '/another-worker' }, { ...container(), Id: 'worker-name' },
    { ...container(), Labels: {} }, { ...container(), Status: 'exited' },
    { ...container(), Health: 'unhealthy' }, { ...container(), Image: '' },
  ]) {
    let calls = 0
    assert.throws(() => verifyWorkerRuntime({ docker() { calls++; return JSON.stringify(invalid) } }), /owned healthy production worker/)
    assert.equal(calls, 1)
  }
})

test('malformed probe output cannot be treated as a passing release contract', () => {
  let calls = 0
  assert.throws(() => verifyWorkerRuntime({ docker() { return ++calls === 1 ? JSON.stringify(container()) : 'not-json' } }), /Worker contract probe returned invalid JSON/)
})
