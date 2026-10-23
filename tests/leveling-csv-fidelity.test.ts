import { interpretCSV } from '@/lib/parsers/csvSurveyInterpreter'
import { runLevelingWorkflow } from '@/lib/workflows/workflowEngine'
import type { LevelingResult } from '@/lib/engine/types'

test('turning-point foresight and backsight remain together in their source row', () => {
  const parsed = interpretCSV('Station,BS,IS,FS\nBM,1.5,,\nTP,0.75,,1.25\nCLOSE,,,0.8')
  expect(parsed.ok).toBe(true)
  if (!parsed.dataset) throw new Error('Leveling dataset is missing')
  const observations = parsed.dataset.observations
  expect(observations[1]).toMatchObject({ station: 'TP', leveling: { bs: 0.75, fs: 1.25 } })
  const result = runLevelingWorkflow({ openingRL: 100, readings: observations.map(row => ({ station: row.station,
    ...row.leveling })) })
  expect(result.success).toBe(true)
  expect(result.validation.checks.find(check => check.name === 'Arithmetic Check')?.passed).toBe(true)
  expect((result.results as LevelingResult).readings.at(-1)?.reducedLevel).toBeCloseTo(100.2, 12)
})

test('lowercase sight columns preserve real zero readings', () => {
  const parsed = interpretCSV('station,bs,is,fs\nBM,0,,\nCLOSE,,,0')
  expect(parsed.ok).toBe(true)
  expect(parsed.dataset?.observations).toMatchObject([{ type: 'BS', value1: 0, leveling: { bs: 0 } },
    { type: 'FS', value1: 0, leveling: { fs: 0 } }])
})

test.each(['1.2junk', 'Infinity', '', ' '])('malformed or missing sight %j cannot become a zero reading', sight => {
  const parsed = interpretCSV(`Station,BS,FS\nBM,${sight},\nCLOSE,,1.5`)
  expect(parsed.ok).toBe(false)
  expect(parsed.dataset).toBeUndefined()
})

test('a leveling station name is required rather than replaced by a generated point', () => {
  expect(interpretCSV('Station,BS,FS\n,1.5,\nCLOSE,,1.5').ok).toBe(false)
})

test('duplicate sight headers refuse ambiguous data rather than picking the last cell', () => {
  expect(interpretCSV('Station,BS,bs,FS\nBM,1.5,2.5,\nCLOSE,,,1.5').ok).toBe(false)
})
