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
  expect(result.corrections.every(c=>c.atmosphericPPM===0 && c.scaleFactor===1)).toBe(true)
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
