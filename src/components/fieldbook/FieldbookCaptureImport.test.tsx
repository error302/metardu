import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FieldbookCaptureImport } from './FieldbookCaptureImport'
import { createCaptureBook, inspectCaptureSource, listCaptureSources } from '@/lib/fieldbook/captureBookClient'
jest.mock('@/lib/fieldbook/captureBookClient',()=>({createCaptureBook:jest.fn(),inspectCaptureSource:jest.fn(),listCaptureSources:jest.fn()}))
jest.mock('next-auth/react',()=>({useSession:()=>({status:'authenticated',data:{user:{id:'11111111-1111-4111-8111-111111111111'}}})}))
const actor='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222',batch='33333333-3333-4333-8333-333333333333'
const props={actorId:actor,projectId:project,onPrepare:jest.fn(),onCreated:jest.fn()}
beforeEach(()=>{
  jest.resetAllMocks();props.onPrepare.mockResolvedValue(true);props.onCreated.mockResolvedValue(true)
  jest.mocked(listCaptureSources).mockResolvedValue({items:[{batchId:batch,clientId:'device',station:'TP1',mode:'leveling',capturedBy:null,recordedAt:'2026-10-21T08:00:00.000Z'}],next:null})
  jest.mocked(inspectCaptureSource).mockResolvedValue({batchId:batch,observationId:actor,projectId:project,clientId:'device',inputHash:'a'.repeat(64),capturedBy:null,projectReference:null,raw:{id:'device',station:'TP1',surveyType:'leveling',rawForm:{bs:'0.000'}}})
  jest.mocked(createCaptureBook).mockResolvedValue({id:actor,user_id:actor,project_id:project,name:'Draft',type:'leveling',data:{}})
})
async function selectSource(){
  fireEvent.click(screen.getByRole('button',{name:'Review captured readings'}))
  fireEvent.click(await screen.findByRole('button',{name:'Inspect TP1'}))
  fireEvent.click(await screen.findByRole('button',{name:'Use this source'}))
  fireEvent.click(screen.getByRole('checkbox',{name:/selected source order/i}))
}
test('draft creation requires source inspection, acknowledgement and preservation of the open book',async()=>{
  render(<FieldbookCaptureImport {...props}/>)
  expect(listCaptureSources).not.toHaveBeenCalled()
  await selectSource()
  fireEvent.click(screen.getByRole('button',{name:'Create source-linked draft'}))
  await waitFor(()=>expect(props.onCreated).toHaveBeenCalledTimes(1))
  expect(props.onPrepare).toHaveBeenCalledTimes(1)
  expect(createCaptureBook).toHaveBeenCalledWith(actor,expect.objectContaining({projectId:project,type:'leveling',acknowledgement:'create-draft-from-raw-v1',sources:[{batchId:batch,inputHash:'a'.repeat(64)}]}))
})
test('failed saving of the current book stops creation without losing selected sources',async()=>{
  props.onPrepare.mockResolvedValue(false)
  render(<FieldbookCaptureImport {...props}/>);await selectSource()
  fireEvent.click(screen.getByRole('button',{name:'Create source-linked draft'}))
  expect(await screen.findByRole('alert')).toHaveTextContent(/current book/i)
  expect(createCaptureBook).not.toHaveBeenCalled()
})
test('an unconfirmed creation retries the exact same key and source selection',async()=>{
  jest.mocked(createCaptureBook).mockRejectedValueOnce(new Error('Creation unconfirmed'))
  render(<FieldbookCaptureImport {...props}/>);await selectSource()
  fireEvent.click(screen.getByRole('button',{name:'Create source-linked draft'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Creation unconfirmed')
  fireEvent.click(screen.getByRole('button',{name:'Retry draft creation'}))
  await waitFor(()=>expect(props.onCreated).toHaveBeenCalledTimes(1))
  expect(jest.mocked(createCaptureBook).mock.calls[1]).toEqual(jest.mocked(createCaptureBook).mock.calls[0])
})
test('a different signed-in account cannot open this reviewer’s source panel',()=>{
  render(<FieldbookCaptureImport {...props} actorId="other"/>)
  expect(screen.queryByRole('button',{name:'Review captured readings'})).not.toBeInTheDocument()
  expect(listCaptureSources).not.toHaveBeenCalled()
})
test('a definitive validation rejection lets the reviewer correct the selected book type',async()=>{
  jest.mocked(createCaptureBook).mockRejectedValueOnce(Object.assign(new Error('Incompatible capture mode'),{status:422}))
  render(<FieldbookCaptureImport {...props}/>);await selectSource()
  fireEvent.click(screen.getByRole('button',{name:'Create source-linked draft'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Incompatible capture mode')
  expect(screen.getByRole('combobox',{name:'Book type'})).toBeEnabled()
})
