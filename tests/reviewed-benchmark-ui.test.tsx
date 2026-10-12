/** @jest-environment jsdom */
import { act,fireEvent,render,screen,waitFor } from '@testing-library/react'
import Search from '@/components/beacons/ReviewedBenchmarkSearch'
let mockStatus='authenticated'
jest.mock('next-auth/react',()=>({useSession:()=>({status:mockStatus})}))
const originalFetch=globalThis.fetch
afterEach(()=>{globalThis.fetch=originalFetch;mockStatus='authenticated'})
const response=(value:unknown,status=200)=>{const result=new Response(JSON.stringify(value),{status});Object.defineProperty(result,'ok',{value:status>=200&&status<300});return result}
const mark=(index:number)=>({id:`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`,name:`SYN-UI-REFERENCE-${index}`,country:'Synthetic country',region:null,type:'BM',easting:500000,northing:9800000,elevation:index===1?0:null,horizontalCrs:'EPSG:21037',verticalDatum:index===1?'Synthetic BM':null,latitude:-1.5,longitude:36.8,source:'Synthetic publisher',sourceReference:'Synthetic publication, test only',reviewedAt:'2026-10-08T08:00:00Z',catalogueStatus:'reviewed',fieldVerified:false})
const result=(records:ReturnType<typeof mark>[],total=records.length,offset=0)=>({benchmarks:records,total,offset,limit:25,fromCache:false,navigationOnly:false})
test('actual country metadata, original grid, zero height and paged results appear without a field-verification claim',async()=>{
 const writes:Record<string,unknown>[]=[]
 globalThis.fetch=jest.fn(async(_url:RequestInfo|URL,options?:RequestInit)=>{
  if(!options?.body)return response({countries:['Synthetic country']})
  const input=JSON.parse(String(options.body)) as Record<string,unknown>;writes.push(input)
  return response(input.offset===25?result([mark(26)],26,25):result(Array.from({length:25},(_,index)=>mark(index+1)),26))
 })
 render(<Search/>);await screen.findByRole('option',{name:'Synthetic country'})
 fireEvent.click(screen.getByRole('button',{name:'Search reviewed references'}))
 await screen.findByText('Published height 0.000 m · vertical datum Synthetic BM')
 expect(screen.getAllByText('E 500000 m · N 9800000 m · EPSG:21037')).toHaveLength(25)
 expect(screen.getByText(/Showing 25 of 26.*Field verification remains required/)).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'Load more references'}));await screen.findByText('SYN-UI-REFERENCE-26 · BM')
 expect(writes[1].offset).toBe(25)
 expect(screen.queryByRole('button',{name:'Load more references'})).not.toBeInTheDocument()
})
test('empty and failed searches have visible states with no substitute official records',async()=>{
 let fail=false
 globalThis.fetch=jest.fn(async(_url:RequestInfo|URL,options?:RequestInit)=>!options?.body?response({countries:[]}):fail?response({error:'Synthetic catalogue unavailable'},503):response(result([])))
 render(<Search/>);fireEvent.click(screen.getByRole('button',{name:'Search reviewed references'}));await screen.findByText(/No reviewed reference marks match/)
 fail=true;fireEvent.click(screen.getByRole('button',{name:'Search reviewed references'}));await screen.findByRole('alert')
 expect(screen.getByRole('alert')).toHaveTextContent('Synthetic catalogue unavailable')
 expect(screen.queryByText('Nairobi Primary BM')).not.toBeInTheDocument()
})
test('changing search inputs discards an older in-flight result',async()=>{
 let resolveOld:((value:Response)=>void)|undefined,calls=0
 globalThis.fetch=jest.fn(async(_url:RequestInfo|URL,options?:RequestInit)=>{
  if(!options?.body)return response({countries:[]})
  calls++;if(calls===1)return await new Promise<Response>(resolve=>{resolveOld=resolve})
  return response(result([mark(2)]))
 })
 render(<Search/>);fireEvent.click(screen.getByRole('button',{name:'Search reviewed references'}));await waitFor(()=>expect(calls).toBe(1))
 fireEvent.change(screen.getByLabelText('Reference name'),{target:{value:'new query'}})
 fireEvent.click(screen.getByRole('button',{name:'Search reviewed references'}));await screen.findByText('SYN-UI-REFERENCE-2 · BM')
 await act(async()=>{resolveOld?.(response(result([mark(1)])))})
 expect(screen.queryByText('SYN-UI-REFERENCE-1 · BM')).not.toBeInTheDocument()
})
test('signed-out users receive an actionable sign-in invitation',()=>{
 mockStatus='unauthenticated';globalThis.fetch=jest.fn()
 render(<Search/>);expect(screen.getByRole('link',{name:'Sign in to METARDU'})).toHaveAttribute('href','/login?next=%2Fonline')
 expect(globalThis.fetch).not.toHaveBeenCalled()
})
