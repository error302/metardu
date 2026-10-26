import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createHash, webcrypto } from 'node:crypto'
import { z } from 'zod'
import { canonicalJSON } from '@/lib/audit/auditHash'
import BoundaryReview from '@/components/scheme/BoundaryReview'
import {
  prepareBoundaryPending,
  acknowledgeBoundaryOutcome,
} from '@/lib/scheme/boundaryPending'
const id = (n: number) =>
  `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`
const project = id(1),
  parcel = id(2),
  traverse = id(3),
  requestId = id(4),
  ids = [10, 11, 12, 13].map(id)
const actor = id(99)
let mockActor = actor
jest.mock('next-auth/react', () => ({
  useSession: () => ({
    status: 'authenticated',
    data: { user: { id: mockActor } },
  }),
}))
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
const receipt = (command?: unknown) => ({
  actorId: actor,
  protocol: 'reviewed-parcel-boundary-v1',
  receiptId: id(5),
  requestId,
  projectId: project,
  parcelId: parcel,
  traverseId: traverse,
  evidenceHash: source.evidenceHash,
  inputHash: command
    ? createHash('sha256')
        .update(
          canonicalJSON({
            protocol: 'reviewed-parcel-boundary-v1',
            project,
            command,
          }),
        )
        .digest('hex')
    : 'b'.repeat(64),
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
const previousCrypto = global.crypto
const deviceKey = () =>
  `metardu:boundary-request:v1:${actor}:${project}:${parcel}`
beforeEach(() => {
  localStorage.clear()
  mockActor = actor
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  })
  Object.defineProperty(navigator, 'locks', {
    value: { request: async (_name: string, work: () => unknown) => work() },
    configurable: true,
  })
  fetchMock
    .mockReset()
    .mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? reply({ data: receipt(JSON.parse(String(init.body)) as unknown) })
        : reply({ data: url.includes('traverse_id=') ? source : directory }),
    )
  global.fetch = fetchMock as unknown as typeof fetch
  jest.spyOn(crypto, 'randomUUID').mockReturnValue(requestId)
})
afterEach(() => {
  global.fetch = previousFetch
  jest.restoreAllMocks()
  Object.defineProperty(globalThis, 'crypto', {
    value: previousCrypto,
    configurable: true,
  })
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
const retainDeviceRequest = () =>
  prepareBoundaryPending(
    project,
    {
      expected_user_id: actor,
      parcel_id: parcel,
      traverse_id: traverse,
      request_id: requestId,
      evidence_hash: source.evidenceHash,
      source_crs: source.sourceCrs,
      ordered_coordinate_ids: ids,
      reviewed: true,
      note: 'SYNTHETIC retained request',
    },
    source,
  )
it('retries the original retained boundary when current source reads are unavailable', async () => {
  const record = await retainDeviceRequest()
  fetchMock.mockImplementation(async (_url, init) =>
    init?.method === 'POST'
      ? reply({ data: receipt(record.command) })
      : reply({ error: 'SYNTHETIC current source unavailable' }, 503),
  )
  render(
    <BoundaryReview
      projectId={project}
      parcelId={parcel}
      initialTraverseId={traverse}
    />,
  )
  await screen.findByText('SYNTHETIC current source unavailable')
  const retry = await screen.findByRole('button', {
    name: 'Retry exact draft save',
  })
  expect(retry).toBeEnabled()
  fireEvent.click(retry)
  await screen.findByText('Boundary draft saved and acknowledged.')
  expect(localStorage.getItem(deviceKey())).toBeNull()
  expect(
    fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')[0][1]
      ?.body,
  ).toBe(JSON.stringify(record.command))
})
it('isolates retained boundary requests when the signed-in account changes', async () => {
  await retainDeviceRequest()
  const original = localStorage.getItem(deviceKey()),
    view = render(<BoundaryReview projectId={project} parcelId={parcel} />)
  await screen.findByRole('button', { name: 'Recover saved request' })
  mockActor = id(98)
  view.rerender(<BoundaryReview projectId={project} parcelId={parcel} />)
  await screen.findByRole('combobox')
  expect(
    screen.queryByRole('button', { name: 'Recover saved request' }),
  ).not.toBeInTheDocument()
  expect(localStorage.getItem(deviceKey())).toBe(original)
  mockActor = actor
  view.rerender(<BoundaryReview projectId={project} parcelId={parcel} />)
  await screen.findByRole('button', { name: 'Recover saved request' })
  expect(
    fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST'),
  ).toHaveLength(0)
})
it('preserves an inconsistent device source and refuses to send it', async () => {
  const record = await retainDeviceRequest(),
    bad = JSON.stringify({
      ...record,
      source: {
        ...record.source,
        points: record.source.points.map((p, i) =>
          i === 0 ? { ...p, easting: p.easting + 1 } : p,
        ),
      },
    })
  localStorage.setItem(deviceKey(), bad)
  render(
    <BoundaryReview
      projectId={project}
      parcelId={parcel}
      initialTraverseId={traverse}
    />,
  )
  await screen.findByText(/boundary device record is invalid/)
  expect(
    screen.getByRole('button', { name: 'Download device record' }),
  ).toBeInTheDocument()
  expect(localStorage.getItem(deviceKey())).toBe(bad)
  expect(
    fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST'),
  ).toHaveLength(0)
})
it.each([false, true])(
  'keeps the original device record after unconfirmed or mismatched cancellation (%s)',
  async (mismatched) => {
    const record = await retainDeviceRequest(),
      original = localStorage.getItem(deviceKey())
    fetchMock.mockImplementation(async (url, init) =>
      init?.method === 'POST'
        ? mismatched
          ? reply({
              data: {
                state: 'cancelled',
                actorId: actor,
                projectId: project,
                parcelId: parcel,
                requestId,
                inputHash: 'c'.repeat(64),
              },
            })
          : reply({ error: 'SYNTHETIC cancellation unavailable' }, 503)
        : reply({ data: url.includes('traverse_id=') ? source : directory }),
    )
    render(<BoundaryReview projectId={project} parcelId={parcel} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancel saved request' }),
    )
    await screen.findByRole('alert')
    expect(localStorage.getItem(deviceKey())).toBe(original)
    expect(
      screen.queryByText('Cancellation acknowledged'),
    ).not.toBeInTheDocument()
    expect(record.command.request_id).toBe(requestId)
  },
)
it('requires device locking before sending a new boundary save', async () => {
  Object.defineProperty(navigator, 'locks', {
    value: undefined,
    configurable: true,
  })
  await choose()
  vertices()
  review()
  fireEvent.click(
    screen.getByRole('button', { name: 'Save reviewed boundary draft' }),
  )
  await screen.findByText(/cannot lock a recoverable boundary request/)
  expect(
    fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST'),
  ).toHaveLength(0)
})
it('does not clear a replacement device request when acknowledging an earlier request', async () => {
  const first = await retainDeviceRequest()
  localStorage.removeItem(deviceKey())
  const second = await prepareBoundaryPending(
    project,
    { ...first.command, request_id: id(96), note: 'SYNTHETIC replacement' },
    source,
  )
  const original = localStorage.getItem(deviceKey())
  await expect(
    acknowledgeBoundaryOutcome(first, {
      state: 'cancelled',
      actorId: actor,
      projectId: project,
      parcelId: parcel,
      requestId: first.command.request_id,
      inputHash: first.inputHash,
    }),
  ).rejects.toThrow(/replacement was preserved/)
  expect(localStorage.getItem(deviceKey())).toBe(original)
  expect(second.command.request_id).toBe(id(96))
})
it('retains a boundary request before POST and recovers it after the form is reopened', async () => {
  let beforePost = false,
    original: unknown
  fetchMock.mockImplementation(async (url, init) => {
    if (init?.method === 'POST') {
      beforePost = localStorage.getItem(deviceKey()) !== null
      original = JSON.parse(String(init.body)) as unknown
      throw Error('SYNTHETIC boundary response lost')
    }
    if (url.includes('mode=request')) {
      const value = receipt(original)
      return reply({
        data: {
          state: 'committed',
          actorId: actor,
          projectId: project,
          parcelId: parcel,
          requestId: value.requestId,
          inputHash: value.inputHash,
          receipt: value,
        },
      })
    }
    return reply({ data: url.includes('traverse_id=') ? source : directory })
  })
  const view = render(<BoundaryReview projectId={project} parcelId={parcel} />)
  fireEvent.change(await screen.findByRole('combobox'), {
    target: { value: traverse },
  })
  await screen.findByRole('heading', { name: 'Retained coordinates' })
  vertices()
  review()
  fireEvent.click(
    screen.getByRole('button', { name: 'Save reviewed boundary draft' }),
  )
  await screen.findByText('SYNTHETIC boundary response lost')
  expect(beforePost).toBe(true)
  expect(localStorage.getItem(deviceKey())).not.toBeNull()
  view.unmount()
  render(<BoundaryReview projectId={project} parcelId={parcel} />)
  const recover = await screen.findByRole('button', {
    name: 'Recover saved request',
  })
  await waitFor(() => expect(recover).toBeEnabled())
  fireEvent.click(recover)
  await screen.findByText('Boundary draft saved and acknowledged.')
  expect(localStorage.getItem(deviceKey())).toBeNull()
  expect(
    fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST'),
  ).toHaveLength(1)
})
it('requires a cancellation acknowledgement before clearing an unconfirmed device request', async () => {
  let acknowledge: ((value: Reply) => void) | undefined
  fetchMock.mockImplementation(async (url, init) => {
    if (init?.method === 'POST') {
      if (url.includes('action=cancel'))
        return new Promise<Reply>((resolve) => {
          acknowledge = resolve
        })
      throw Error('SYNTHETIC unconfirmed boundary')
    }
    return reply({ data: url.includes('traverse_id=') ? source : directory })
  })
  await choose()
  vertices()
  review()
  fireEvent.click(
    screen.getByRole('button', { name: 'Save reviewed boundary draft' }),
  )
  await screen.findByText('SYNTHETIC unconfirmed boundary')
  const pending = z
    .object({
      inputHash: z.string(),
      command: z.object({ request_id: z.string() }),
    })
    .parse(JSON.parse(localStorage.getItem(deviceKey()) ?? 'null'))
  const cancel = await screen.findByRole('button', {
    name: 'Cancel saved request',
  })
  await waitFor(() => expect(cancel).toBeEnabled())
  fireEvent.click(cancel)
  await waitFor(() => expect(acknowledge).toBeDefined())
  expect(localStorage.getItem(deviceKey())).not.toBeNull()
  await act(async () => {
    acknowledge?.(
      reply({
        data: {
          state: 'cancelled',
          actorId: actor,
          projectId: project,
          parcelId: parcel,
          requestId: pending.command.request_id,
          inputHash: pending.inputHash,
        },
      }),
    )
  })
  await screen.findByText(/Cancellation acknowledged/)
  expect(localStorage.getItem(deviceKey())).toBeNull()
})
it('keeps source choices and sends nothing if device retention fails', async () => {
  const quota = jest
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw Error('SYNTHETIC boundary device quota')
    })
  try {
    await choose()
    vertices()
    review()
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed boundary draft' }),
    )
    await screen.findByText('SYNTHETIC boundary device quota')
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'POST'),
    ).toBe(false)
    expect(
      screen.getAllByRole('button', { name: /Move vertex \d+ up/ }),
    ).toHaveLength(4)
  } finally {
    quota.mockRestore()
  }
})
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
      ? reply({ data: receipt(JSON.parse(String(init.body)) as unknown) })
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
      return reply({ data: receipt(JSON.parse(String(init.body)) as unknown) })
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
it('retains refused boundary intent until durable cancellation allows a fresh review', async () => {
  await choose()
  vertices()
  review()
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes('action=cancel')) {
      const b = z
        .object({ request_id: z.string(), input_hash: z.string() })
        .parse(JSON.parse(String(init?.body)))
      return reply({
        data: {
          state: 'cancelled',
          actorId: actor,
          projectId: project,
          parcelId: parcel,
          requestId: b.request_id,
          inputHash: b.input_hash,
        },
      })
    }
    return init?.method === 'POST'
      ? reply({ error: 'SYNTHETIC source changed' }, 409)
      : reply({ data: url.includes('traverse_id=') ? source : directory })
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Save reviewed boundary draft' }),
  )
  await screen.findByRole('alert')
  expect(screen.getByRole('button', { name: 'Remove vertex 1' })).toBeDisabled()
  expect(localStorage.getItem(deviceKey())).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel saved request' }))
  await screen.findByText('Cancellation acknowledged')
  expect(localStorage.getItem(deviceKey())).toBeNull()
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
