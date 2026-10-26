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
it('opens the exact explicitly linked traverse without choosing boundary vertices', async () => {
  render(
    <BoundaryReview
      projectId={project}
      parcelId={parcel}
      initialTraverseId={traverse}
    />,
  )
  await screen.findByRole('heading', { name: 'Retained coordinates' })
  expect(screen.getByRole('combobox')).toHaveValue(traverse)
  expect(
    fetchMock.mock.calls.some(([url]) =>
      String(url).includes('traverse_id=' + traverse),
    ),
  ).toBe(true)
  expect(
    screen.getByRole('button', { name: 'Save reviewed boundary draft' }),
  ).toBeDisabled()
  expect(
    screen.queryByRole('img', {
      name: 'Reviewed boundary shape in the project grid',
    }),
  ).not.toBeInTheDocument()
})
function vertices() {
  for (const name of ['A', 'B', 'C', 'D'])
    fireEvent.click(screen.getByRole('button', { name: `Add vertex ${name}` }))
}
function review() {
  fireEvent.click(screen.getByRole('checkbox'))
}
function pagedSource(page: number, hash = source.evidenceHash, filter = '') {
  const first = [
    ...source.points.slice(0, 2),
    ...Array.from({ length: 48 }, (_, i) => ({
      id: id(100 + i),
      station: 'Detail_' + i,
      easting: 500050 + i,
      northing: 9500050,
      elevation: null,
    })),
  ]
  return {
    ...source,
    evidenceHash: hash,
    points: filter
      ? source.points.filter((p) => p.station === filter)
      : page === 1
        ? first
        : source.points.slice(2),
    pointWindow: {
      page,
      pageSize: 50,
      total: 52,
      matchingCount: filter ? 1 : 52,
      filter,
    },
  }
}
it('keeps explicitly selected vertices across server pages and saves only their ordered IDs', async () => {
  fetchMock.mockImplementation(async (url, init) =>
    init?.method === 'POST'
      ? reply({ data: receipt() })
      : reply({
          data: url.includes('traverse_id=')
            ? pagedSource(url.includes('coordinate_page=2') ? 2 : 1)
            : directory,
        }),
  )
  await choose()
  fireEvent.click(screen.getByRole('button', { name: 'Add vertex A' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add vertex B' }))
  fireEvent.click(screen.getByRole('button', { name: 'Next coordinates' }))
  await screen.findByRole('button', { name: 'Add vertex C' })
  fireEvent.click(screen.getByRole('button', { name: 'Add vertex C' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add vertex D' }))
  expect(
    screen.getAllByRole('button', { name: /Move vertex \d+ up/ }),
  ).toHaveLength(4)
  review()
  fireEvent.click(
    screen.getByRole('button', { name: 'Save reviewed boundary draft' }),
  )
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'POST'),
    ).toBe(true),
  )
  const sent = fetchMock.mock.calls.find(
    ([, init]) => init?.method === 'POST',
  )?.[1]?.body
  expect(
    JSON.parse(String(sent)) as { ordered_coordinate_ids: string[] },
  ).toMatchObject({ ordered_coordinate_ids: ids })
})
it('clears prior vertex selections when another page has a different source fingerprint', async () => {
  fetchMock.mockImplementation(async (url) =>
    reply({
      data: url.includes('traverse_id=')
        ? pagedSource(
            url.includes('coordinate_page=2') ? 2 : 1,
            url.includes('coordinate_page=2')
              ? 'b'.repeat(64)
              : source.evidenceHash,
          )
        : directory,
    }),
  )
  await choose()
  fireEvent.click(screen.getByRole('button', { name: 'Add vertex A' }))
  fireEvent.click(screen.getByRole('button', { name: 'Next coordinates' }))
  await screen.findByRole('button', { name: 'Add vertex C' })
  expect(
    screen.queryByRole('button', { name: 'Move vertex 1 up' }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Save reviewed boundary draft' }),
  ).toBeDisabled()
  expect(screen.getByText(/source changed/i)).toBeInTheDocument()
})
it('searches server coordinates while keeping already selected vertices in the same source', async () => {
  fetchMock.mockImplementation(async (url) =>
    reply({
      data: url.includes('traverse_id=')
        ? pagedSource(
            1,
            source.evidenceHash,
            url.includes('coordinate_q=D') ? 'D' : '',
          )
        : directory,
    }),
  )
  await choose()
  fireEvent.click(screen.getByRole('button', { name: 'Add vertex A' }))
  fireEvent.change(screen.getByLabelText('Coordinate label or ID'), {
    target: { value: 'D' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Find coordinates' }))
  await screen.findByRole('button', { name: 'Add vertex D' })
  expect(
    screen.getByRole('button', { name: 'Move vertex 1 up' }),
  ).toBeInTheDocument()
  expect(
    fetchMock.mock.calls.some(([url]) => url.includes('coordinate_q=D')),
  ).toBe(true)
})
it('refuses a changed selected coordinate under an unchanged fingerprint', async () => {
  fetchMock.mockImplementation(async (url) => {
    if (!url.includes('traverse_id=')) return reply({ data: directory })
    if (url.includes('coordinate_q=A'))
      return reply({
        data: {
          ...pagedSource(1, source.evidenceHash, 'A'),
          points: [
            { ...source.points[0], easting: source.points[0].easting + 1 },
          ],
        },
      })
    return reply({
      data: pagedSource(url.includes('coordinate_page=2') ? 2 : 1),
    })
  })
  await choose()
  fireEvent.click(screen.getByRole('button', { name: 'Add vertex A' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add vertex B' }))
  fireEvent.click(screen.getByRole('button', { name: 'Next coordinates' }))
  await screen.findByRole('button', { name: 'Add vertex C' })
  fireEvent.click(screen.getByRole('button', { name: 'Add vertex C' }))
  fireEvent.change(screen.getByLabelText('Coordinate label or ID'), {
    target: { value: 'A' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Find coordinates' }))
  await screen.findByText(/changed without a matching source fingerprint/)
  expect(
    screen.getAllByRole('button', { name: /Move vertex \d+ up/ }),
  ).toHaveLength(3)
  expect(
    screen.getByRole('button', { name: 'Save reviewed boundary draft' }),
  ).toBeDisabled()
})
it('keeps vertex choices through a failed page read and retries the requested page', async () => {
  let failed = false
  fetchMock.mockImplementation(async (url) => {
    if (!url.includes('traverse_id=')) return reply({ data: directory })
    if (url.includes('coordinate_page=2') && !failed) {
      failed = true
      return reply({ error: 'SYNTHETIC coordinate page unavailable' }, 503)
    }
    return reply({
      data: pagedSource(url.includes('coordinate_page=2') ? 2 : 1),
    })
  })
  await choose()
  fireEvent.click(screen.getByRole('button', { name: 'Add vertex A' }))
  fireEvent.click(screen.getByRole('button', { name: 'Next coordinates' }))
  await screen.findByText('SYNTHETIC coordinate page unavailable')
  expect(
    screen.getByRole('button', { name: 'Move vertex 1 up' }),
  ).toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry retained source read' }),
  )
  await screen.findByRole('button', { name: 'Add vertex C' })
  expect(
    screen.getByRole('button', { name: 'Move vertex 1 up' }),
  ).toBeInTheDocument()
})
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
