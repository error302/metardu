/** @jest-environment jsdom */
import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import Page from '@/app/tools/control-point-verification/page'
const originalFetch=globalThis.fetch
afterEach(()=>{globalThis.fetch=originalFetch})
const project={id:'00000000-0000-4000-8000-000000000001',name:'Synthetic field project',horizontalCrs:'EPSG:21037',verticalDatum:'Synthetic BM'}
const mark={id:'00000000-0000-4000-8000-000000000002',name:'SYN-FIELD-CONTROL',easting:500000,northing:9800000,elevation:0,horizontal_crs:'EPSG:21037',vertical_datum:'Synthetic BM',basisHash:'a'.repeat(64),issue:null}
function response(body:unknown,status=200){const result=new Response(JSON.stringify(body),{status});Object.defineProperty(result,'ok',{value:status>=200&&status<300});return result}
async function chooseProject(){await screen.findByRole('option',{name:/Synthetic field project/});fireEvent.change(screen.getByRole('combobox',{name:'Owned project'}),{target:{value:project.id}});await screen.findByRole('option',{name:mark.name});fireEvent.change(screen.getByRole('combobox',{name:'Saved control basis'}),{target:{value:mark.id}})}
test('failed saves retain complete observations and retry the same identity without sending a typed published basis',async()=>{
 const writes:Record<string,unknown>[]=[]
 globalThis.fetch=jest.fn(async(input:RequestInfo|URL,options?:RequestInit)=>{
  if(String(input).includes('/api/beacons/projects?'))return response({data:{projects:[project],nextCursor:null}})
  if(options?.method==='POST'){writes.push(JSON.parse(String(options.body)) as Record<string,unknown>);return writes.length===1?response({error:'Synthetic save failure'},503):response({data:{id:mark.id}},201)}
  return String(input).includes('options=true')?response({data:{marks:[mark]}}):response({data:{checks:[]}})
 })
 render(<Page/>);await chooseProject()
 expect(screen.getByText(/Saved E 500000 m.*H 0 m/)).toBeVisible()
 fireEvent.change(screen.getByLabelText('Check method'),{target:{value:'total_station'}})
 fireEvent.change(screen.getByLabelText('Observed condition'),{target:{value:'good'}})
 for(const [label,value]of [['Observation time (local)','2026-10-08T08:00'],['Field record / evidence reference','Synthetic field book 1'],['Instrument identification','Synthetic TS'],['Criterion source / job specification','Synthetic job spec'],['Observed easting (m)','500000.003'],['Observed northing (m)','9800000.004'],['Horizontal comparison criterion (m)','0.01'],['Observed height (m)','0']])fireEvent.change(screen.getByLabelText(label),{target:{value}})
 fireEvent.change(screen.getByLabelText('Vertical comparison criterion (m)'),{target:{value:'0.002'}})
 fireEvent.click(screen.getByRole('button',{name:'Save field check'}));await screen.findByText('Synthetic save failure')
 expect(screen.getByLabelText('Observed height (m)')).toHaveValue(0)
 fireEvent.click(screen.getByRole('button',{name:'Save field check'}));await screen.findByText(/Field check saved/)
 expect(writes).toHaveLength(2);expect(writes[1].requestId).toBe(writes[0].requestId)
 expect(writes[0]).toMatchObject({pointId:mark.id,projectId:project.id,basisHash:mark.basisHash,measuredElevation:0,horizontalTolerance:0.01,verticalTolerance:0.002})
 expect(writes[0]).not.toHaveProperty('published_easting')
})
test('a zero residual is visible in retained history and load failures are visible',async()=>{
 globalThis.fetch=jest.fn(async(input:RequestInfo|URL)=>{
  if(String(input).includes('/api/beacons/projects?'))return response({data:{projects:[project],nextCursor:null}})
  if(String(input).includes('options=true'))return response({data:{marks:[mark]}})
  return response({data:{checks:[{id:mark.id,observed_at:'2026-10-08T08:00:00Z',source_snapshot:{point_name:mark.name},reference_snapshot:{},observation:{method:'total_station',condition:'good',evidenceReference:'Synthetic book',horizontalTolerance:0.01,toleranceReference:'Synthetic criteria'},result:{status:'within_declared_tolerance',horizontalDisplacement:0,deltaH:null}}]}})
 })
 render(<Page/>);await chooseProject();await screen.findByText(/Horizontal difference: 0.000 mm/)
 globalThis.fetch=jest.fn(async()=>response({error:'Synthetic read failure'},503))
 fireEvent.change(screen.getByLabelText('Register'),{target:{value:'beacon'}})
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Synthetic read failure'))
})
