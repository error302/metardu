/** Pure source fixtures: no database, account, network, drawing storage or service mutation. */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ts = require('typescript')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const previousTs = require.extensions['.ts']
const unregister = require('tsconfig-paths').register({ baseUrl: root, paths: { '@/*': ['src/*'] } })
let bankingSectionDraftDxf, horizontalCurveDraftDxf
try {
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true }, fileName: filename,
  }).outputText, filename)
  ;({ bankingSectionDraftDxf, horizontalCurveDraftDxf } = require('../src/lib/engineering/roadQuickComputeDxf.ts'))
} finally {
  if (previousTs) require.extensions['.ts'] = previousTs
  else delete require.extensions['.ts']
  unregister()
}

const output = resolve(root, '.cache/road-quick-compute')
mkdirSync(output, { recursive: true })
const hash = (content) => createHash('sha256').update(content).digest('hex')
const curve = { radius: 100, deflectionAngleDeg: 60, deflectionAngleMin: 0, deflectionAngleSec: 0, ipChainage: 500 }
const banking = { designSpeed: 80, radius: 300, numLanes: 1, laneWidth: 3.5, initialCrossfall: -0.025, providedSuperelevation: 0.1,
  criteria: { reference: 'Synthetic criteria rev 1', lateralFriction: 0.14, maximumSuperelevation: 0.08, maximumRelativeGradient: 0.005 } }
const fixtures = {
  'left.dxf': horizontalCurveDraftDxf(curve, 20, 'left'),
  'right.dxf': horizontalCurveDraftDxf(curve, 20, 'right'),
  'bank-fail.dxf': bankingSectionDraftDxf(banking),
  'bank-meet.dxf': bankingSectionDraftDxf({ ...banking, providedSuperelevation: 0.06 }),
}
const sources = ['scripts/verify-road-quick-dxf.mjs', 'src/lib/engineering/roadQuickComputeDxf.ts', 'src/lib/computations/roadDesignEngine.ts', 'src/lib/computations/roadSafetyCriteria.ts']
for (const [name, content] of Object.entries(fixtures)) writeFileSync(resolve(output, name), content)
const manifest = { proof: 'synthetic local calculator drafts only', curve, banking,
  source: Object.fromEntries(sources.map(path => [path, hash(readFileSync(resolve(root, path)))])),
  files: Object.fromEntries(Object.entries(fixtures).map(([name, content]) => [name, hash(content)])) }
writeFileSync(resolve(output, 'dxf-fixtures.json'), JSON.stringify(manifest, null, 2))
console.log(JSON.stringify({ output, fixtureCount: Object.keys(fixtures).length }))
