import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import Page from './page'
import { FieldbookCaptureImport } from '@/components/fieldbook/FieldbookCaptureImport'
import { FieldbookProjectPanel } from '@/components/fieldbook/FieldbookProjectPanel'
import { LevelingBook } from '@/components/fieldbook/LevelingBook'
import { TraverseBook } from '@/components/fieldbook/TraverseBook'
import { MobileFieldbookShell } from '@/components/fieldbook/MobileFieldbookShell'
import { persistWorkingBook } from '@/lib/offline/saveWorkingBook'
import { saveFieldbookOffline } from '@/lib/offline/fieldbooks'
import { createCaptureDraftData, type SourceImport } from '@/lib/fieldbook/captureDraft'
import { fieldbookTransferSchema } from '@/lib/fieldbook/transfer'
import { useAutoSave } from '@/hooks/useAutoSave'
import { listBookEdits, sendBookEdits } from '@/lib/offline/bookEdits'
import { syncPendingOperations } from '@/lib/offline/syncQueue'

const mockPdf = { setFontSize: jest.fn(), text: jest.fn(), addPage: jest.fn(), output: jest.fn(() => new Blob(['pdf'])) }
const mockPdfTable = jest.fn<void, [unknown, { body: unknown }]>()
jest.mock('jspdf', () => ({ __esModule: true, default: jest.fn(() => mockPdf) }))
jest.mock('jspdf-autotable', () => ({ __esModule: true, default: (doc: unknown, options: { body: unknown }): void => { mockPdfTable(doc, options) } }))

const actor='11111111-1111-4111-8111-111111111111', project='22222222-2222-4222-8222-222222222222'
const mockQuery={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),order:jest.fn().mockResolvedValue({data:[],error:null})}
const mockClient={auth:{getSession:jest.fn().mockResolvedValue({data:{session:{user:{id:actor}}}})},from:jest.fn(()=>mockQuery)}
const mockReadScopes: { table: string; owner?: string }[] = []
jest.mock('@/lib/api-client/client',()=>({createClient:(options?: {expectedUserId?: string})=>({...mockClient,from:(table:string)=>{mockReadScopes.push({table,owner:options?.expectedUserId});return mockQuery}})}))
jest.mock('@/lib/i18n/LanguageContext',()=>({useLanguage:()=>({t:(key:string)=>key})}))
jest.mock('@/lib/analytics/events',()=>({trackFieldbookSave:jest.fn()}))
const mockResetFailureDelay = jest.fn()
jest.mock('@/hooks/useAutoSave',()=>({useAutoSave:jest.fn(()=>({resetFailureDelay:mockResetFailureDelay}))}))
const mockNotify=jest.fn()
jest.mock('@/hooks/useNotifications',()=>({useNotifications:()=>({notify:mockNotify})}))
jest.mock('@/lib/offline/fieldbooks',()=>({getOfflineFieldbooks:jest.fn().mockResolvedValue([]),saveFieldbookOffline:jest.fn().mockResolvedValue(undefined)}))
jest.mock('@/lib/offline/saveWorkingBook',()=>({persistWorkingBook:jest.fn(async (_actor: string, _record: unknown, _origin: unknown, _online: boolean, id?: string) => ({requestId: id ?? crypto.randomUUID(), pending:false}))}))
jest.mock('@/lib/offline/bookEdits',()=>({listBookEdits:jest.fn(async()=>[]),readBookEdit:jest.fn(),sendBookEdit:jest.fn(),sendBookEdits:jest.fn(),exportBookEditRecords:jest.fn(async()=>[])}))
jest.mock('@/lib/fieldbook/openWorkingBook',()=>({prepareWorkingBook:jest.fn(async (_actor: string, _project: string, entry: unknown) => ({book:entry,origin:{kind:'unknown'}}))}))
jest.mock('@/lib/offline/syncQueue',()=>({isOnline:()=>true,getPendingOperations:jest.fn().mockResolvedValue([]),setupOnlineListener:()=>()=>{},syncPendingOperations:jest.fn()}))
jest.mock('@/components/fieldbook/FieldbookCaptureImport',()=>({FieldbookCaptureImport:jest.fn(()=>null)}))
jest.mock('@/components/fieldbook/FieldbookArchiveRecovery',()=>({FieldbookArchiveRecovery:()=>null}))
jest.mock('@/components/fieldbook/FieldbookProjectPanel',()=>({FieldbookProjectPanel:jest.fn((p:ComponentProps<typeof FieldbookProjectPanel>)=><input aria-label="Book name" value={p.name} onChange={e=>p.onNameChange(e.target.value)}/>)}))
jest.mock('@/components/fieldbook/LevelingBook',()=>({LevelingBook:jest.fn(()=>null)}))
jest.mock('@/components/fieldbook/TraverseBook',()=>({TraverseBook:jest.fn(()=>null)}))
jest.mock('@/components/fieldbook/ControlBook',()=>({ControlBook:()=>null}))
jest.mock('@/components/fieldbook/MobileFieldbookShell',()=>({MobileFieldbookShell:jest.fn(()=>null)}))
jest.mock('@/components/fieldbook/InstrumentStreamBar',()=>({InstrumentStreamBar:()=>null}))
jest.mock('@/components/fieldbook/FieldbookAuditDrawer',()=>({FieldbookAuditDrawer:()=>null}))
jest.mock('@/components/survey/GNSSRoverConnection',()=>({GNSSRoverConnection:()=>null}))
jest.mock('@/components/survey/NTRIPClientPanel',()=>({NTRIPClientPanel:()=>null}))
jest.mock('@/components/survey/GNSSQualityReport',()=>({GNSSQualityReport:()=>null}))

function last<T>(values:T[]):T { const value=values.at(-1);if(value===undefined)throw new Error('Expected a recorded call');return value }
const capture=()=>last(jest.mocked(FieldbookCaptureImport).mock.calls)[0]
const workspace=()=>last(jest.mocked(FieldbookProjectPanel).mock.calls)[0]
const level=()=>last(jest.mocked(LevelingBook).mock.calls)[0]
const traverse=()=>last(jest.mocked(TraverseBook).mock.calls)[0]
const data=createCaptureDraftData('leveling',[{batchId:'33333333-3333-4333-8333-333333333333',observationId:actor,projectId:project,clientId:'device',inputHash:'a'.repeat(64),capturedBy:null,projectReference:null,
  raw:{surveyType:'leveling',station:'BM',rawForm:{bs:'0.000',is:'',fs:''}}}],{actorId:actor,reviewedAt:'2026-10-21T08:00:00.000Z',requestHash:'b'.repeat(64),bearingEncoding:'uninterpreted'})
const book={id:'44444444-4444-4444-8444-444444444444',user_id:actor,project_id:project,name:'Source draft',type:'leveling' as const,data}
beforeEach(()=>{jest.clearAllMocks();mockReadScopes.length=0;HTMLElement.prototype.scrollTo=jest.fn();window.history.replaceState({},'',`/fieldbook?project=${project}`);jest.mocked(saveFieldbookOffline).mockResolvedValue(undefined)})
async function openPage(){render(<Page/>);await waitFor(()=>expect(FieldbookCaptureImport).toHaveBeenCalled())}
test('project and saved-book reads retain the checked account precondition', async () => {
  await openPage()
  await waitFor(() => expect(mockReadScopes.some(item => item.table === 'fieldbooks')).toBe(true))
  expect(mockReadScopes.filter(item => item.table === 'fieldbooks' || item.table === 'projects').every(item => item.owner === actor)).toBe(true)
})
test('the actual Sync action delegates one bounded batch and reports work deferred on the device', async () => {
  await openPage()
  jest.mocked(syncPendingOperations).mockResolvedValueOnce({ synced: 0, failed: 0, conflicts: 0 })
  jest.mocked(listBookEdits).mockResolvedValueOnce([{ edit: { requestId: book.id, projectId: project, bookId: book.id, type: book.type, name: book.name, data: {}, basis: { kind: 'new' } }, result: null }])
  jest.mocked(sendBookEdits).mockResolvedValueOnce({ synced: 20, failed: 0, deferred: 5, attempted: 20 })
  fireEvent.click(screen.getByRole('button', { name: 'field.syncOffline' }))
  await waitFor(() => expect(workspace().status).toMatch(/5 operation/))
  expect(sendBookEdits).toHaveBeenCalledWith(actor, project, [book.id])
})

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
  expect(last(jest.mocked(persistWorkingBook).mock.calls)[1]).toMatchObject({id:book.id,data:{sourceImport:data.sourceImport,distanceKm:''}})
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
  expect(persistWorkingBook).not.toHaveBeenCalled()
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
  expect(persistWorkingBook).not.toHaveBeenCalled()
  act(()=>level().setLevelRows(previous=>previous.map(row=>({...row,retainedExtension:{marker:'original metadata'}}))))
  expect(last(jest.mocked(useAutoSave).mock.calls)[0].enabled).toBe(false)
  act(()=>level().setOpeningRL('0'))
  expect(last(jest.mocked(useAutoSave).mock.calls)[0].enabled).toBe(true)
})

test('preserving an untouched workspace before opening a saved book does not create an empty saved copy', async () => {
  await openPage()
  await act(async () => { expect(await workspace().onSave()).toBe(true) })
  expect(persistWorkingBook).not.toHaveBeenCalled()
})

test('opening a retained book adopts a read-only editor snapshot without acknowledging delivery', async () => {
  await openPage()
  const before = last(jest.mocked(useAutoSave).mock.calls)[0].readSnapshotKey
  await act(async () => { await workspace().onOpen(book) })
  expect(last(jest.mocked(useAutoSave).mock.calls)[0].readSnapshotKey).toBe((before ?? 0) + 1)
  expect(persistWorkingBook).not.toHaveBeenCalled()
  expect(level().levelRows[0].bs).toBe('0.000')
})
test('repeated saves reuse one retained request, while later edits explicitly descend from it', async () => {
  await openPage()
  fireEvent.change(screen.getByLabelText('Book name'), { target: { value: 'Retained run' } })
  await act(async () => { await workspace().onSave() })
  const first = last(jest.mocked(persistWorkingBook).mock.calls)
  const requestId = workspace().savedBooks[0].localEditId
  expect(first[2]).toEqual({ kind: 'new' })
  await act(async () => { await workspace().onSave() })
  expect(last(jest.mocked(persistWorkingBook).mock.calls)[4]).toBe(requestId)
  fireEvent.change(screen.getByLabelText('Book name'), { target: { value: 'Later edit' } })
  await act(async () => { await workspace().onSave() })
  expect(last(jest.mocked(persistWorkingBook).mock.calls)[2]).toEqual({ kind: 'operation', requestId })
  expect(last(jest.mocked(persistWorkingBook).mock.calls)[1]).toMatchObject({ id: first[1].id, name: 'Later edit' })
})

test('only a durable fieldbook save resumes automatic saving after a device-storage failure', async () => {
  await openPage()
  fireEvent.change(screen.getByLabelText('Book name'), { target: { value: 'Keep the raw run' } })
  jest.mocked(persistWorkingBook).mockRejectedValueOnce(new DOMException('Device storage full', 'QuotaExceededError'))
  await act(async () => { expect(await workspace().onSave()).toBe(false) })
  expect(mockResetFailureDelay).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Book name')).toHaveValue('Keep the raw run')
  await act(async () => { expect(await workspace().onSave()).toBe(true) })
  expect(mockResetFailureDelay).toHaveBeenCalledTimes(1)
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

test('the active leveling QC uses the book engine and clears measured closure when the closing RL is removed', async () => {
  await openPage()
  act(() => {
    level().setOpeningRL('100')
    level().setClosingRL('100')
    level().setDistanceKm('0.125')
    level().setLevelRows([
      { id: 'bm', station: 'BM', bs: '1.5000', is: '', fs: '', remarks: '' },
      { id: 'tp', station: 'TP1', bs: '', is: '', fs: '1.2500', remarks: '' },
    ])
  })
  const checks = screen.getByRole('region', { name: 'Active book checks' })
  expect(within(checks).getByText('0.2500 m')).toBeInTheDocument()
  act(() => { level().setClosingRL('') })
  expect(within(checks).getByText('Closing RL required')).toBeInTheDocument()
  expect(within(checks).queryByText(/0\.000[0]?\s?m/)).not.toBeInTheDocument()
})

test('invalid raw leveling strings remain saved but cannot produce calculated PDF or a passing arithmetic check', async () => {
  await openPage()
  act(() => {
    level().setOpeningRL('100')
    level().setLevelRows([{ id: 'bad', station: 'BM', bs: '1.5junk', is: '', fs: '', remarks: 'retain original' }])
  })
  expect(level().computed.ok).toBe(false)
  await act(async () => { await expect(workspace().onExportPDF()).rejects.toThrow(/setup/) })
  await act(async () => { await workspace().onSave() })
  expect(last(jest.mocked(persistWorkingBook).mock.calls)[1]).toMatchObject({ data: { rows: [{ bs: '1.5junk', remarks: 'retain original' }] } })
})

test.each([
  { bs: '', is: '', fs: '' },
  { bs: '', is: '', fs: '1.2500' },
  { bs: '1.5', is: 'invalid', fs: '' },
  { bs: '1.5', is: '', fs: 'Infinity' },
])('incomplete leveling reading %j cannot produce a numerical assessment', async reading => {
  await openPage()
  act(() => {
    level().setOpeningRL('100')
    level().setLevelRows([{ id: 'incomplete', station: 'BM', remarks: '', ...reading }])
  })
  expect(level().computed.ok).toBe(false)
})

test('closed traverse QC measures the declared link target without an inferred cadastral acceptance', async () => {
  await openPage()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'traverse.title' })) })
  await waitFor(() => expect(TraverseBook).toHaveBeenCalled())
  act(() => {
    traverse().setTravMode('link')
    traverse().setStartStation('A')
    traverse().setStartE('0'); traverse().setStartN('0')
    traverse().setCloseE('100'); traverse().setCloseN('100')
    traverse().setTravRows(previous => [
      { ...previous[0], station: 'B', bearing: '90', slopeDist: '100' },
      { ...previous[0], id: 'second', station: 'C', bearing: '0', slopeDist: '99' },
    ])
  })
  const checks = screen.getByRole('region', { name: 'Active book checks' })
  expect(within(checks).getByText('Linear misclosure').parentElement).toHaveTextContent('1.0000 m')
  expect(within(checks).getByText('1:199')).toBeInTheDocument()
  expect(screen.queryByText(/statutory tolerance|statutory threshold|PASSES.*cadastral/)).not.toBeInTheDocument()
  expect(mockNotify).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'qc_fail' }))
  act(() => { traverse().setTravMode('open') })
  expect(within(checks).getByText(/Open traverse.*closure not assessed/)).toBeInTheDocument()
  expect(within(checks).queryByText('1.0000 m')).not.toBeInTheDocument()
})

test('the actual mobile shell displays the same active-book assessment and never substitutes zero for missing closure', async () => {
  const ActualMobile = jest.requireActual<typeof import('@/components/fieldbook/MobileFieldbookShell')>('@/components/fieldbook/MobileFieldbookShell').MobileFieldbookShell
  const original = window.matchMedia
  window.matchMedia = jest.fn(query => ({ matches: query === '(max-width: 1023px)', media: query, onchange: null,
    addListener: jest.fn(), removeListener: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn() }))
  jest.mocked(MobileFieldbookShell).mockImplementation(props => <ActualMobile {...props} />)
  try {
    await openPage()
    const mobile = () => last(jest.mocked(MobileFieldbookShell).mock.calls)[0]
    await act(async () => { await capture().onPrepare(); await capture().onCreated({ ...book, data: { ...data, openingRL: '100', rows: [
      { id: 'bm', station: 'BM', bs: '1.5', is: '', fs: '', remarks: '' },
      { id: 'tp', station: 'TP1', bs: '', is: '', fs: '1.25', remarks: '' },
    ] } }) })
    const checks = screen.getByRole('region', { name: 'Active book checks' })
    expect(within(checks).getByText('Closing RL required')).toBeInTheDocument()
    expect(within(checks).queryByText(/0\.000[0]?\s?m/)).not.toBeInTheDocument()
    act(() => { mobile().setClosingRL('100') })
    expect(within(checks).getByText('0.2500 m')).toBeInTheDocument()
  } finally {
    window.matchMedia = original
    jest.mocked(MobileFieldbookShell).mockImplementation(() => <></>)
  }
})

test('saving a numerically consistent closed traverse does not compare scalar misclosure with an invented delta vector', async () => {
  await openPage()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'traverse.title' })) })
  await waitFor(() => expect(TraverseBook).toHaveBeenCalled())
  act(() => {
    traverse().setTravMode('closed'); traverse().setStartStation('A')
    traverse().setStartE('0'); traverse().setStartN('0')
    traverse().setTravRows(previous => [
      { ...previous[0], station: 'B', bearing: '90', slopeDist: '100' },
      { ...previous[0], id: 'second', station: 'C', bearing: '0', slopeDist: '100' },
      { ...previous[0], id: 'third', station: 'D', bearing: '225', slopeDist: '141.4213562373095' },
    ])
  })
  mockNotify.mockClear()
  await act(async () => { await workspace().onSave() })
  expect(mockNotify).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'qc_fail' }))
})
