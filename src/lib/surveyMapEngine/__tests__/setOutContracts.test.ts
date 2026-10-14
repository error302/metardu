/**
 * Project setting-out contracts (blueprint §11, §9.5, §19, §27).
 *
 * The workflow these pin did not exist: the pile/column grid panel was mounted
 * without a project, its design and every stake record lived in React state,
 * and there was no verticality capture at all. These contracts ensure setting
 * out is a project activity whose shots are judged and whose evidence is
 * append-only.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { evaluateSetoutShot, evaluateVerticality } from '../../engineering/verticality'
import { createSetoutCaptureSnapshot } from '@/lib/field/setoutCapture'

const repoRoot = join(__dirname, '..', '..', '..', '..')
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8')
const syntheticCrs = 'EPSG:21037'

describe('set-out schema stores design, register and verticality', () => {
  const migration = read('src/lib/db/migrations/075_setout_and_verticality.sql')

  test('definitions, points, observations and verticality all persist', () => {
    for (const table of ['setout_definitions', 'setout_points', 'setout_observations', 'verticality_readings']) {
      expect(migration).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`))
    }
  })

  test('an as-staked shot stores design vs observed with a judged verdict', () => {
    expect(migration).toMatch(/design_easting\s+NUMERIC/)
    expect(migration).toMatch(/observed_easting\s+NUMERIC/)
    expect(migration).toMatch(/horizontal_error\s+NUMERIC/)
    expect(migration).toMatch(/tolerance_version\s+VARCHAR/)
    expect(migration).toMatch(/threshold_h\s+NUMERIC/)
    expect(migration).toMatch(/result\s+VARCHAR\(10\) NOT NULL DEFAULT 'INFO'/)
    // Operator / instrument provenance (blueprint §14.2).
    expect(migration).toMatch(/instrument\s+VARCHAR/)
    expect(migration).toMatch(/operator_name\s+VARCHAR/)
  })

  test('stake records and plumb readings are append-only evidence', () => {
    expect(migration).toMatch(/as-staked observations are append-only/)
    expect(migration).toMatch(/BEFORE UPDATE OR DELETE ON setout_observations/)
    expect(migration).toMatch(/BEFORE UPDATE OR DELETE ON verticality_readings/)
    // A re-stake after a FAIL must be possible — history is kept.
    expect(migration).not.toMatch(/idx_setout_observations_current[\s\S]*UNIQUE/)
  })

  test('verticality keeps the computed offset and tilt ratio', () => {
    expect(migration).toMatch(/offset_h\s+NUMERIC/)
    expect(migration).toMatch(/tilt_ratio\s+VARCHAR/)
    expect(migration).toMatch(/tolerance_ratio\s+VARCHAR/)
  })
})

describe('the set-out route is project-scoped and CRS-guarded', () => {
  const route = read('src/app/api/project/[id]/setout/route.ts')

  test('design coordinates are computed server-side and stored', () => {
    expect(route).toMatch(/generatePileGrid\(/)
    expect(route).toMatch(/INSERT INTO setout_definitions/)
    expect(route).toMatch(/INSERT INTO setout_points/)
    // Each save is a new revision so old shots keep their design.
    expect(route).toMatch(/COALESCE\(MAX\(revision\), 0\) \+ 1 AS revision/)
  })

  test('an as-staked shot is judged and written with evidence', () => {
    const capture=createSetoutCaptureSnapshot({projectId:'synthetic-project',definitionId:'synthetic-definition',pointId:'synthetic-point',pointLabel:'SYN-A',designRevision:1,
      horizontalCrs:syntheticCrs,definitionCrs:syntheticCrs,deviceCrs:syntheticCrs,verticalDatum:'Synthetic BM',capturedAt:'2026-10-10T00:00:00Z',
      design:{easting:500000,northing:9800000,rl:100},capturedDesign:{easting:500000,northing:9800000,rl:100},
      observed:{easting:500000.003,northing:9800000.004,rl:100},reportedAccuracyM:null,profile:null})
    expect(capture.assessment.horizontalErrorM).toBeCloseTo(0.005,7)
    expect(capture.assessment.dZ).toBe(0)
    expect(capture.designRevision).toBe(1)
    expect(capture.horizontalCrsEvidence).toBe('device_and_definition')
  })

  test('a plumb reading is judged and stored', () => {
    expect(route).toMatch(/evaluateVerticality\(/)
    expect(route).toMatch(/INSERT INTO verticality_readings/)
  })

  test('no set-out without a declared project CRS', () => {
    expect(route).toMatch(/CRS_UNDECLARED/)
  })

  test('the register reads the latest shot per point', () => {
    expect(route).toMatch(/DISTINCT ON \(o\.definition_id, o\.label\)/)
    expect(route).toMatch(/setout_observations/)
    expect(route).toMatch(/p\.revision = \(\s*SELECT MAX\(current\.revision\)/)
  })

  test('field shots use the shared engineering judgement engine', () => {
    const field = read('src/app/field/setout/page.tsx')
    expect(/evaluateSetoutCaptureEvidence\(/.test(field)).toBe(true)
    expect(field).not.toMatch(/function judge\(/)
    expect(/no acceptance threshold is inferred/.test(field)).toBe(true)
  })
})

describe('the grid panel is bound to the project', () => {
  const panel = read('src/components/engineering/PileGridPanel.tsx')
  const renderer = read('src/app/project/[id]/engineering/steps/renderStepContent.tsx')

  test('the panel takes a projectId and stores the design through the API', () => {
    expect(/PileGridPanel\(\{ projectId/.test(panel)).toBe(true)
    expect(/api\/project\/\$\{encodeURIComponent\(projectId\)\}\/setout/.test(panel)).toBe(true)
    expect(/action:\s*'save_definition'/.test(panel)).toBe(true)
  })

  test('the engineering step passes the project through', () => {
    expect(/<PileGridPanel[^>]*projectId=\{project\.id\}/.test(renderer)).toBe(true)
  })
})

describe('judgements never overstate certainty', () => {
  test('a shot on target passes and a coarse fix cannot certify it', () => {
    const design = { designE: 100, designN: 200, designZ: 10 }
    expect(evaluateSetoutShot({ ...design, observedE: 100, observedN: 200, observedZ: 10 }).result).toBe('PASS')
    expect(
      evaluateSetoutShot(
        { ...design, observedE: 100.001, observedN: 200 },
        { horizontalM: 0.01, verticalM: 0.005, accuracyM: 0.5 }
      ).result
    ).toBe('INFO')
  })

  test('a column outside the tilt ratio fails even when the offset is small', () => {
    const result = evaluateVerticality({ baseE: 0, baseN: 0, topE: 0.02, topN: 0, heightM: 3 })
    expect(result.offsetM).toBeCloseTo(0.02, 6)
    expect(result.result).toBe('FAIL')
  })
})
