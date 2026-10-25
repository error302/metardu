import { fireEvent, render, screen } from '@testing-library/react'
import Page from '@/app/project/[id]/scheme/blocks/page'
const PROJECT = '11111111-1111-4111-8111-111111111111',
  CREATED = '44444444-4444-4444-8444-444444444444',
  VERSION = '2026-10-25T00:00:00.123456Z'
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: PROJECT }),
  useRouter: () => ({ back: jest.fn() }),
}))
type Reply = { ok: boolean; json: () => Promise<unknown> }
const fetchMock = jest.fn<Promise<Reply>, [string, RequestInit?]>()
const originalFetch = global.fetch
const row = (i = 1) => ({
  id: `33333333-3333-4333-8333-${String(i).padStart(12, '0')}`,
  project_id: PROJECT,
  block_number: `SYN-${String(i).padStart(3, '0')}`,
  block_name: null,
  description: null,
  created_at: VERSION,
  updated_at: VERSION,
  row_version: '100',
  parcel_count: i === 1 ? 9999 : 0,
  completed_count: i === 1 ? 5000 : 0,
  assignment_count: 0,
  has_import_receipts: false as boolean | null,
  has_geometry: false,
  can_delete: i !== 1,
})
const snapshot = () => ({
  project: {
    id: PROJECT,
    name: 'SYNTHETIC campaign',
    projectType: 'scheme',
    canCreate: true,
  },
  summary: {
    blocks: 60,
    parcels: 10000,
    submittedOrApproved: 5000,
    unassignedParcels: 1,
    invalidBlockLinks: 0,
    receiptRetention: 'available',
  },
  meta: { page: 1, pageSize: 24, total: 60, search: '' },
  data: Array.from({ length: 24 }, (_, i) => row(i + 1)),
})
const reply = (body: unknown, ok = true): Reply => ({
  ok,
  json: async () => body,
})
beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(reply(snapshot()))
  global.fetch = fetchMock as unknown as typeof fetch
})
afterEach(() => {
  global.fetch = originalFetch
  jest.restoreAllMocks()
})
async function loaded() {
  render(<Page />)
  await screen.findByRole('heading', { name: 'SYNTHETIC campaign' })
}

it('loads a bounded directory with whole-project numeric counts', async () => {
  await loaded()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('Project blocks')).toHaveTextContent('60')
  expect(screen.getByLabelText('Project parcels')).toHaveTextContent('10,000')
  expect(
    screen.getAllByRole('button', { name: /Edit block SYN-/ }),
  ).toHaveLength(24)
})
it('creates a block with an unchanged project UUID', async () => {
  await loaded()
  fetchMock.mockImplementation(async (_url, init) =>
    init?.method === 'POST'
      ? reply({
          data: {
            ...row(2),
            id: CREATED,
            block_number: 'SYN-NEW',
            row_version: '200',
          },
        })
      : reply(snapshot()),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Add block' }))
  fireEvent.change(screen.getByLabelText('Block number'), {
    target: { value: 'SYN-NEW' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create block' }))
  await screen.findByText('Block creation acknowledged.')
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
  const body = JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>
  expect(body.project_id).toBe(PROJECT)
  expect(body.block_name).toBeNull()
})
it('edits only changed fields with both loaded version tokens', async () => {
  await loaded()
  fetchMock.mockImplementation(async (_url, init) =>
    init?.method === 'PATCH'
      ? reply({
          data: {
            ...row(),
            block_name: 'SYNTHETIC renamed',
            updated_at: '2026-10-25T00:00:01.123456Z',
            row_version: '200',
          },
        })
      : reply(snapshot()),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Edit block SYN-001' }))
  fireEvent.change(screen.getByLabelText('Block name'), {
    target: { value: 'SYNTHETIC renamed' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save block changes' }))
  await screen.findByText('Block change acknowledged.')
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
  const body = JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>
  expect(body.updated_at).toBe(VERSION)
  expect(body.row_version).toBe('100')
  expect(body.project_id).toBe(PROJECT)
  expect(body.description).toBeUndefined()
})
it('keeps the edit draft after a stale-write refusal', async () => {
  await loaded()
  fetchMock.mockImplementation(async (_url, init) =>
    init?.method === 'PATCH'
      ? reply({ error: 'Synthetic stale block' }, false)
      : reply(snapshot()),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Edit block SYN-001' }))
  fireEvent.change(screen.getByLabelText('Block name'), {
    target: { value: 'SYNTHETIC draft' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save block changes' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('Block name')).toHaveValue('SYNTHETIC draft')
  expect(
    screen.queryByText('Block change acknowledged.'),
  ).not.toBeInTheDocument()
})
it('protects nonempty blocks and confirms only an empty block deletion', async () => {
  await loaded()
  expect(
    screen.getByRole('button', { name: 'Delete block SYN-001' }),
  ).toBeDisabled()
  jest.spyOn(window, 'confirm').mockReturnValue(true)
  fetchMock.mockImplementation(async (_url, init) =>
    init?.method === 'DELETE'
      ? reply({
          data: { deletedId: row(2).id, projectId: PROJECT, rowVersion: '100' },
        })
      : reply(snapshot()),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Delete block SYN-002' }))
  await screen.findByText('Empty block deletion acknowledged.')
  const call = fetchMock.mock.calls.find(
    ([, init]) => init?.method === 'DELETE',
  )
  const url = new URL(String(call?.[0]), 'http://127.0.0.1:3021')
  expect(url.searchParams.get('updated_at')).toBe(VERSION)
  expect(url.searchParams.get('row_version')).toBe('100')
})
it('retains read access when receipt checks are unavailable and disables deletion', async () => {
  const body = snapshot()
  body.summary.receiptRetention = 'unavailable'
  body.data = body.data.map((value) => ({
    ...value,
    has_import_receipts: null,
    can_delete: false,
  }))
  fetchMock.mockResolvedValue(reply(body))
  await loaded()
  expect(
    screen.getByText(/Deletion is unavailable while import-receipt retention/),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Delete block SYN-002' }),
  ).toBeDisabled()
})
it('does not fabricate zero counts after read failure', async () => {
  fetchMock.mockResolvedValue(reply({ error: 'Synthetic unavailable' }, false))
  render(<Page />)
  await screen.findByRole('alert')
  expect(screen.queryByLabelText('Project blocks')).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Retry block directory' }),
  ).toBeInTheDocument()
})
it('keeps confirmed totals after a failed refresh', async () => {
  await loaded()
  fetchMock.mockResolvedValue(
    reply({ error: 'Synthetic refresh failed' }, false),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Refresh blocks' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('Project parcels')).toHaveTextContent('10,000')
})
it('rejects a wrong-project acknowledgement', async () => {
  await loaded()
  fetchMock.mockImplementation(async (_url, init) =>
    init?.method === 'PATCH'
      ? reply({
          data: {
            ...row(),
            project_id: CREATED,
            block_name: 'SYNTHETIC renamed',
            row_version: '200',
            updated_at: '2026-10-25T00:00:01.123456Z',
          },
        })
      : reply(snapshot()),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Edit block SYN-001' }))
  fireEvent.change(screen.getByLabelText('Block name'), {
    target: { value: 'SYNTHETIC renamed' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save block changes' }))
  await screen.findByRole('alert')
  expect(
    screen.queryByText('Block change acknowledged.'),
  ).not.toBeInTheDocument()
})
it('paginates and filters without changing the global totals', async () => {
  await loaded()
  const next = snapshot()
  next.meta.page = 2
  next.data = Array.from({ length: 24 }, (_, i) => row(i + 25))
  fetchMock.mockResolvedValue(reply(next))
  fireEvent.click(screen.getByRole('button', { name: 'Next blocks page' }))
  await screen.findByText('SYN-025')
  expect(screen.queryByText('SYN-001')).not.toBeInTheDocument()
  const filtered = snapshot()
  filtered.meta.search = '%_'
  filtered.meta.total = 1
  filtered.data = [{ ...row(2), block_number: 'SYN%_MATCH' }]
  fetchMock.mockResolvedValue(reply(filtered))
  fireEvent.change(screen.getByLabelText('Search block number or name'), {
    target: { value: '%_' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Apply block filter' }))
  await screen.findByText('SYN%_MATCH')
  expect(screen.getByLabelText('Project blocks')).toHaveTextContent('60')
})
