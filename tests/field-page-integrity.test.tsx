import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import FieldPage from '@/app/field/page'
import type { FieldInstrumentReading } from '@/lib/field/fieldSession'
import * as toleranceEngine from '@/lib/survey/liveToleranceChecker'

let mockAccount = 'alice'
type QueryReply = { data: unknown[] | null; error: { message: string } | null }
let mockInsert = jest.fn<Promise<QueryReply>, [unknown]>()
let mockRead = jest.fn<Promise<QueryReply>, [string, string]>()
const mockRouter = { push: jest.fn(), replace: jest.fn() }
let mockAuthChange: (event: string, session: unknown) => void
let mockInstrumentProps: { onImportPoints: (points: FieldInstrumentReading[]) => void }
jest.mock('next-auth/react', () => ({ useSession: () => ({ status: 'authenticated', data: { user: { id: mockAccount } } }) }))
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }))
jest.mock('next/dynamic', () => ({ __esModule: true, default: () => (props: typeof mockInstrumentProps) => { mockInstrumentProps = props; return null } }))
jest.mock('@/components/fieldbook/FieldBookMobile', () => ({ FieldBookMobile: () => null }))
jest.mock('@/lib/i18n/LanguageContext', () => ({ useLanguage: () => ({ t: (key: string) => key }) }))
jest.mock('@/lib/api-client/client', () => ({ createClient: () => ({
  auth: {
    getSession: async () => ({ data: { session: { user: { id: mockAccount } } } }),
    onAuthStateChange: (callback: typeof mockAuthChange) => { mockAuthChange = callback; return { data: { subscription: { unsubscribe: jest.fn() } } } },
  },
  from: (table: string) => {
    let scope = ''
    const query = { select: () => query, eq: (_column: string, value: string) => { scope = value; return query }, order: () => mockRead(table, scope), insert: (rows: unknown) => mockInsert(rows) }
    return query
  },
}) }))
let container: HTMLDivElement, root: Root
beforeEach(() => {
  mockAccount = 'alice'
  mockInsert = jest.fn<Promise<QueryReply>, [unknown]>().mockResolvedValue({ data: null, error: null })
  mockRead = jest.fn<Promise<QueryReply>, [string, string]>(async (table: string) => ({ data: table === 'projects' ? [{ id: 'job-a', name: 'Job A' }, { id: 'job-b', name: 'Job B' }] : [], error: null }))
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.restoreAllMocks() })
async function render() { await act(async () => root.render(<FieldPage />)) }
async function change(selector: string, value: string) {
  const element = container.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector)
  if (!element) throw new Error(`Missing ${selector}`)
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set?.call(element, value)
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
}
async function click(text: string) {
  const button = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.trim() === text)
  if (!button) throw new Error(`Missing button ${text}`)
  await act(async () => button.click())
}
async function startPoint() {
  await render(); await change('select', 'job-a'); await click('Points')
  for (const [id, value] of [['name', 'P1'], ['easting', '500000.0001234567'], ['northing', '-100.125'], ['elevation', '-2.5']]) await change(`#field-point-${id}`, value)
}

test('a returned database error retains the point and displays the failure', async () => {
  await startPoint()
  mockInsert.mockResolvedValue({ data: null, error: { message: 'Project access denied' } })
  await click('field.savePoint')
  expect(container.querySelector<HTMLInputElement>('#field-point-name')?.value).toBe('P1')
  expect(container.textContent).toContain('Project access denied')
})
test('switching accounts removes the previous account projects and form immediately', async () => {
  await startPoint()
  mockRead.mockImplementation(() => new Promise(() => {}))
  mockAccount = 'bob'
  await act(async () => { mockAuthChange?.('SIGNED_IN', { user: { id: 'bob' } }); root.render(<FieldPage />) })
  expect(container.textContent).not.toContain('Job A')
  expect(container.querySelector<HTMLInputElement>('#field-point-name')?.value ?? '').toBe('')
})
test('a late point response from the previous project cannot replace current points', async () => {
  let resolveOld!: (result: QueryReply) => void
  mockRead.mockImplementation(async (table: string, scope: string) => {
    if (table === 'projects') return { data: [{ id: 'job-a', name: 'Job A' }, { id: 'job-b', name: 'Job B' }], error: null }
    if (scope === 'job-a') return new Promise(resolve => { resolveOld = resolve })
    return { data: [{ id: 'new', point_name: 'CURRENT POINT', name: 'CURRENT POINT', easting: 1, northing: 2 }], error: null }
  })
  await render(); await click('Points'); await change('select', 'job-a'); await change('select', 'job-b')
  await act(async () => resolveOld({ data: [{ id: 'old', point_name: 'OLD POINT', name: 'OLD POINT', easting: 4, northing: 5 }], error: null }))
  expect(container.textContent).toContain('CURRENT POINT')
  expect(container.textContent).not.toContain('OLD POINT')
})
test('a point save preserves exact signed coordinates and prevents duplicate submission', async () => {
  await startPoint()
  let resolveSave!: (result: QueryReply) => void
  mockInsert.mockImplementation(() => new Promise(resolve => { resolveSave = resolve }))
  const button = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'field.savePoint')
  if (!button) throw new Error('Missing point save action')
  await act(async () => { button.click(); button.click() })
  expect(mockInsert).toHaveBeenCalledTimes(1)
  expect(container.querySelector('select')).toBeDisabled()
  await act(async () => resolveSave({ data: null, error: null }))
  expect(mockInsert.mock.calls[0][0]).toMatchObject({ point_name: 'P1', easting: 500000.0001234567, northing: -100.125, elevation: -2.5, project_id: 'job-a' })
})
test('invalid numeric suffixes are not silently saved as valid coordinates', async () => {
  await startPoint(); await change('#field-point-easting', '500000oops'); await click('field.savePoint')
  expect(mockInsert).not.toHaveBeenCalled()
  expect(container.textContent).toContain('finite decimal')
})
test('batch parsing rejects the entire malformed batch and cannot save an old preview after editing', async () => {
  await render(); await change('select', 'job-a'); await click('Points'); await click('field.batchCSV')
  await change('#field-batch-csv', 'P1,500000,100,12\nP2,500001,101,broken'); await click('field.parse')
  expect(container.textContent).not.toContain('Parsed 1 ready')
  expect(container.textContent).not.toContain('Parsed 2 ready')
  expect(container.textContent).toContain('Elevation')
  await change('#field-batch-csv', 'P1,500000,100,12'); await click('field.parse')
  expect(container.textContent).toContain('Parsed 1 ready')
  await change('#field-batch-csv', 'P2,500001,101,13')
  expect(container.textContent).not.toContain('Parsed 1 ready')
})

test('project switches keep each job draft separately and restore its original values', async () => {
  await startPoint()
  await change('select', 'job-b')
  expect(container.querySelector<HTMLInputElement>('#field-point-name')?.value).toBe('')
  await change('#field-point-name', 'B1')
  await change('select', 'job-a')
  expect(container.querySelector<HTMLInputElement>('#field-point-name')?.value).toBe('P1')
  expect(container.querySelector<HTMLInputElement>('#field-point-easting')?.value).toBe('500000.0001234567')
  await change('select', 'job-b')
  expect(container.querySelector<HTMLInputElement>('#field-point-name')?.value).toBe('B1')
})

test('batch errors retain input without reporting success or clearing the preview', async () => {
  await render(); await change('select', 'job-a'); await click('Points'); await click('field.batchCSV')
  await change('#field-batch-csv', '"CP, west",0,-100,-2'); await click('field.parse')
  mockInsert.mockResolvedValue({ error: { message: 'Database unavailable' }, data: null })
  await click('common.save 1')
  expect(container.querySelector<HTMLTextAreaElement>('#field-batch-csv')?.value).toBe('"CP, west",0,-100,-2')
  expect(container.textContent).toContain('Database unavailable')
  expect(container.textContent).toContain('Parsed 1 ready')
  expect(mockInsert.mock.calls[0][0]).toEqual([{ project_id: 'job-a', point_name: 'CP, west', easting: 0, northing: -100, elevation: -2, is_control: false }])
})

test('a save response after an account switch cannot clear the new account draft', async () => {
  await startPoint()
  let resolveSave!: (result: QueryReply) => void
  mockInsert.mockImplementation(() => new Promise(resolve => { resolveSave = resolve }))
  await click('field.savePoint')
  mockAccount = 'bob'; await render()
  await click('Points'); await change('#field-point-name', 'BOB POINT')
  await act(async () => resolveSave({ data: null, error: null }))
  expect(container.querySelector<HTMLInputElement>('#field-point-name')?.value).toBe('BOB POINT')
  expect(container.textContent).not.toContain('Point saved to project.')
})

test('instrument point import retains the observed name and height and refuses missing projected coordinates', async () => {
  await render(); await change('select', 'job-a'); await click('Points'); await click('field.batchCSV')
  const observed = { id: 'reading-1', pointName: 'BM WEST', source: 'gsi' as const, timestamp: new Date('2026-10-14T06:00:00Z'), easting: 0, northing: -100, elevation: -2 }
  await act(async () => mockInstrumentProps.onImportPoints([observed]))
  await click('common.save 1')
  expect((mockInsert.mock.calls[0][0] as Record<string, unknown>[])[0]).toMatchObject({ point_name: 'BM WEST', easting: 0, northing: -100, elevation: -2 })
  const saved = (mockInsert.mock.calls[0][0] as Record<string, unknown>[])[0]
  expect(saved.description).toContain('reading-1')
  expect(saved).not.toHaveProperty('notes')
  await act(async () => mockInstrumentProps.onImportPoints([{ ...observed, id: 'geographic-only', easting: undefined, northing: undefined, latitude: -1, longitude: 36 }]))
  expect(container.textContent).toContain('finite decimal')
  expect(container.textContent).not.toContain('Parsed 1 ready')
})

test('a delayed instrument callback from the previous project cannot populate a new project draft', async () => {
  await render(); await change('select', 'job-a'); await click('Points')
  const importOldProject = mockInstrumentProps.onImportPoints
  await change('select', 'job-b')
  await act(async () => importOldProject([{ id: 'old-reading', pointName: 'OLD JOB POINT', source: 'gsi', timestamp: new Date(), easting: 1, northing: 2 }]))
  expect(container.textContent).not.toContain('Parsed 1 ready')
})

test('quick bearings cannot be converted into invented face and vertical-angle observations for grading', async () => {
  const check = jest.spyOn(toleranceEngine, 'checkTolerance')
  await render(); await change('select', 'job-a')
  for (const [station, bearing] of [['B', '0'], ['C', '120'], ['D', '240']]) {
    await change('#traverse-station', station); await change('#traverse-distance', '100')
    await change('input[aria-label="Bearing degrees"]', bearing)
    await click('+ field.addLeg')
  }
  expect(check).not.toHaveBeenCalled()
  expect(container.textContent).toContain('Closure not assessed')
})

test('missing stored coordinates remain unknown rather than appearing as zero', async () => {
  mockRead.mockImplementation(async table => ({ data: table === 'projects' ? [{ id: 'job-a', name: 'Job A' }] : [{ id: 'missing', point_name: 'UNKNOWN COORDINATES', easting: null, northing: '' }], error: null }))
  await render(); await change('select', 'job-a'); await click('Points')
  expect(container.textContent).toContain('UNKNOWN COORDINATES')
  expect(container.textContent).toContain('Coordinates not recorded')
})
