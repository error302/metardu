import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ProjectCadPage from '@/app/project/[id]/cad-editor/page'
import { buildProjectCadDocument } from '@/lib/cad/projectCadDocument'
import type { CADEditorProps } from '@/components/cad-editor/CADEditor'

let mockProjectId = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const syntheticFrame = 'EPSG:21037', otherSyntheticFrame = 'EPSG:21036'
jest.mock('next/navigation', () => ({ useParams: () => ({ id: mockProjectId }), useRouter: () => ({ push: jest.fn() }) }))
jest.mock('next/dynamic', () => () => function Editor({ initialDocument, projectId, onSave }: CADEditorProps) {
  return <div><pre data-testid="drawing">{JSON.stringify({ projectId, document: initialDocument })}</pre><button onClick={() => onSave?.(initialDocument)}>Save test drawing</button></div>
})
const document = buildProjectCadDocument({ projectName: 'Synthetic drawing', projectCrs: syntheticFrame }, [
  { pointName: 'P1', easting: 500000, northing: 9800000 },
]).document
const response = (body: unknown) => ({ ok: true, json: async () => body }) as Response
const project = (id: string, saved = false) => ({ data: { id, name: `Synthetic ${id}`, boundary_data: saved ? { cadDocument: document } : {} } })
const points = (crs = syntheticFrame, source = crs) => ({ data: [
  { point_name: 'P1', easting: 500000, northing: 9800000, horizontal_crs: source },
], meta: { project_crs: { horizontal_crs: crs } } })
let mockFetch: jest.Mock
const readDrawing = () => JSON.parse(screen.getByTestId('drawing').textContent || '{}') as {
  projectId: string; document: { titleBlock: { projectName: string } }
}
beforeEach(() => {
  jest.restoreAllMocks()
  mockProjectId = '11111111-1111-4111-8111-111111111111'
  localStorage.clear()
  mockFetch = jest.fn(async (url: string) => response(url.endsWith('/points') ? points() : project(mockProjectId)))
  global.fetch = mockFetch
})

test('requires an explicit server save acknowledgement instead of accepting any HTTP 200', async () => {
  mockFetch.mockImplementation(async (url: string, options?: RequestInit) => response(options?.method === 'PUT' ? { saved: false } : url.endsWith('/points') ? points() : project(mockProjectId)))
  render(<ProjectCadPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Save test drawing' }))
  await screen.findByText(/server save failed; local backup retained/i)
  expect(screen.queryByText('Synced to Project')).not.toBeInTheDocument()
})

test('still saves to the server when the device backup quota is unavailable', async () => {
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError') })
  mockFetch.mockImplementation(async (url: string, options?: RequestInit) => response(options?.method === 'PUT' ? { saved: true, updatedAt: '2026-10-18T04:00:00.000Z' } : url.endsWith('/points') ? points() : project(mockProjectId)))
  render(<ProjectCadPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Save test drawing' }))
  await screen.findByText('Synced to Project')
  expect(screen.getByText(/device backup unavailable/i)).toBeInTheDocument()
})

test('does not load a project response belonging to a different job', async () => {
  mockFetch.mockImplementation(async (url: string) => response(url.endsWith('/points') ? points() : project(other)))
  render(<ProjectCadPage />)
  await screen.findByText(/response.*different project/i)
  expect(screen.queryByTestId('drawing')).not.toBeInTheDocument()
})

test('preserves a saved drawing and refuses to relabel its different CRS as the current project', async () => {
  mockFetch.mockImplementation(async (url: string) => response(url.endsWith('/points') ? points(otherSyntheticFrame) : project(mockProjectId, true)))
  render(<ProjectCadPage />)
  await screen.findByText(/saved drawing.*different.*CRS/i)
  expect(screen.queryByTestId('drawing')).not.toBeInTheDocument()
  expect(document.coordinateReferenceSystem).toBe(syntheticFrame)
})

test('does not plot unknown or mixed point source grids as project-grid coordinates', async () => {
  mockFetch.mockImplementation(async (url: string) => response(url.endsWith('/points') ? points(syntheticFrame, otherSyntheticFrame) : project(mockProjectId)))
  render(<ProjectCadPage />)
  await screen.findByText(/P1.*source.*grid/i)
  expect(screen.queryByTestId('drawing')).not.toBeInTheDocument()
})

test('late results from a previous job cannot replace the newly selected drawing', async () => {
  const first = mockProjectId
  let resolveOld!: (value: Response) => void
  const old = new Promise<Response>(resolve => { resolveOld = resolve })
  mockFetch.mockImplementation(async (url: string) => url === `/api/project/${first}` ? old : response(url.endsWith('/points') ? points() : project(other)))
  const rendered = render(<ProjectCadPage />)
  mockProjectId = other
  rendered.rerender(<ProjectCadPage />)
  await screen.findByTestId('drawing')
  await act(async () => { resolveOld(response(project(first))); await old })
  await waitFor(() => expect(readDrawing().projectId).toBe(other))
  expect(readDrawing().document.titleBlock.projectName).toBe(`Synthetic ${other}`)
})
