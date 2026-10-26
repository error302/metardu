import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createHash, webcrypto } from 'node:crypto'
import TraverseComputePanel from '@/components/scheme/TraverseComputePanel'
import { canonicalJSON } from '@/lib/audit/auditHash'
import {
  computeRetainedTraverse,
  TRAVERSE_ENGINE,
  traverseCommandSchema,
  cancelTraverseSchema,
  type TraverseCommand,
} from '@/lib/scheme/traverseContract'
import { z } from 'zod'

const ACTOR = '11111111-1111-4111-8111-111111111111',
  PROJECT = '22222222-2222-4222-8222-222222222222',
  PARCEL = '33333333-3333-4333-8333-333333333333'
const REVISION = '44444444-4444-4444-8444-444444444444',
  TRAVERSE = '55555555-5555-4555-8555-555555555555'
let mockActor = ACTOR
jest.mock('next-auth/react', () => ({
  useSession: () => ({
    status: 'authenticated',
    data: { user: { id: mockActor } },
  }),
}))
const originalFetch = global.fetch,
  originalCrypto = global.crypto
const fetchMock = jest.fn<Promise<Response>, [string, RequestInit?]>()
const SYNTHETIC_CRS = 'EPSG:32737'
const deviceRecordSchema = z.object({ body: traverseCommandSchema })
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
const frame = () => ({
  actorId: ACTOR,
  projectId: PROJECT,
  parcelId: PARCEL,
  evidenceHash: 'a'.repeat(64),
  latestRevisionId: null,
  sourceCrs: SYNTHETIC_CRS,
  adoptedFactor: '1',
  verticalDatum: null,
  prerequisites: [],
  storageReady: true,
})
const initial = () => ({
  context: frame(),
  revisions: [],
  beforeOrdinal: null,
  nextBeforeOrdinal: null,
  hasMore: false,
  selected: null,
})
const response = (data: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  }) as Response
function packet(body: TraverseCommand) {
  const result = computeRetainedTraverse(body)
  const sourceHash = digest(
    canonicalJSON({
      source: body.source,
      provenance: body.provenance,
      control: body.control,
      observations: body.observations,
    }),
  )
  return {
    input: body,
    result,
    currentReferenceMatches: true,
    receipt: {
      state: 'committed',
      requestId: body.requestId,
      actorId: ACTOR,
      projectId: PROJECT,
      parcelId: PARCEL,
      inputHash: digest(canonicalJSON(body)),
      revisionId: REVISION,
      traverseId: TRAVERSE,
      ordinal: 1,
      engineVersion: TRAVERSE_ENGINE,
      sourceHash,
      resultHash: digest(canonicalJSON(result)),
      referenceHash: 'b'.repeat(64),
      requestHash: digest(JSON.stringify(body)),
      coordinateIds: [
        '66666666-6666-4666-8666-666666666666',
        '77777777-7777-4777-8777-777777777777',
      ],
      observationIds: ['88888888-8888-4888-8888-888888888888'],
      createdAt: '2026-10-26T00:00:00.123456Z',
      status: 'draft_unverified',
    },
  }
}
const mount = () =>
  render(<TraverseComputePanel parcelId={PARCEL} {...{ projectId: PROJECT }} />)
const pendingTexts = () =>
  Object.keys(localStorage)
    .filter((k) => k.startsWith('metardu:retained-traverse:'))
    .map((k) => localStorage.getItem(k) ?? '')
async function clickReady(name: string) {
  const button = await screen.findByRole('button', { name })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button)
}
async function fill() {
  await screen.findByText(SYNTHETIC_CRS)
  const set = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  set('Revision name', 'SYNTHETIC new field set')
  set('Opening station', 'QA_A')
  set('Opening easting (m)', '0500000.0000')
  set('Opening northing (m)', '9500000.0000')
  set('Backsight degrees', '0')
  set('Backsight minutes', '0')
  set('Backsight seconds', '0')
  set('Distance reduction reference', 'Explicit SYNTHETIC project factor')
  set('Target station 1', 'QA_B')
  for (const label of [
    'Face left degrees 1',
    'Face left minutes 1',
    'Face left seconds 1',
    'Face right minutes 1',
    'Face right seconds 1',
    'Zenith minutes 1',
    'Zenith seconds 1',
  ])
    set(label, '0')
  set('Face right degrees 1', '180')
  set('Slope distance 1', '0100.0000')
  set('Zenith degrees 1', '90')
  fireEvent.click(screen.getByLabelText(/I reviewed original observations/))
}
beforeEach(() => {
  localStorage.clear()
  mockActor = ACTOR
  fetchMock.mockReset()
  global.fetch = fetchMock as typeof fetch
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  })
  Object.defineProperty(navigator, 'locks', {
    value: { request: async (_name: string, work: () => unknown) => work() },
    configurable: true,
  })
  fetchMock.mockResolvedValue(response({ data: initial() }))
})
afterEach(() => {
  global.fetch = originalFetch
  Object.defineProperty(globalThis, 'crypto', {
    value: originalCrypto,
    configurable: true,
  })
})

it('shows a read failure and retry instead of claiming there is no saved traverse', async () => {
  fetchMock.mockResolvedValue(
    response({ error: 'SYNTHETIC retained storage unavailable' }, 503),
  )
  mount()
  await screen.findByRole('alert')
  expect(
    screen.getByText(/SYNTHETIC retained storage unavailable/),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Retry loading traverse' }),
  ).toBeInTheDocument()
})
it('loads the explicit project frame and leaves unknown heights unentered', async () => {
  mount()
  await screen.findByText(SYNTHETIC_CRS)
  expect(screen.getByLabelText('Instrument height 1')).toHaveValue('')
  expect(screen.getByLabelText('Target height 1')).toHaveValue('')
  expect(fetchMock.mock.calls[0][0]).toContain('project_id=' + PROJECT)
  expect(fetchMock.mock.calls[0][0]).toContain('expected_user_id=' + ACTOR)
})
it('durably retains the exact request before POST and keeps an unconfirmed request recoverable', async () => {
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = traverseCommandSchema.parse(JSON.parse(String(init.body)))
      expect(
        pendingTexts().some(
          (t) =>
            deviceRecordSchema.parse(JSON.parse(t)).body.requestId ===
            body.requestId,
        ),
      ).toBe(true)
      throw Error('SYNTHETIC lost acknowledgement')
    }
    return response({ data: initial() })
  })
  mount()
  await fill()
  fireEvent.click(screen.getByRole('button', { name: 'Retain computation' }))
  await screen.findByText(/SYNTHETIC lost acknowledgement/)
  expect(pendingTexts()).toHaveLength(1)
  const body = deviceRecordSchema.parse(JSON.parse(pendingTexts()[0])).body
  expect(body.control.openingEasting).toBe('0500000.0000')
  expect(body.observations[0].slopeDist).toBe('0100.0000')
  expect(body.observations[0].ih).toBe('')
  expect(
    screen.getByRole('button', { name: 'Recover receipt' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Retry original save' }),
  ).toBeInTheDocument()
})
it('retries the original request ID and clears only its acknowledged device record', async () => {
  let calls = 0,
    firstId = '',
    saved: ReturnType<typeof packet> | undefined
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = traverseCommandSchema.parse(JSON.parse(String(init.body)))
      calls++
      if (calls === 1) {
        firstId = body.requestId
        throw Error('SYNTHETIC interrupted response')
      }
      expect(body.requestId).toBe(firstId)
      saved = packet(body)
      return response({ data: saved })
    }
    return response({ data: initial() })
  })
  mount()
  await fill()
  fireEvent.click(screen.getByRole('button', { name: 'Retain computation' }))
  await screen.findByText(/SYNTHETIC interrupted response/)
  await clickReady('Retry original save')
  await screen.findByText(/Retained revision 1/)
  await waitFor(() => expect(pendingTexts()).toHaveLength(0))
  expect(calls).toBe(2)
  expect(saved?.input.observations[0].ih).toBe('')
  expect(
    screen.getByRole('link', { name: 'Review boundary vertices' }),
  ).toHaveAttribute(
    'href',
    '/project/' +
      PROJECT +
      '/scheme/boundary-review?parcel=' +
      PARCEL +
      '&traverse=' +
      TRAVERSE,
  )
})
it('uses a cancellation receipt before discarding an uncommitted device intent', async () => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      if (url.includes('action=cancel')) {
        const body = cancelTraverseSchema.parse(JSON.parse(String(init.body)))
        return response({
          data: {
            state: 'cancelled',
            actorId: ACTOR,
            projectId: PROJECT,
            parcelId: PARCEL,
            requestId: body.requestId,
            inputHash: body.inputHash,
          },
        })
      }
      throw Error('SYNTHETIC offline save')
    }
    return response({ data: initial() })
  })
  mount()
  await fill()
  fireEvent.click(screen.getByRole('button', { name: 'Retain computation' }))
  await screen.findByText(/SYNTHETIC offline save/)
  await clickReady('Cancel request')
  await screen.findByText(/Cancellation acknowledged/)
  expect(pendingTexts()).toHaveLength(0)
})
it('does not send a computation when the device cannot retain its request', async () => {
  const write = jest
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw Error('SYNTHETIC device quota')
    })
  try {
    mount()
    await fill()
    fireEvent.click(screen.getByRole('button', { name: 'Retain computation' }))
    await screen.findByRole('alert')
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'POST'),
    ).toBe(false)
    expect(screen.getByLabelText('Slope distance 1')).toHaveValue('0100.0000')
  } finally {
    write.mockRestore()
  }
})
it('preserves an unconfirmed request when a response contains a mismatched result hash', async () => {
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const saved = packet(
        traverseCommandSchema.parse(JSON.parse(String(init.body))),
      )
      saved.receipt.resultHash = 'f'.repeat(64)
      return response({ data: saved })
    }
    return response({ data: initial() })
  })
  mount()
  await fill()
  fireEvent.click(screen.getByRole('button', { name: 'Retain computation' }))
  await screen.findByRole('alert')
  expect(pendingTexts()).toHaveLength(1)
  expect(screen.queryByText(/Retained revision 1/)).not.toBeInTheDocument()
})
it('keeps a revision in its original reference read-only after the project frame changes', async () => {
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const saved = packet(
        traverseCommandSchema.parse(JSON.parse(String(init.body))),
      )
      saved.currentReferenceMatches = false
      return response({ data: saved })
    }
    return response({ data: initial() })
  })
  mount()
  await fill()
  fireEvent.click(screen.getByRole('button', { name: 'Retain computation' }))
  await screen.findByText(/Retained revision 1/)
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Edit as new revision' }),
    ).toBeDisabled(),
  )
})
it('ignores an original-file read after the observation editor has been replaced', async () => {
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? response({
          data: packet(
            traverseCommandSchema.parse(JSON.parse(String(init.body))),
          ),
        })
      : response({ data: initial() }),
  )
  mount()
  await fill()
  fireEvent.click(screen.getByRole('button', { name: 'Retain computation' }))
  await screen.findByText(/Retained revision 1/)
  let finishRead: ((value: ArrayBuffer) => void) | undefined
  const file = new File(['abc'], 'SYNTHETIC-original.txt')
  Object.defineProperty(file, 'arrayBuffer', {
    value: () =>
      new Promise<ArrayBuffer>((resolve) => {
        finishRead = resolve
      }),
  })
  // Finish the prior acknowledgement before starting a separate source-file read.
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Edit as new revision' }),
    ).toBeEnabled(),
  )
  fireEvent.click(screen.getByText('Source file and provenance'))
  fireEvent.change(screen.getByLabelText('Original field file'), {
    target: { files: [file] },
  })
  await clickReady('Edit as new revision')
  fireEvent.change(screen.getByLabelText('Revision name'), {
    target: { value: 'SYNTHETIC current form owns this edit' },
  })
  if (!finishRead) throw Error('The synthetic file read did not start.')
  await act(async () => {
    finishRead?.(new Uint8Array([1, 2, 3]).buffer)
    await Promise.resolve()
  })
  expect(screen.getByLabelText('Revision name')).toHaveValue(
    'SYNTHETIC current form owns this edit',
  )
})
it('does not discard malformed local evidence or overwrite it with a new request', async () => {
  localStorage.setItem(
    'metardu:retained-traverse:v1:' + ACTOR + ':' + PROJECT + ':' + PARCEL,
    '{original malformed data',
  )
  mount()
  await screen.findByRole('alert')
  expect(pendingTexts()[0]).toBe('{original malformed data')
  expect(
    screen.getByRole('button', { name: 'Download device record' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Retain computation' }),
  ).toBeDisabled()
})
it('keeps a request recoverable when no final receipt is found', async () => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') throw Error('SYNTHETIC disconnected')
    if (url.includes('request_id='))
      return response(
        { error: 'No final receipt exists for this request and account.' },
        404,
      )
    return response({ data: initial() })
  })
  mount()
  await fill()
  fireEvent.click(screen.getByRole('button', { name: 'Retain computation' }))
  await screen.findByText('SYNTHETIC disconnected')
  const original = pendingTexts()[0]
  await clickReady('Recover receipt')
  await screen.findByText(/No final receipt exists/)
  expect(pendingTexts()).toEqual([original])
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Retry original save' }),
    ).toBeEnabled(),
  )
})
it('recovers a committed artifact after the original acknowledgement was lost', async () => {
  let saved: ReturnType<typeof packet>
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      saved = packet(traverseCommandSchema.parse(JSON.parse(String(init.body))))
      throw Error('SYNTHETIC committed response lost')
    }
    if (url.includes('request_id='))
      return response({ data: { outcome: saved.receipt } })
    return response({
      data: {
        ...initial(),
        selected: url.includes('revision_id=') ? saved : null,
      },
    })
  })
  mount()
  await fill()
  fireEvent.click(screen.getByRole('button', { name: 'Retain computation' }))
  await screen.findByText('SYNTHETIC committed response lost')
  await clickReady('Recover receipt')
  await screen.findByText(/Retained revision 1/)
  expect(pendingTexts()).toHaveLength(0)
  expect(
    fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST'),
  ).toHaveLength(1)
})
it('does not clear a request for another cancellation identity', async () => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      if (!url.includes('action=cancel'))
        throw Error('SYNTHETIC network failure')
      const b = cancelTraverseSchema.parse(JSON.parse(String(init.body)))
      return response({
        data: {
          state: 'cancelled',
          actorId: ACTOR,
          projectId: PROJECT,
          parcelId: PARCEL,
          requestId: REVISION,
          inputHash: b.inputHash,
        },
      })
    }
    return response({ data: initial() })
  })
  mount()
  await fill()
  fireEvent.click(screen.getByRole('button', { name: 'Retain computation' }))
  await screen.findByText('SYNTHETIC network failure')
  const original = pendingTexts()[0]
  await clickReady('Cancel request')
  await screen.findByText(/acknowledgement does not match/)
  expect(pendingTexts()).toEqual([original])
})
it('resets private inputs when the signed-in account changes and ignores a late read', async () => {
  const view = mount()
  await fill()
  mockActor = '99999999-9999-4999-8999-999999999999'
  view.rerender(<TraverseComputePanel projectId={PROJECT} parcelId={PARCEL} />)
  await screen.findByText(/does not match the current account/)
  expect(screen.getByLabelText('Revision name')).toHaveValue('')
  expect(screen.queryByText(/Retained revision 1/)).not.toBeInTheDocument()
})
it('keeps pending source across closing and reopening the parcel form', async () => {
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') throw Error('SYNTHETIC offline')
    return response({ data: initial() })
  })
  const first = mount()
  await fill()
  fireEvent.click(screen.getByRole('button', { name: 'Retain computation' }))
  await screen.findByText('SYNTHETIC offline')
  const original = pendingTexts()[0]
  first.unmount()
  mount()
  await screen.findByRole('button', { name: 'Recover receipt' })
  expect(pendingTexts()).toEqual([original])
  expect(
    screen.getByRole('button', { name: 'Retain computation' }),
  ).toBeDisabled()
})
it('requires a new observation review after the project frame is refreshed', async () => {
  mount()
  await fill()
  expect(
    screen.getByRole('button', { name: 'Retain computation' }),
  ).toBeEnabled()
  fetchMock.mockResolvedValue(
    response({ error: 'SYNTHETIC project changed' }, 409),
  )
  // A failed save leaves the original request recoverable; a failed context
  // read must never enable a different command against the last known frame.
  fireEvent.click(screen.getByRole('button', { name: 'Retain computation' }))
  await screen.findByText('SYNTHETIC project changed')
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry loading traverse' }),
  )
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Retain computation' }),
    ).toBeDisabled(),
  )
})
