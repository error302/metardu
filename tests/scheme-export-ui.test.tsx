import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from '@testing-library/react'
import SchemeExportReview from '@/components/scheme/SchemeExportReview'
import {
  prepareSchemePending,
  readSchemePending,
  acknowledgeSchemePending,
  type PendingSchemeExport,
} from '@/lib/scheme/exportPending'
import { readSchemeExportReply } from '@/lib/scheme/exportClient'
import { schemeViewport, schemeProject, schemeCrs } from './fixtures/schemeView'
jest.mock('@/components/scheme/SchemeExportHistory', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('@/lib/scheme/exportPending', () => ({
  prepareSchemePending: jest.fn(),
  readSchemePending: jest.fn(),
  acknowledgeSchemePending: jest.fn(),
}))
jest.mock('@/lib/scheme/exportClient', () => ({
  ...jest.requireActual<Record<string, unknown>>('@/lib/scheme/exportClient'),
  readSchemeExportReply: jest.fn(),
}))
const actor = '11111111-1111-4111-8111-111111111111',
  parcel = '44444444-4444-4444-8444-444444444444'
const retained: PendingSchemeExport = {
  version: 1,
  format: 'geojson',
  createdAt: '2026-10-25T00:00:00Z',
  body: {
    projectId: schemeProject,
    expectedUserId: actor,
    requestId: '22222222-2222-4222-8222-222222222222',
    parcelIds: [parcel],
    sourceHash: 'a'.repeat(64),
    reviewed: true,
  },
}
const prepared = jest.mocked(prepareSchemePending),
  read = jest.mocked(readSchemePending),
  ack = jest.mocked(acknowledgeSchemePending),
  reply = jest.mocked(readSchemeExportReply)
const originalFetch = global.fetch,
  originalCreate = URL.createObjectURL,
  originalRevoke = URL.revokeObjectURL
const fetcher = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>()
const json = (data: unknown, ok = true) =>
  ({ ok, json: async () => data }) as Response
function preview() {
  const source = schemeViewport()
  return {
    viewerId: actor,
    sourceHash: 'a'.repeat(64),
    sourceRevision: `scheme:${'A'.repeat(43)}`,
    source: { ...source, bbox: null, selection: [parcel] },
  }
}
function cancelled() {
  return {
    outcome: 'cancelled' as const,
    projectId: schemeProject,
    actorId: actor,
    requestId: retained.body.requestId,
    requestHash: 'b'.repeat(64),
    sourceHash: retained.body.sourceHash,
    format: 'geojson' as const,
  }
}
beforeEach(() => {
  jest.useFakeTimers()
  prepared.mockReset().mockResolvedValue(retained)
  read.mockReset().mockReturnValue(null)
  ack.mockReset().mockResolvedValue(true)
  reply.mockReset()
  fetcher
    .mockReset()
    .mockImplementation(async (url) =>
      json({
        data: String(url).includes('parcel_id=')
          ? preview()
          : {
              viewerId: actor,
              projectId: schemeProject,
              storageReady: true,
              selectionLimit: 50,
            },
      }),
    )
  global.fetch = fetcher
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: jest.fn(() => 'blob:owned-scheme-fixture'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: jest.fn(),
  })
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  jest.runOnlyPendingTimers()
  jest.useRealTimers()
  global.fetch = originalFetch
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: originalCreate,
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: originalRevoke,
  })
  jest.restoreAllMocks()
})
async function load() {
  render(<SchemeExportReview projectId={schemeProject} parcelIds={[parcel]} />)
  await screen.findByRole('heading', { name: 'SYNTHETIC geometry' })
}
it('requires review of the exact selection and labels both output references', async () => {
  await load()
  expect(
    screen.getByRole('button', { name: 'Generate registered draft' }),
  ).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  expect(
    screen.getByRole('button', { name: 'Generate registered draft' }),
  ).toBeEnabled()
  fireEvent.change(screen.getByLabelText('Output format'), {
    target: { value: 'geojson' },
  })
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  expect(
    screen.getByText(/Local transformation accuracy is unverified/),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'Registered outputs' }),
  ).toHaveAttribute('href', `/project/${schemeProject}/deliver`)
})
it('does not transmit when durable device preparation fails', async () => {
  await load()
  prepared.mockRejectedValue(new Error('Device could not retain the request'))
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(
    screen.getByRole('button', { name: 'Generate registered draft' }),
  )
  await screen.findByRole('alert')
  expect(fetcher.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(
    false,
  )
  expect(reply).not.toHaveBeenCalled()
  expect(URL.createObjectURL).not.toHaveBeenCalled()
})
it('retains failed retries with the same nonce and offers recovery or cancellation', async () => {
  read.mockReturnValue(retained)
  reply.mockRejectedValue(new Error('Retained file unavailable'))
  await load()
  fireEvent.click(screen.getByRole('button', { name: 'Retry same request' }))
  await screen.findByRole('alert')
  const post = fetcher.mock.calls.find(([, init]) => init?.method === 'POST')
  expect(JSON.parse(String(post?.[1]?.body))).toEqual(retained.body)
  expect(ack).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Retained export request')).toBeInTheDocument()
  expect(URL.createObjectURL).not.toHaveBeenCalled()
})
it('recovers a durable cancellation without generating or downloading another artifact', async () => {
  read.mockReturnValueOnce(retained).mockReturnValue(null)
  reply.mockResolvedValue(cancelled())
  await load()
  fireEvent.click(
    screen.getByRole('button', { name: 'Recover registered result' }),
  )
  await screen.findByText(/request is durably cancelled/)
  await waitFor(() =>
    expect(
      screen.queryByLabelText('Retained export request'),
    ).not.toBeInTheDocument(),
  )
  expect(
    fetcher.mock.calls.some(([url]) =>
      String(url).includes(`request_id=${retained.body.requestId}`),
    ),
  ).toBe(true)
  expect(fetcher.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(
    false,
  )
  expect(ack).toHaveBeenCalledWith(retained)
  expect(URL.createObjectURL).not.toHaveBeenCalled()
})
it('cancellation can recover an already committed file and acknowledge that exact request', async () => {
  read.mockReturnValueOnce(retained).mockReturnValue(null)
  reply.mockResolvedValue({
    outcome: 'committed',
    bytes: new Uint8Array([1, 2]),
    filename: `boundary-drafts-${retained.body.requestId}.geojson`,
    contentHash: 'c'.repeat(64),
    deliverableId: actor,
    revisionId: schemeProject,
    revision: 1,
    sourceCrs: schemeCrs,
    outputCrs: 'EPSG:4326',
  })
  await load()
  fireEvent.click(
    screen.getByRole('button', { name: 'Cancel unconfirmed request' }),
  )
  await screen.findByText(/download initiated/)
  expect(
    fetcher.mock.calls.some(([url]) => String(url).endsWith('?action=cancel')),
  ).toBe(true)
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(ack).toHaveBeenCalledWith(retained))
})
it('does not download or clear recovery after the page is unmounted', async () => {
  let finish:
    | ((value: Awaited<ReturnType<typeof readSchemeExportReply>>) => void)
    | undefined
  read.mockReturnValue(retained)
  reply.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const view = render(
    <SchemeExportReview projectId={schemeProject} parcelIds={[parcel]} />,
  )
  await screen.findByRole('heading', { name: 'SYNTHETIC geometry' })
  fireEvent.click(
    screen.getByRole('button', { name: 'Recover registered result' }),
  )
  await waitFor(() => expect(reply).toHaveBeenCalledTimes(1))
  view.unmount()
  if (!finish) throw new Error('Expected pending recovery.')
  await act(async () => {
    finish?.(cancelled())
  })
  expect(ack).not.toHaveBeenCalled()
  expect(URL.createObjectURL).not.toHaveBeenCalled()
  expect(fetcher.mock.calls.at(-1)?.[1]?.signal?.aborted).toBe(true)
})
it('shows source failures without fabricating empty successful geometry', async () => {
  fetcher.mockImplementation(async (url) =>
    String(url).includes('parcel_id=')
      ? json({ error: 'Boundary evidence changed' }, false)
      : json({
          data: {
            viewerId: actor,
            projectId: schemeProject,
            storageReady: true,
            selectionLimit: 50,
          },
        }),
  )
  render(<SchemeExportReview projectId={schemeProject} parcelIds={[parcel]} />)
  await screen.findByRole('alert')
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Boundary evidence changed',
  )
  expect(
    screen.queryByRole('button', { name: 'Generate registered draft' }),
  ).not.toBeInTheDocument()
})

it('prepares a durable new request and downloads only its acknowledged registered result',async()=>{prepared.mockImplementation(async(body,format)=>({...retained,body,format}));reply.mockImplementation(async(_response,command)=>({outcome:'committed',bytes:new Uint8Array([1,2]),filename:`boundary-drafts-${command.body.requestId}.${command.format}`,contentHash:'c'.repeat(64),deliverableId:actor,revisionId:schemeProject,revision:1,sourceCrs:schemeCrs,outputCrs:schemeCrs}));await load();fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Generate registered draft'}));await screen.findByText(/download initiated/);expect(prepared).toHaveBeenCalledTimes(1);const call=fetcher.mock.calls.find(([,init])=>init?.method==='POST');const body=JSON.parse(String(call?.[1]?.body)) as Record<string,unknown>;expect(body.expectedUserId).toBe(actor);expect(body.projectId).toBe(schemeProject);expect(body.parcelIds).toEqual([parcel]);expect(body.sourceHash).toBe('a'.repeat(64));expect(body.reviewed).toBe(true);expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);await waitFor(()=>expect(ack).toHaveBeenCalledTimes(1))})