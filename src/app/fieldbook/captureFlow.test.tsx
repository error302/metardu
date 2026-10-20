import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import Page from './page'
import { FieldbookCaptureImport } from '@/components/fieldbook/FieldbookCaptureImport'
import { FieldbookProjectPanel } from '@/components/fieldbook/FieldbookProjectPanel'
import { LevelingBook } from '@/components/fieldbook/LevelingBook'
import { persistFieldbook } from '@/lib/offline/saveFieldbook'
import { saveFieldbookOffline } from '@/lib/offline/fieldbooks'
import { createCaptureDraftData, type SourceImport } from '@/lib/fieldbook/captureDraft'
import { fieldbookTransferSchema } from '@/lib/fieldbook/transfer'
import { useAutoSave } from '@/hooks/useAutoSave'

const mockPdf = { setFontSize: jest.fn(), text: jest.fn(), addPage: jest.fn(), output: jest.fn(() => new Blob(['pdf'])) }
const mockPdfTable = jest.fn<void, [unknown, { body: unknown }]>()
jest.mock('jspdf', () => ({ __esModule: true, default: jest.fn(() => mockPdf) }))
jest.mock('jspdf-autotable', () => ({ __esModule: true, default: (doc: unknown, options: { body: unknown }): void => { mockPdfTable(doc, options) } }))

const actor='11111111-1111-4111-8111-111111111111', project='22222222-2222-4222-8222-222222222222'
const mockQuery={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),order:jest.fn().mockResolvedValue({data:[],error:null})}
const mockClient={auth:{getSession:jest.fn().mockResolvedValue({data:{session:{user:{id:actor}}}})},from:jest.fn(()=>mockQuery)}
jest.mock('@/lib/api-client/client',()=>({createClient:()=>mockClient}))
jest.mock('@/lib/i18n/LanguageContext',()=>({useLanguage:()=>({t:(key:string)=>key})}))
jest.mock('@/lib/analytics/events',()=>({trackFieldbookSave:jest.fn()}))
jest.mock('@/hooks/useAutoSave',()=>({useAutoSave:jest.fn()}))
const mockNotify=jest.fn()
jest.mock('@/hooks/useNotifications',()=>({useNotifications:()=>({notify:mockNotify})}))
jest.mock('@/lib/offline/fieldbooks',()=>({getOfflineFieldbooks:jest.fn().mockResolvedValue([]),saveFieldbookOffline:jest.fn().mockResolvedValue(undefined)}))
jest.mock('@/lib/offline/saveFieldbook',()=>({persistFieldbook:jest.fn().mockResolvedValue({pending:false})}))
jest.mock('@/lib/offline/syncQueue',()=>({isOnline:()=>true,getPendingOperations:jest.fn().mockResolvedValue([]),setupOnlineListener:()=>()=>{},syncPendingOperations:jest.fn()}))
jest.mock('@/components/fieldbook/FieldbookCaptureImport',()=>({FieldbookCaptureImport:jest.fn(()=>null)}))
jest.mock('@/components/fieldbook/FieldbookProjectPanel',()=>({FieldbookProjectPanel:jest.fn((p:ComponentProps<typeof FieldbookProjectPanel>)=><input aria-label="Book name" value={p.name} onChange={e=>p.onNameChange(e.target.value)}/>)}))
jest.mock('@/components/fieldbook/LevelingBook',()=>({LevelingBook:jest.fn(()=>null)}))
jest.mock('@/components/fieldbook/TraverseBook',()=>({TraverseBook:()=>null}))
jest.mock('@/components/fieldbook/ControlBook',()=>({ControlBook:()=>null}))
jest.mock('@/components/fieldbook/MobileFieldbookShell',()=>({MobileFieldbookShell:()=>null}))
jest.mock('@/components/fieldbook/InstrumentStreamBar',()=>({InstrumentStreamBar:()=>null}))
jest.mock('@/components/fieldbook/InstantClosureFeedback',()=>({InstantClosureFeedback:()=>null}))
jest.mock('@/components/fieldbook/FieldbookAuditDrawer',()=>({FieldbookAuditDrawer:()=>null}))
jest.mock('@/components/survey/GNSSRoverConnection',()=>({GNSSRoverConnection:()=>null}))
jest.mock('@/components/survey/NTRIPClientPanel',()=>({NTRIPClientPanel:()=>null}))
jest.mock('@/components/survey/GNSSQualityReport',()=>({GNSSQualityReport:()=>null}))
jest.mock('@/components/survey/RealTimeQCPanel',()=>({RealTimeQCPanel:()=>null}))

function last<T>(values:T[]):T { const value=values.at(-1);if(value===undefined)throw new Error('Expected a recorded call');return value }
const capture=()=>last(jest.mocked(FieldbookCaptureImport).mock.calls)[0]
const workspace=()=>last(jest.mocked(FieldbookProjectPanel).mock.calls)[0]
const level=()=>last(jest.mocked(LevelingBook).mock.calls)[0]
const data=createCaptureDraftData('leveling',[{batchId:'33333333-3333-4333-8333-333333333333',observationId:actor,projectId:project,clientId:'device',inputHash:'a'.repeat(64),capturedBy:null,projectReference:null,
  raw:{surveyType:'leveling',station:'BM',rawForm:{bs:'0.000',is:'',fs:''}}}],{actorId:actor,reviewedAt:'2026-10-21T08:00:00.000Z',requestHash:'b'.repeat(64),bearingEncoding:'uninterpreted'})
const book={id:'44444444-4444-4444-8444-444444444444',user_id:actor,project_id:project,name:'Source draft',type:'leveling' as const,data}
beforeEach(()=>{jest.clearAllMocks();HTMLElement.prototype.scrollTo=jest.fn();window.history.replaceState({},'',`/fieldbook?project=${project}`);jest.mocked(saveFieldbookOffline).mockResolvedValue(undefined)})
async function openPage(){render(<Page/>);await waitFor(()=>expect(FieldbookCaptureImport).toHaveBeenCalled())}

test('source snapshots survive draft opening and later editable book saves; blank length never becomes 1 km',async()=>{
  await openPage()
  await act(async()=>{expect(await capture().onPrepare()).toBe(true)})
  await act(async()=>{expect(await capture().onCreated(book)).toBe(true)})
  expect(screen.getByLabelText('Book name')).toHaveValue('Source draft')
  act(()=>{level().setOpeningRL('100');level().setClosingRL('100')})
  expect(level().computed.ok).toBe(true)
  const result=level().computed
  if(result.ok){expect(result.calc.allowableMisclosure).toBeUndefined();expect(result.calc.isAcceptable).toBe(false)}
  await act(async()=>{await workspace().onSave()})
  expect(last(jest.mocked(persistFieldbook).mock.calls)[1]).toMatchObject({id:book.id,data:{sourceImport:data.sourceImport,distanceKm:''}})
})

test('a confirmed new draft does not replace edits made during creation',async()=>{
  await openPage();await act(async()=>{await capture().onPrepare()})
  fireEvent.change(screen.getByLabelText('Book name'),{target:{value:'Edits during request'}})
  await act(async()=>{expect(await capture().onCreated(book)).toBe(false)})
  expect(screen.getByLabelText('Book name')).toHaveValue('Edits during request')
  expect(workspace().savedBooks.some(item=>item.id===book.id)).toBe(true)
})

test('switching projects while creation is pending cannot open or cache a foreign draft',async()=>{
  await openPage();await act(async()=>{await capture().onPrepare()})
  const receive=capture().onCreated
  await act(async()=>{await workspace().onProjectChange('55555555-5555-4555-8555-555555555555')})
  await act(async()=>{expect(await receive(book)).toBe(false)})
  expect(saveFieldbookOffline).not.toHaveBeenCalled()
  expect(workspace().projectId).not.toBe(project)
})

test('malformed or cross-project portable sources are rejected before saving or replacing the open book',async()=>{
  await openPage();fireEvent.change(screen.getByLabelText('Book name'),{target:{value:'Keep my work'}})
  const references=data.sourceImport as SourceImport
  const portable=fieldbookTransferSchema.parse({version:1,type:'leveling',name:'Wrong project',data:{...data,sourceImport:{...references,sources:[{...references.sources[0],projectId:'55555555-5555-4555-8555-555555555555'}]}}})
  const importBook=workspace().onImport
  if(!importBook)throw new Error('Expected book import to be available')
  await act(async()=>{await expect(importBook(portable)).rejects.toThrow(/different project/)})
  expect(persistFieldbook).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Book name')).toHaveValue('Keep my work')
})

test('failure to cache an acknowledged server draft keeps the current book open',async()=>{
  await openPage();await act(async()=>{await capture().onPrepare()})
  jest.mocked(saveFieldbookOffline).mockRejectedValueOnce(new Error('device full'))
  await act(async()=>{expect(await capture().onCreated(book)).toBe(false)})
  expect(screen.getByLabelText('Book name')).not.toHaveValue('Source draft')
  expect(workspace().status).toMatch(/saved on the server/)
})

test('retrying a transient session check preserves current edits and recovers project access',async()=>{
  mockClient.auth.getSession.mockResolvedValueOnce({data:{session:null},error:new Error('timeout')} as never)
  render(<Page/>);fireEvent.change(screen.getByLabelText('Book name'),{target:{value:'Keep through timeout'}})
  await waitFor(()=>expect(workspace().projectsError).toMatch(/could not be confirmed/))
  const retry=workspace().onRetryProjects
  if(!retry)throw new Error('Expected project retry to be available')
  await act(async()=>{retry()})
  await waitFor(()=>expect(FieldbookCaptureImport).toHaveBeenCalled())
  expect(screen.getByLabelText('Book name')).toHaveValue('Keep through timeout')
})

test('opening an untouched project does not autosave an empty book; real setup edits enable saving',async()=>{
  await openPage()
  expect(last(jest.mocked(useAutoSave).mock.calls)[0].enabled).toBe(false)
  await act(async()=>{expect(await capture().onPrepare()).toBe(true)})
  expect(persistFieldbook).not.toHaveBeenCalled()
  act(()=>level().setLevelRows(previous=>previous.map(row=>({...row,retainedExtension:{marker:'original metadata'}}))))
  expect(last(jest.mocked(useAutoSave).mock.calls)[0].enabled).toBe(false)
  act(()=>level().setOpeningRL('0'))
  expect(last(jest.mocked(useAutoSave).mock.calls)[0].enabled).toBe(true)
})

test.each(['rise_and_fall', 'height_of_collimation'] as const)('leveling PDF retains real BM station, raw precision and edited remarks (%s)', async method => {
  await openPage()
  act(() => {
    level().setOpeningRL('100.0000')
    level().setLevelMethod(method)
    level().setLevelRows([
      { id: 'bm', station: 'BM', bs: '1.5000', is: '', fs: '', remarks: 'Synthetic benchmark note' },
      { id: 'tp', station: 'TP1', bs: '', is: '', fs: '1.2500', remarks: 'Edited review note' },
    ])
  })
  URL.createObjectURL = jest.fn(() => 'blob:synthetic-report')
  URL.revokeObjectURL = jest.fn()
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  try {
    await act(async () => { await workspace().onExportPDF() })
    expect(mockPdfTable.mock.calls[0][1].body).toEqual([
      ['BM', '1.5000', '', '', '', '', 100, 'Synthetic benchmark note'],
      ['TP1', '', '', '1.2500', method === 'rise_and_fall' ? 0.25 : '', method === 'rise_and_fall' ? 0 : '', 100.25, 'Edited review note'],
    ])
  } finally { click.mockRestore() }
})
