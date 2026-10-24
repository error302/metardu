import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import Page from './page'

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
jest.mock('@/components/field/ProjectPicker', () => ({ ProjectPicker: ({ onPick }: { onPick: (id: string) => void }) => <div>
  <button onClick={() => onPick('11111111-1111-4111-8111-111111111111')}>Synthetic Alpha</button>
  <button onClick={() => onPick('22222222-2222-4222-8222-222222222222')}>Synthetic Beta</button>
</div> }))

const CRS = 'EPSG:32632'
const reference = { prs: { horizontalCrs: CRS, horizontalName: 'WGS84 UTM 32N', datum: 'WGS 84', units: 'metres', zone: 32,
  hemisphere: 'N', verticalDatum: 'Synthetic BM', distanceMode: 'grid', coordinatePrecision: 3 } }
const response = (referenceSystem: unknown = reference, hash = 'a'.repeat(64)) => ({
  ok: true, json: async () => ({ data: { referenceSystem, referenceHash: hash } }),
}) as Response
const account = (id: string): ReturnType<typeof useSession> => ({ data: { user: { id }, expires: '2099-01-01T00:00:00Z' }, status: 'authenticated', update: jest.fn(async () => null) })
const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>()

beforeEach(() => {
  localStorage.clear()
  jest.mocked(useSession).mockReturnValue(account('synthetic-owner'))
  fetchMock.mockReset().mockResolvedValue(response())
  global.fetch = fetchMock
})
afterEach(() => jest.restoreAllMocks())
async function choose(name = 'Synthetic Alpha') {
  fireEvent.click(await screen.findByRole('button', { name }))
  await screen.findByText(CRS)
}

test('an unauthenticated visitor cannot see a prior account checklist', () => {
  jest.mocked(useSession).mockReturnValue({ data: null, status: 'unauthenticated', update: jest.fn() })
  localStorage.setItem('metardu_topo_pipeline', JSON.stringify({ steps: [{ id: 'contours', status: 'done' }] }))
  render(<Page />)
  expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
  expect(screen.queryByText(/steps complete/i)).not.toBeInTheDocument()
})

test('selected project and declared reference reach the connected tools', async () => {
  render(<Page />)
  await choose()
  expect(fetchMock).toHaveBeenCalledWith('/api/project/11111111-1111-4111-8111-111111111111/point-imports', expect.objectContaining({ cache: 'no-store' }))
  expect(screen.getByRole('link', { name: 'Open Generate contours' })).toHaveAttribute('href', '/tools/contour-generator?project=11111111-1111-4111-8111-111111111111')
  expect(screen.getByRole('link', { name: 'Open Topographic drawing' })).toHaveAttribute('href', '/tools/topo-drawing?project=11111111-1111-4111-8111-111111111111')
  expect(screen.getByRole('link', { name: 'Open Review and deliver' })).toHaveAttribute('href', '/project/11111111-1111-4111-8111-111111111111/deliver')
})

test('review notes cannot be mistaken for completion or inherit global progress', async () => {
  const legacy = JSON.stringify({ steps: [{ id: 'contours', status: 'done' }] })
  localStorage.setItem('metardu_topo_pipeline', legacy)
  render(<Page />)
  await choose()
  const note = screen.getByRole('button', { name: 'Mark Generate contours as reviewed' })
  expect(note).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(note)
  expect(note).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText(/review notes.*do not establish.*approval/i)).toBeInTheDocument()
  expect(screen.queryByText(/steps complete/i)).not.toBeInTheDocument()
  expect(localStorage.getItem('metardu_topo_pipeline')).toBe(legacy)
})

test('changing projects does not inherit review notes', async () => {
  render(<Page />)
  await choose()
  fireEvent.click(screen.getByRole('button', { name: 'Mark Generate contours as reviewed' }))
  fireEvent.click(screen.getByRole('button', { name: 'Change project' }))
  await choose('Synthetic Beta')
  expect(screen.getByRole('button', { name: 'Mark Generate contours as reviewed' })).toHaveAttribute('aria-pressed', 'false')
})

test('account changes clear project selection and private review state', async () => {
  const view = render(<Page />)
  await choose()
  fireEvent.click(screen.getByRole('button', { name: 'Mark Generate contours as reviewed' }))
  jest.mocked(useSession).mockReturnValue(account('second-owner'))
  view.rerender(<Page />)
  await choose()
  expect(screen.getByRole('button', { name: 'Mark Generate contours as reviewed' })).toHaveAttribute('aria-pressed', 'false')
})

test('reference changes invalidate old review notes without deleting them', async () => {
  const view = render(<Page />)
  await choose()
  fireEvent.click(screen.getByRole('button', { name: 'Mark Generate contours as reviewed' }))
  const saved = Object.keys(localStorage).filter(key => key.startsWith('metardu:topo-review:'))
  view.unmount()
  fetchMock.mockResolvedValue(response(reference, 'b'.repeat(64)))
  render(<Page />)
  await choose()
  expect(screen.getByRole('button', { name: 'Mark Generate contours as reviewed' })).toHaveAttribute('aria-pressed', 'false')
  expect(saved.every(key => localStorage.getItem(key) !== null)).toBe(true)
})

test('a storage failure is visible and never claims durable progress', async () => {
  render(<Page />)
  await choose()
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Synthetic quota', 'QuotaExceededError') })
  fireEvent.click(screen.getByRole('button', { name: 'Mark Generate contours as reviewed' }))
  expect(screen.getByRole('alert')).toHaveTextContent(/could not save.*device/i)
})

test('a reference load failure has a retry and cannot become a default CRS', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Synthetic offline' }) } as Response)
  render(<Page />)
  fireEvent.click(await screen.findByRole('button', { name: 'Synthetic Alpha' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i)
  expect(screen.queryByText(CRS)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry project reference' }))
  await screen.findByText(CRS)
})

test('a missing declaration remains missing', async () => {
  fetchMock.mockResolvedValue(response(null))
  render(<Page />)
  fireEvent.click(await screen.findByRole('button', { name: 'Synthetic Alpha' }))
  await waitFor(() => expect(screen.getByText('Reference system not set')).toBeInTheDocument())
  expect(screen.getByRole('link', { name: 'Open Project reference and control' })).toHaveAttribute('href', '/project/11111111-1111-4111-8111-111111111111/settings')
})

test('a late response from the previous project cannot replace the selected reference', async () => {
  let finishAlpha: (value: Response) => void = () => { throw new Error('Deferred request missing') }
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { finishAlpha = resolve }))
  render(<Page />)
  fireEvent.click(await screen.findByRole('button', { name: 'Synthetic Alpha' }))
  await screen.findByText('Loading project reference…')
  fireEvent.click(screen.getByRole('button', { name: 'Change project' }))
  await choose('Synthetic Beta')
  await act(async () => { finishAlpha(response(null, 'c'.repeat(64))); await Promise.resolve() })
  expect(screen.getByText(CRS)).toBeInTheDocument()
  expect(screen.queryByText('Reference system not set')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open Generate contours' })).toHaveAttribute('href', '/tools/contour-generator?project=22222222-2222-4222-8222-222222222222')
})
