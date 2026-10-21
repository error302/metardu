import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// These are artifact checks, not computation or field-accuracy acceptance.
export const WORKER_FILES = Object.freeze([
  'main.py', 'gnss_processor.py', 'rtklib_baseline.py', 'pointcloud_processor.py',
  'osm_feature_server.py', 'osm_streaming.py', 'osm_overpass.py', 'spatial_cache.py', 'requirements.txt',
])
export const WORKER_PACKAGES = Object.freeze(['numpy', 'fastapi', 'pydantic', 'laspy', 'lazrs', 'pyproj'])
export const WORKER_TASKS = Object.freeze([
  'bowditch_traverse', 'levelling_closure', 'gnss_baseline_process',
  'gnss_process_rinex', 'gnss_process_rinex_multi', 'parse_lidar',
])

function probeSource() {
  // Stdlib only: never import the live application, open its cache, read its
  // secret, invoke RTKLIB or send compute requests. -B prevents bytecode writes.
  return `import ast, hashlib, importlib.metadata, json, pathlib, shutil
root = pathlib.Path('/app').resolve()
files, main_source = {}, None
for name in ${JSON.stringify(WORKER_FILES)}:
    path = root / name
    try:
        data = path.read_bytes() if path.resolve().parent == root and path.is_file() else None
        files[name] = hashlib.sha256(data).hexdigest() if data is not None else None
        if name == 'main.py':
            main_source = data
    except OSError:
        files[name] = None
packages = {}
for name in ${JSON.stringify(WORKER_PACKAGES)}:
    try:
        packages[name] = importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        packages[name] = None
tasks, parse_error = [], False
try:
    if main_source is None:
        raise ValueError('Missing main source')
    tree = ast.parse(main_source)
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for decorator in node.decorator_list:
                if isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Name) and decorator.func.id == 'register_task' and len(decorator.args) == 1 and isinstance(decorator.args[0], ast.Constant) and isinstance(decorator.args[0].value, str):
                    tasks.append(decorator.args[0].value)
except (ValueError, SyntaxError):
    parse_error = True
print(json.dumps({'files': files, 'packages': packages, 'declaredTasks': tasks, 'rtklibAvailable': shutil.which('rnx2rtkp') is not None, 'parseError': parse_error}))
`
}

export function workerContractFailures(snapshot, expected) {
  const failures = []
  for (const name of WORKER_FILES) {
    const actual = snapshot?.files?.[name]
    if (typeof actual !== 'string' || !/^[a-f0-9]{64}$/.test(actual)) failures.push(`Missing or unreadable worker artifact: ${name}`)
    else if (actual !== expected[name]) failures.push(`Worker artifact differs from this checkout: ${name}`)
  }
  for (const name of WORKER_PACKAGES) {
    if (typeof snapshot?.packages?.[name] !== 'string' || !snapshot.packages[name].trim()) failures.push(`Missing worker distribution metadata: ${name}`)
  }
  if (snapshot?.parseError !== false) failures.push('Worker task declarations could not be parsed.')
  for (const task of WORKER_TASKS) {
    if (!Array.isArray(snapshot?.declaredTasks) || !snapshot.declaredTasks.includes(task)) failures.push(`Missing worker task declaration: ${task}`)
  }
  if (snapshot?.rtklibAvailable !== true) failures.push('RTKLIB rnx2rtkp executable is unavailable.')
  return failures
}

export function verifyWorkerRuntime({ docker }) {
  const expected = Object.fromEntries(WORKER_FILES.map(name => [name,
    createHash('sha256').update(readFileSync(new URL(`../python_worker/${name}`, import.meta.url))).digest('hex'),
  ]))
  // Limit inspection to identity, ownership and state. Never serialize Env.
  const format = '{"Id":{{json .Id}},"Name":{{json .Name}},"Image":{{json .Image}},"Labels":{{json .Config.Labels}},"Status":{{json .State.Status}},"Health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}}'
  const container = JSON.parse(docker(['inspect', '--type', 'container', '--format', format, 'metardu-worker']))
  if (container?.Name !== '/metardu-worker' || !/^[a-f0-9]{64}$/.test(container?.Id ?? '') ||
      !/^sha256:[a-f0-9]{64}$/.test(container?.Image ?? '') || container?.Status !== 'running' || container?.Health !== 'healthy' ||
      container?.Labels?.['com.docker.compose.project'] !== 'metardu' ||
      container?.Labels?.['com.docker.compose.service'] !== 'metardu-worker') {
    throw new Error('An owned healthy production worker is required before the read-only artifact probe.')
  }
  const output = docker(['exec', '-i', container.Id, 'python', '-B', '-'], { input: probeSource() })
  let snapshot
  try { snapshot = JSON.parse(output) } catch { throw new Error('Worker contract probe returned invalid JSON; no acceptance evidence was obtained.') }
  return { containerId: container.Id, imageId: container.Image, sourceRoot: fileURLToPath(new URL('../python_worker/', import.meta.url)), snapshot, failures: workerContractFailures(snapshot, expected) }
}
