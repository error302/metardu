/* eslint-disable no-restricted-syntax -- Explicit synthetic CRS fixtures, never production defaults. */
import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {TextDecoder,TextEncoder} from 'node:util'
import {webcrypto} from 'node:crypto'
import ImportPage from './page'
import {fromReferenceSystemRow} from '@/lib/spatial/projectReferenceSystem'
import type {PointImportRequest} from '@/lib/import/pointImport'

const project='11111111-1111-4111-8111-111111111111'
const query={select:jest.fn(),eq:jest.fn(),order:jest.fn(),range:jest.fn()}
jest.mock('@/lib/api-client/client',()=>({createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'owner'}}},error:null})},from:()=>query})}))
const originalFetch=global.fetch,decoder=Object.getOwnPropertyDescriptor(globalThis,'TextDecoder'),subtle=Object.getOwnPropertyDescriptor(crypto,'subtle')
const reference=fromReferenceSystemRow({horizontal_crs:'EPSG:32737',horizontal_name:'Synthetic WGS84',datum_name:'WGS84',units:'metres',zone:37,hemisphere:'S',distance_mode:'grid',coordinate_precision:3,vertical_datum:'Synthetic BM',vertical_reference:'local'})
beforeAll(()=>{
  Object.defineProperty(globalThis,'TextDecoder',{value:TextDecoder,configurable:true})
  Object.defineProperty(crypto,'subtle',{value:webcrypto.subtle,configurable:true})
})
afterAll(()=>{
  if(decoder)Object.defineProperty(globalThis,'TextDecoder',decoder);else Reflect.deleteProperty(globalThis,'TextDecoder')
  if(subtle)Object.defineProperty(crypto,'subtle',subtle);else Reflect.deleteProperty(crypto,'subtle')
})
beforeEach(()=>{
  query.select.mockReturnValue(query);query.eq.mockReturnValue(query);query.order.mockReturnValue(query)
  query.range.mockResolvedValue({data:[{id:project,name:'Synthetic road'}],error:null})
})
afterEach(()=>{global.fetch=originalFetch;jest.restoreAllMocks()})
const response=(data:unknown,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data}) as Response
const context=()=>response({data:{referenceSystem:reference,referenceHash:'a'.repeat(64),history:[]}})
async function chooseFile(text='id,easting,northing,elevation\nP1,500000,9850000,\nP2,500010,9850010,0') {
  const file=new File([text],'points.csv',{type:'text/csv'})
  Object.defineProperty(file,'arrayBuffer',{value:async()=>new TextEncoder().encode(text).buffer})
  fireEvent.change(screen.getByLabelText('Choose a controller text export'),{target:{files:[file]}})
  await screen.findByRole('heading',{name:'3. Review & save'})
}
async function ready(){
  await screen.findByRole('option',{name:'Synthetic road'})
  fireEvent.change(screen.getByLabelText('Destination project'),{target:{value:project}})
  await screen.findByText('EPSG:32737',{exact:true})
  await chooseFile()
  fireEvent.change(screen.getByLabelText('Source horizontal CRS'),{target:{value:'EPSG:32737'}})
  fireEvent.click(screen.getByLabelText(/Source heights use/))
  await waitFor(()=>expect(screen.getByRole('button',{name:'Save 2 selected points'})).toBeEnabled())
}
test('ambiguous transport outcomes retain the capture and retry the same request before reporting saved points',async()=>{
  const bodies:Record<string,unknown>[]=[]
  global.fetch=jest.fn(async(_url,options)=>{
    if(options?.method!=='POST')return context()
    const body=JSON.parse(options.body as string) as PointImportRequest;bodies.push(body)
    if(bodies.length===1)throw new Error('Lost connection after submission')
    return response({data:{requestId:body.requestId,batchId:body.requestId,sourceFileHash:body.sourceFileHash,inputHash:'b'.repeat(64),imported:2,
      pointIds:['22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'],replayed:true,fieldVerified:false}})
  })
  render(<ImportPage/>);await ready()
  fireEvent.click(screen.getByRole('button',{name:'Save 2 selected points'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Lost connection')
  expect(screen.queryByText('DATABASE RECEIPT CONFIRMED')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Destination project')).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'Retry / check this capture'}))
  expect(await screen.findByText('DATABASE RECEIPT CONFIRMED')).toBeInTheDocument()
  expect(bodies).toHaveLength(2);expect(bodies[1]).toEqual(bodies[0])
  expect(screen.getByText(/2 points already saved/)).toBeInTheDocument()
})
test('selection changes once per click, unknown heights remain visible, and missing project reference blocks save',async()=>{
  global.fetch=jest.fn(async()=>response({data:{referenceSystem:null,referenceHash:'a'.repeat(64),history:[]}}))
  render(<ImportPage/>);await screen.findByRole('option',{name:'Synthetic road'})
  fireEvent.change(screen.getByLabelText('Destination project'),{target:{value:project}})
  await chooseFile()
  expect(screen.getByText('Unknown',{exact:true})).toBeInTheDocument()
  const first=screen.getByLabelText('Include source record 1: P1')
  expect(first).toBeChecked();fireEvent.click(first);expect(first).not.toBeChecked()
  expect(screen.getByRole('button',{name:'Save 1 selected points'})).toBeDisabled()
  expect(screen.queryByText('DATABASE RECEIPT CONFIRMED')).not.toBeInTheDocument()
})
