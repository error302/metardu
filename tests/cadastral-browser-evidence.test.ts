/** @jest-environment node */
import { prepareCadastralInput } from '@/lib/survey/cadastralInput'
import { fieldToFinish } from '@/lib/survey/field-to-finish'

const project = { boundary_data: { startControl: { name: 'A1', easting: 500000, northing: 9900000 } }, survey_type: 'cadastral', utm_zone: 37 }
const entries = [
  ['A1', 'A2', 0, 80], ['A2', 'A10', 90, 100], ['A10', 'A3', 180, 80], ['A3', 'A1', 270, 100],
].map(([station,target,bearing,distance]) => ({station,raw_data:{target,bearing,distance,distanceType:'grid'}}))

test('the browser grid-distance rectangle produces 8000 m² without an extra EDM reduction', async () => {
  const result = await fieldToFinish(prepareCadastralInput(project, entries, []))
  expect(result.area.squareMetres).toBeCloseTo(8000, 5)
  expect(result.instantFeedback.perimeter).toBeCloseTo(360, 8)
  expect(result.adjustedPoints.map(p=>p.name)).toEqual(['A1','A2','A10','A3','A1'])
  expect(result.corrections).toEqual([])
  expect(result.adjustedPoints[1]).toMatchObject({ originalEasting: 500000, originalNorthing: 9900080 })
})

test('closure reports the original leg residual rather than a forced adjusted polygon', async () => {
  const changed = entries.map((entry, index) => index === 3 ? { ...entry, raw_data: { ...entry.raw_data, distance: 99.99 } } : entry)
  const result = await fieldToFinish(prepareCadastralInput(project, changed, []))
  expect(result.status).not.toBe('failed')
  expect(result.closureCheck.closingErrorE).toBeCloseTo(result.instantFeedback.closingErrorE, 10)
  expect(Math.abs(result.closureCheck.closingErrorE)).toBeCloseTo(0.01, 7)
  expect(result.adjustedPoints.at(-1)?.originalEasting).toBeCloseTo(500000.01, 6)
})

test('the calculation library cannot invent an oriented bearing or reduce a slope using defaults', async () => {
  const input = prepareCadastralInput(project, entries, [])
  for (const observation of [{ ...input.observations[0], bearing: undefined }, { ...input.observations[0], distanceType: 'slope' as const }]) {
    const result = await fieldToFinish({ ...input, observations: [observation, ...input.observations.slice(1)] })
    expect(result.status).toBe('failed')
    expect(result.adjustedPoints).toEqual([])
    expect(result.errors.join(' ')).toMatch(/grid|oriented|reduction/i)
  }
})
test('missing control is rejected instead of placing the survey at a sample location', () => {
  expect(()=>prepareCadastralInput({},entries,[])).toThrow(/control/i)
})
test('coordinates alone cannot manufacture measured closure', () => {
  expect(()=>prepareCadastralInput(project,[],[{name:'A1',easting:500000,northing:9900000}])).toThrow(/observations/i)
})
test.each(['', 'bad', '90junk', '45°60\'00"', '361'])('rejects invalid bearing %s without silently skipping the leg', bearing=>{
  expect(()=>prepareCadastralInput(project,[{...entries[0],raw_data:{...entries[0].raw_data,bearing}},...entries.slice(1)],[])).toThrow(/bearing/i)
})
test('DMS seconds are preserved and 0° is a valid bearing', () => {
  const input=prepareCadastralInput(project,[entries[0],{...entries[1],raw_data:{...entries[1].raw_data,bearing:'90°00\'30"'}},...entries.slice(2)],[])
  expect(input.observations[0].bearing).toBe(0)
  expect(input.observations[1].bearing).toBeCloseTo(90+30/3600,10)
})
test('disconnected target stations are rejected',()=>{
  expect(()=>prepareCadastralInput(project,[{...entries[0],raw_data:{...entries[0].raw_data,target:'WRONG'}},...entries.slice(1)],[])).toThrow(/connect/i)
})
test('no LR number, surveyor name or licence is invented',()=>{
  const input=prepareCadastralInput(project,entries,[])
  expect(input.lrNumber).toBeUndefined()
  expect(input.surveyorName).toBeUndefined()
  expect(input.surveyorLicense).toBeUndefined()
})

test('unknown or slope distance provenance requires explicit reduction',()=>{
  for(const distanceType of [undefined,'slope']) expect(()=>prepareCadastralInput(project,[{...entries[0],raw_data:{...entries[0].raw_data,distanceType}},...entries.slice(1)],[])).toThrow(/grid/i)
})
test('deed-plan geometry does not contain a duplicate zero-length closing leg',async()=>{
 const result=await fieldToFinish(prepareCadastralInput(project,entries,[]))
 expect(result.deedPlanData?.boundaryLegs).toHaveLength(4)
 expect(result.deedPlanData?.boundaryLegs.every(leg=>leg.distance>0)).toBe(true)
})
