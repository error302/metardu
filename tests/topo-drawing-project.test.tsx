import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import Composer from '@/components/topo/TopoDrawingComposer'

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
jest.mock('@/components/drawing/TopoEntityCanvas', () => ({ __esModule: true, default: () => <div>Drawing canvas</div> }))
jest.mock('@/components/topo/FeatureCodeBrowser', () => ({ __esModule: true, default: () => <div>Code browser</div> }))
const fetchMock = jest.fn()
const FOREIGN_CRS = 'EPSG:32632'
beforeEach(() => {
  jest.mocked(useSession).mockReturnValue({ data: { user: { id: 'owner' }, expires: '2099' }, status: 'authenticated', update: jest.fn() })
  global.fetch = fetchMock
  fetchMock.mockReset()
})
const reference = { version: 1, prs: { horizontalCrs: 'EPSG:21037', datum: 'Arc 1960', zone: 37, hemisphere: 'S', units: 'metres', distanceMode: 'grid', verticalDatum: 'Synthetic BM', heightType: 'local', coordinatePrecision: 3 }, declaredAt: '2026-10-23T00:00:00Z' }
const point = { id: 'retained-point', point_name: 'P-zero', easting: 500000, northing: 9850000, elevation: 0, code: 'SH', description: 'Measured source', horizontal_crs: 'EPSG:21037', vertical_datum: 'Synthetic BM' }
const reply = (body: unknown, ok = true) => ({ ok, json: async () => body })
function load() {
  fetchMock.mockImplementation(async (url: string) => url.includes('point-imports') ? reply({ data: { referenceSystem: reference, referenceHash: 'a'.repeat(64) } }) : reply({ data: [point], meta: { project_id: 'project-a' } }))
}
test('loads private project points with their retained zero height and declared reference', async () => {
  load()
  render(<Composer projectId="project-a" />)
  expect(await screen.findByText('P-zero')).toBeInTheDocument()
  expect(screen.getByText('0.000')).toBeInTheDocument()
  expect(screen.getByText(/EPSG:21037/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Import CSV' })).not.toBeInTheDocument()
  const request = fetchMock.mock.calls.find(([url]: [unknown]) => url === '/api/project/project-a/points?includeIncomplete=true') as [string, RequestInit] | undefined
  expect(request?.[1].cache).toBe('no-store')
  expect(request?.[1].signal).toBeInstanceOf(AbortSignal)
})
test('does not expose another account project source after sign-out', async () => {
  load()
  const view = render(<Composer projectId="project-a" />)
  await screen.findByText('P-zero')
  jest.mocked(useSession).mockReturnValue({ data: null, status: 'unauthenticated', update: jest.fn() })
  view.rerender(<Composer projectId="project-a" />)
  expect(screen.queryByText('P-zero')).not.toBeInTheDocument()
  expect(screen.getByText(/Sign in to load/)).toBeInTheDocument()
})
test('refuses a mismatched response instead of loading another project', async () => {
  load()
  fetchMock.mockImplementation(async (url: string) => url.includes('point-imports') ? reply({ data: { referenceSystem: reference, referenceHash: 'a'.repeat(64) } }) : reply({ data: [point], meta: { project_id: 'project-b' } }))
  render(<Composer projectId="project-a" />)
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/project/i))
  expect(screen.queryByText('P-zero')).not.toBeInTheDocument()
})

test('refuses export when the declared project reference changes', async () => {
  load()
  render(<Composer projectId="project-a" />)
  await screen.findByText('P-zero')
  fetchMock.mockResolvedValue(reply({ data: { referenceSystem: reference, referenceHash: 'b'.repeat(64) } }))
  fireEvent.click(screen.getByRole('button', { name: 'Export DXF' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Project reference or access changed')
})

test('late private responses cannot cross a project switch', async () => {
  let resolveLate: (value: ReturnType<typeof reply>) => void = () => undefined
  const pending = new Promise<ReturnType<typeof reply>>(resolve => { resolveLate = resolve })
  fetchMock.mockReturnValue(pending)
  const view = render(<Composer projectId="project-a" />)
  view.rerender(<Composer projectId="project-b" />)
  await act(async () => { resolveLate(reply({ data: [point], meta: { project_id: 'project-a' } })); await pending })
  await screen.findByRole('alert')
  expect(screen.queryByText('P-zero')).not.toBeInTheDocument()
})

test('missing source heights remain visible and prevent partial terrain export', async () => {
  fetchMock.mockImplementation(async (url: string) => url.includes('point-imports') ? reply({ data: { referenceSystem: reference, referenceHash: 'a'.repeat(64) } }) : reply({ data: [{ ...point, elevation: null, vertical_datum: null }], meta: { project_id: 'project-a' } }))
  render(<Composer projectId="project-a" />)
  await screen.findByText('P-zero')
  expect(screen.getByRole('alert')).toHaveTextContent('Some source heights are unknown')
  expect(screen.getByRole('button', { name: 'Export DXF' })).toBeDisabled()
})

test('manual zero heights are retained; a CRS and units are required before local export', () => {
  render(<Composer />)
  fireEvent.change(screen.getByPlaceholderText('Easting'), { target: { value: '500000' } })
  fireEvent.change(screen.getByPlaceholderText('Northing'), { target: { value: '6000000' } })
  fireEvent.change(screen.getByPlaceholderText('RL'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: /^Add$/ }))
  expect(screen.getByText('0.000')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Export DXF' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Horizontal CRS (projected metres)'), { target: { value: FOREIGN_CRS } })
  fireEvent.change(screen.getByLabelText('Height reference'), { target: { value: 'Synthetic BM' } })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Horizontal coordinates and measured heights are in metres.' }))
  expect(screen.getByRole('button', { name: 'Export DXF' })).toBeEnabled()
})

test('an invalid grid setting remains editable, retains observations and blocks export', async () => {
  load()
  render(<Composer projectId="project-a" />)
  await screen.findByText('P-zero')
  fireEvent.click(screen.getByRole('button', { name: 'Drawing Settings' }))
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Grid Tick (m)' }), { target: { value: '-1' } })
  expect(screen.getByRole('alert')).toHaveTextContent(/Grid interval must be finite and positive/)
  expect(screen.getByText('P-zero')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Export DXF' })).toBeDisabled()
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Grid Tick (m)' }), { target: { value: '50' } })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Export DXF' })).toBeEnabled()
})
