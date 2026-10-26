import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import BoundaryReview from '@/components/scheme/BoundaryReview'
const id = (n: number) =>
  `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`
const project = id(1),
  parcel = id(2),
  traverse = id(3),
  requestId = id(4),
  ids = [10, 11, 12, 13].map(id)
const source = {
  storageReady: true,
  observationCount: 0,
  projectId: project,
  parcelId: parcel,
  parcelNumber: 'SYN-A',
  blockId: null,
  parcelStatus: 'pending',
  parcelRevision: 0,
  traverseId: traverse,
  sourceCrs: 'EPSG:32737',
  evidenceHash: 'a'.repeat(64),
  points: [
    [500000, 9500000],
    [500010, 9500000],
    [500010, 9500020],
    [500000, 9500020],
  ].map(([easting, northing], i) => ({
    id: ids[i],
    station: ['A', 'B', 'C', 'D'][i],
    easting,
    northing,
    elevation: i === 0 ? 0 : null,
  })),
}
const directory = {
  projectId: project,
  parcelId: parcel,
  parcelNumber: 'SYN-A',
  page: 1,
  pageSize: 24,
  total: 1,
  traverses: [
    {
      id: traverse,
      name: 'SYNTHETIC retained traverse',
      status: 'computed',
      pointCount: 4,
    },
  ],
}
const reply = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
})
const receipt = () => ({
  protocol: 'reviewed-parcel-boundary-v1',
  receiptId: id(5),
  requestId,
  projectId: project,
  parcelId: parcel,
  traverseId: traverse,
  evidenceHash: source.evidenceHash,
  inputHash: 'b'.repeat(64),
  sourceCrs: source.sourceCrs,
  orderedCoordinateIds: ids,
  polygon: {
    type: 'Polygon',
    coordinates: [
      [
        [500000, 9500000],
        [500010, 9500000],
        [500010, 9500020],
        [500000, 9500020],
        [500000, 9500000],
      ],
    ],
  },
  gridAreaSqM: 200,
  gridPerimeterM: 60,
  areaHa: 0.02,
  parcelRevision: 1,
  parcelUpdatedAt: '2026-10-25T00:00:01.123456Z',
  status: 'draft_unverified',
})
type Reply = { ok: boolean; status: number; json: () => Promise<unknown> }
const fetchMock = jest.fn<Promise<Reply>, [string, RequestInit?]>(),
  previousFetch = global.fetch
beforeEach(() => {
  fetchMock
    .mockReset()
    .mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? reply({ data: receipt() })
        : reply({ data: url.includes('traverse_id=') ? source : directory }),
    )
  global.fetch = fetchMock as unknown as typeof fetch
  jest.spyOn(crypto, 'randomUUID').mockReturnValue(requestId)
})
afterEach(() => {
  global.fetch = previousFetch
  jest.restoreAllMocks()
})
async function choose() {
  render(<BoundaryReview projectId={project} parcelId={parcel} />)
  const select = await screen.findByRole('combobox')
  expect(select).toHaveValue('')
  fireEvent.change(select, { target: { value: traverse } })
  await screen.findByRole('heading', { name: 'Retained coordinates' })
}
it('opens the exact explicitly linked traverse without choosing boundary vertices',async()=>{
  render(<BoundaryReview projectId={project} parcelId={parcel} initialTraverseId={traverse}/>)
  await screen.findByRole('heading',{name:'Retained coordinates'})
  expect(screen.getByRole('combobox')).toHaveValue(traverse)
  expect(fetchMock.mock.calls.some(([url])=>String(url).includes('traverse_id='+traverse))).toBe(true)
  expect(screen.getByRole('button',{name:'Save reviewed boundary draft'})).toBeDisabled()
  expect(screen.queryByRole('img',{name:'Reviewed boundary shape in the project grid'})).not.toBeInTheDocument()
})
function vertices() {
  for (const name of ['A', 'B', 'C', 'D'])
    fireEvent.click(screen.getByRole('button', { name: `Add vertex ${name}` }))
}
function review() {
  fireEvent.click(screen.getByRole('checkbox'))
}
it('requires explicit source selection and preserves zero/unknown heights', async () => {
  await choose()
  expect(screen.getByText(/E 500000 · N 9500000 · H 0/)).toBeInTheDocument()
  expect(screen.getAllByText(/H unknown/)).toHaveLength(3)
  expect(
    screen.getByRole('button', { name: 'Save reviewed boundary draft' }),
  ).toBeDisabled()
  expect(
    screen.queryByRole('img', {
      name: 'Reviewed boundary shape in the project grid',
    }),
  ).not.toBeInTheDocument()
})
it('preserves read/review access but disables saving when receipt storage is unavailable', async () => {
  fetchMock.mockImplementation(async (url: string) =>
    reply({
      data: url.includes('traverse_id=')
        ? { ...source, storageReady: false }
        : directory,
    }),
  )
  await choose()
  vertices()
  review()
  expect(
    screen.getByText(/Draft saving is temporarily unavailable/),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Save reviewed boundary draft' }),
  ).toBeDisabled()
})
it('saves only selected ordered IDs after explicit review and shows the exact receipt', async () => {
  await choose()
  vertices()
  expect(
    screen.getByRole('img', {
      name: 'Reviewed boundary shape in the project grid',
    }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Save reviewed boundary draft' }),
  ).toBeDisabled()
  review()
  fireEvent.click(
    screen.getByRole('button', { name: 'Save reviewed boundary draft' }),
  )
  await screen.findByText('Boundary draft saved and acknowledged.')
  const body = JSON.parse(
    String(
      fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')?.[1]
        ?.body,
    ),
  ) as Record<string, unknown>
  expect(body.ordered_coordinate_ids).toEqual(ids)
  expect(body.parcel_id).toBe(parcel)
  expect(body.source_crs).toBe(source.sourceCrs)
  expect(body.evidence_hash).toBe(source.evidenceHash)
})
it('invalidates review when vertex order changes and refuses a crossed polygon', async () => {
  await choose()
  vertices()
  review()
  fireEvent.click(screen.getByRole('button', { name: 'Move vertex 3 up' }))
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  expect(
    screen.getByRole('button', { name: 'Save reviewed boundary draft' }),
  ).toBeDisabled()
  expect(
    screen.getByText(/chosen boundary crosses itself/i),
  ).toBeInTheDocument()
})
it('retains the exact command after a network interruption and retries the same request', async () => {
  await choose()
  vertices()
  review()
  let posts = 0
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts++
      if (posts === 1) throw new Error('SYNTHETIC connection interrupted')
      return reply({ data: receipt() })
    }
    return reply({ data: url.includes('traverse_id=') ? source : directory })
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Save reviewed boundary draft' }),
  )
  await screen.findByRole('alert')
  expect(screen.getByRole('button', { name: 'Remove vertex 1' })).toBeDisabled()
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry exact draft save' }),
  )
  await screen.findByText('Boundary draft saved and acknowledged.')
  const calls = fetchMock.mock.calls.filter(
    ([, init]) => init?.method === 'POST',
  )
  expect(calls).toHaveLength(2)
  expect(calls[0][1]?.body).toBe(calls[1][1]?.body)
})
it('rejects mismatched geometry acknowledgements without showing success', async () => {
  await choose()
  vertices()
  review()
  fetchMock.mockResolvedValue(
    reply({ data: { ...receipt(), gridAreaSqM: 999 } }),
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Save reviewed boundary draft' }),
  )
  await screen.findByRole('alert')
  expect(
    screen.queryByText('Boundary draft saved and acknowledged.'),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Retry exact draft save' }),
  ).toBeInTheDocument()
})
it('keeps stale drafts visible and allows a fresh review after definitive refusal', async () => {
  await choose()
  vertices()
  review()
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? reply({ error: 'SYNTHETIC source changed' }, 409)
      : reply({ data: url.includes('traverse_id=') ? source : directory }),
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Save reviewed boundary draft' }),
  )
  await screen.findByRole('alert')
  expect(screen.getByRole('button', { name: 'Remove vertex 1' })).toBeEnabled()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload source for a new review' }),
  )
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Remove vertex 1' }),
    ).not.toBeInTheDocument(),
  )
})
it('does not fabricate coordinates after a source read failure and supports retry', async () => {
  await choose()
  fetchMock.mockImplementation(async (url: string) =>
    url.includes('traverse_id=')
      ? reply({ error: 'SYNTHETIC source unavailable' }, 503)
      : reply({ data: directory }),
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload source for a new review' }),
  )
  await screen.findByRole('alert')
  expect(
    screen.queryByRole('heading', { name: 'Retained coordinates' }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Retry retained source read' }),
  ).toBeInTheDocument()
})
it('rejects source replies for another parcel', async () => {
  fetchMock.mockImplementation(async (url: string) =>
    reply({
      data: url.includes('traverse_id=')
        ? { ...source, parcelId: id(99) }
        : directory,
    }),
  )
  render(<BoundaryReview projectId={project} parcelId={parcel} />)
  fireEvent.change(await screen.findByRole('combobox'), {
    target: { value: traverse },
  })
  await screen.findByRole('alert')
  expect(
    screen.queryByRole('heading', { name: 'Retained coordinates' }),
  ).not.toBeInTheDocument()
})
it('recovers a retained receipt by request ID without claiming a new save', async () => {
  await choose()
  fetchMock.mockResolvedValue(reply({ data: receipt() }))
  fireEvent.change(screen.getByLabelText('Saved boundary request ID'), {
    target: { value: requestId },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Find retained receipt' }))
  await screen.findByText(/Retained draft receipt .*parcel revision 1/)
  expect(
    screen.queryByText('Boundary draft saved and acknowledged.'),
  ).not.toBeInTheDocument()
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(
    false,
  )
})
