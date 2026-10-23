import { runLevelingWorkflow, type LevelingWorkflowData } from '@/lib/workflows/workflowEngine'
import { riseAndFall, type LevelingInput } from '@/lib/engine/leveling'
import { levelingSolved } from '@/lib/engine/solution/wrappers/leveling'
import { getLevelingClosureStatus } from '@/lib/compute/levelingRunner'
import type { LevelingResult } from '@/lib/engine/types'

const observations = [{ station: 'BM', bs: 1.5 }, { station: 'CLOSE', fs: 1.496 }]
const input: LevelingInput = { openingRL: 100, readings: observations, method: 'rise_and_fall' }

test.each([[1.496, '0.0040 m'], [1.504, '-0.0040 m']])('worked final result retains millimetre closure for FS %s', (fs, expected) => {
  const declared: LevelingInput = { ...input, closingRL: 100, distanceKm: 1,
    readings: [{ station: 'BM', bs: 1.5 }, { station: 'CLOSE', fs: Number(fs) }] }
  const solved = levelingSolved(declared, riseAndFall(declared))
  expect(solved.solution.result.find(item => item.label === 'Misclosure')?.value).toBe(expected)
})

test('the worked explanation never invents a one-kilometre given or failed closure with unknown length', () => {
  const declared = { ...input, closingRL: 100 }
  const solved = levelingSolved(declared, riseAndFall(declared))
  expect(solved.solution.given.find(item => item.label === 'Distance (K)')?.value).toMatch(/unknown/i)
  expect(JSON.stringify(solved)).not.toMatch(/K = 1 km|Distance \(K\) = 1 km/)
  expect(solved.solution.check?.some(check => check.label === 'Misclosure within allowable')).toBe(false)
  expect(JSON.stringify(solved)).toMatch(/not assessed/i)
})

test('a closed calculation retains the actual numeric closure while distance remains unknown', () => {
  const status = getLevelingClosureStatus(riseAndFall({ ...input, closingRL: 100 }))
  expect(status).toMatchObject({ status: 'unknown', allowableMm: null })
  expect(status.misclosureMm).toBeCloseTo(4, 8)
})

test.each([{}, { closingRL: 100 }])('workflow reduction without complete closure evidence %j is not globally accepted', extra => {
  const result = runLevelingWorkflow({ openingRL: 100, readings: observations, ...extra })
  expect(result.success).toBe(true)
  expect(result.validation.passed).toBe(false)
  expect(result.validation.checks.find(check => check.name === 'Closing Error')).toMatchObject({ assessed: false, passed: false })
  expect(result.warnings.join(' ')).toMatch(/not assessed/i)
})

test.each([0, -100])('workflow retains a known %s benchmark and uses supplied distance', openingRL => {
  const data: LevelingWorkflowData & { distanceKm: number } = { openingRL, closingRL: openingRL, readings: observations, distanceKm: 1 }
  const result = runLevelingWorkflow(data)
  const closure = result.validation.checks.find(check => check.name === 'Closing Error')
  expect(result.success).toBe(true)
  expect(closure).toMatchObject({ assessed: true, passed: true })
  expect(closure?.value).toBeCloseTo(4, 8)
  expect((result.results as LevelingResult).allowableMisclosure).toBeCloseTo(0.01, 12)
  const arithmetic = result.validation.checks.find(check => check.name === 'Arithmetic Check')
  expect(arithmetic?.value).toBeCloseTo(0, 12)
})

test.each([0, -1, Infinity, NaN])('explicit invalid workflow length %s does not silently fall back', distanceKm => {
  const result = runLevelingWorkflow({ ...input, distanceKm } as LevelingWorkflowData)
  expect(result.success).toBe(false)
  expect(result.results).toBeNull()
})
