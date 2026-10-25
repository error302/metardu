import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ParcelDraftSharing from '@/components/scheme/ParcelDraftSharing'
import { readParcelSharePending } from '@/lib/scheme/parcelShareDevice'
import {
  parcelShareCommandSchema,
  type ParcelShareCommand,
} from '@/lib/scheme/parcelShareContract'
const actor = '11111111-1111-4111-8111-111111111111',
  project = '33333333-3333-4333-8333-333333333333',
  exported = '44444444-4444-4444-8444-444444444444'
const snapshot = {
  protocol: 'parcel-draft-share-v1',
  assessment: 'unverified_draft',
  sourceCrs: 'EPSG:32737',
  sourceHash: 'a'.repeat(64),
  sourceRevision: `scheme:${'A'.repeat(43)}`,
  artifactHash: 'b'.repeat(64),
  exportRevision: 2,
  dimensions: 2,
  heights: 'not provided',
  professionalApproval: false,
  fieldVerified: false,
  parcels: [
    {
      label: 'LOT 7',
      gridAreaSqM: 200,
      coordinates: [
        [
          [39, -4],
          [39.001, -4],
          [39.001, -3.999],
          [39, -4],
        ],
      ],
    },
  ],
}
const preview = {
  projectId: project,
  viewerId: actor,
  exportRequestId: exported,
  snapshotHash: 'c'.repeat(64),
  snapshot,
}
const history = {
  projectId: project,
  viewerId: actor,
  page: 1,
  total: 0,
  rows: [],
}
const receipt = (body: ParcelShareCommand) => ({
  id: body.requestId,
  projectId: body.projectId,
  viewerId: body.expectedUserId,
  exportRequestId: body.exportRequestId,
  snapshotHash: body.snapshotHash,
  createdAt: '2026-10-26T00:00:00Z',
  expiresAt: '2026-11-02T00:00:00Z',
  revokedAt: null,
})
const originalFetch = global.fetch,
  fetcher = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>()
const json = (data: unknown) =>
  ({ ok: true, json: async () => ({ data }) }) as Response
beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-26T12:00:00Z'))
  localStorage.clear()
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (_name: string, work: () => Promise<unknown>) => work(),
    },
  })
  fetcher
    .mockReset()
    .mockImplementation(async (url, init) =>
      init?.method === 'POST'
        ? json(
            receipt(
              parcelShareCommandSchema.parse(
                JSON.parse(String(init.body)) as unknown,
              ),
            ),
          )
        : json(String(url).includes('mode=preview') ? preview : history),
    )
  global.fetch = fetcher
})
afterEach(() => {
  global.fetch = originalFetch
  jest.restoreAllMocks()
})
const show = () =>
  render(
    <ParcelDraftSharing
      projectId={project}
      viewerId={actor}
      exportRequestId={exported}
    />,
  )
async function review() {
  await screen.findByText('LOT 7')
  fireEvent.click(screen.getByRole('checkbox'))
}
it('requires disclosure review and explicit authority before creating an access link', async () => {
  show()
  await screen.findByText('LOT 7')
  expect(
    screen.getByRole('button', { name: 'Create expiring review link' }),
  ).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  expect(
    screen.getByRole('button', { name: 'Create expiring review link' }),
  ).toBeEnabled()
  expect(
    fetcher.mock.calls.some(([_url, init]) => init?.method === 'POST'),
  ).toBe(false)
})
it('retains the exact key before transmission and exposes only the acknowledged share link', async () => {
  let sent!: ParcelShareCommand
  fetcher.mockImplementation(async (url, init) => {
    if (init?.method !== 'POST')
      return json(String(url).includes('mode=preview') ? preview : history)
    sent = parcelShareCommandSchema.parse(
      JSON.parse(String(init.body)) as unknown,
    )
    expect(readParcelSharePending(actor, project)).toEqual(sent)
    return json(receipt(sent))
  })
  show()
  await review()
  fireEvent.click(
    screen.getByRole('button', { name: 'Create expiring review link' }),
  )
  const link = await screen.findByRole('link', { name: 'Open shared draft' })
  expect(link).toHaveAttribute(
    'href',
    `${window.location.origin}/p/${sent.requestId}#key=${sent.key}`,
  )
  expect(sent.key).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(sent.requestId).not.toBe(project)
})
it('recovers a lost creation response after remount using the same request and key', async () => {
  let sent!: ParcelShareCommand
  fetcher.mockImplementation(async (url, init) => {
    if (init?.method !== 'POST')
      return json(String(url).includes('mode=preview') ? preview : history)
    const body = JSON.parse(String(init.body)) as ParcelShareCommand
    if (!sent) {
      sent = body
      throw new Error('Synthetic response loss')
    }
    expect(body).toEqual(sent)
    return json(receipt(body))
  })
  const view = show()
  await review()
  fireEvent.click(
    screen.getByRole('button', { name: 'Create expiring review link' }),
  )
  await screen.findByText('Synthetic response loss')
  view.unmount()
  show()
  fireEvent.click(
    await screen.findByRole('button', { name: 'Retry or recover link' }),
  )
  expect(
    await screen.findByRole('link', { name: 'Open shared draft' }),
  ).toHaveAttribute(
    'href',
    `${window.location.origin}/p/${sent.requestId}#key=${sent.key}`,
  )
})
it('refuses a foreign preview and history without showing foreign geometry or enabling creation', async () => {
  fetcher.mockImplementation(async (url) =>
    json(
      String(url).includes('mode=preview')
        ? { ...preview, viewerId: exported }
        : { ...history, viewerId: exported },
    ),
  )
  show()
  await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2))
  expect(screen.queryByText('LOT 7')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Create expiring review link' }),
  ).not.toBeInTheDocument()
})
it('does not transmit when durable device storage fails', async () => {
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Synthetic storage failure')
  })
  show()
  await review()
  fireEvent.click(
    screen.getByRole('button', { name: 'Create expiring review link' }),
  )
  await screen.findByText('Synthetic storage failure')
  expect(
    fetcher.mock.calls.some(([_url, init]) => init?.method === 'POST'),
  ).toBe(false)
})
it('discards a late acknowledgement after changing project scope and preserves recovery for the original account', async () => {
  let sent!: ParcelShareCommand, finish!: (value: Response) => void
  fetcher.mockImplementation(async (url, init) => {
    if (init?.method !== 'POST')
      return json(String(url).includes('mode=preview') ? preview : history)
    sent = parcelShareCommandSchema.parse(
      JSON.parse(String(init.body)) as unknown,
    )
    return new Promise<Response>((resolve) => {
      finish = resolve
    })
  })
  const view = show()
  await review()
  fireEvent.click(
    screen.getByRole('button', { name: 'Create expiring review link' }),
  )
  await waitFor(() => expect(sent).toBeDefined())
  view.rerender(<ParcelDraftSharing projectId={exported} viewerId={actor} />)
  await act(async () => {
    finish(json(receipt(sent)))
  })
  expect(
    screen.queryByRole('link', { name: 'Open shared draft' }),
  ).not.toBeInTheDocument()
  expect(readParcelSharePending(actor, project)?.requestId).toBe(sent.requestId)
})
it('does not expose a link when the creation acknowledgement changes its source identity', async () => {
  fetcher.mockImplementation(async (url, init) =>
    init?.method === 'POST'
      ? json({
          ...receipt(
            parcelShareCommandSchema.parse(
              JSON.parse(String(init.body)) as unknown,
            ),
          ),
          snapshotHash: 'd'.repeat(64),
        })
      : json(String(url).includes('mode=preview') ? preview : history),
  )
  show()
  await review()
  fireEvent.click(
    screen.getByRole('button', { name: 'Create expiring review link' }),
  )
  await screen.findByText(
    /server did not acknowledge this exact sharing request/,
  )
  expect(
    screen.queryByRole('link', { name: 'Open shared draft' }),
  ).not.toBeInTheDocument()
  expect(readParcelSharePending(actor, project)).not.toBeNull()
})
it('revokes an exact history record and does not treat a changed acknowledgement as revocation', async () => {
  const body: ParcelShareCommand = {
    projectId: project,
    expectedUserId: actor,
    requestId: '55555555-5555-4555-8555-555555555555',
    exportRequestId: exported,
    snapshotHash: preview.snapshotHash,
    durationDays: 7,
    authorityToShare: true,
    key: 'A'.repeat(43),
  }
  const row = receipt(body)
  let revoked = false,
    mismatch = true
  fetcher.mockImplementation(async (url, init) => {
    if (init?.method === 'POST') {
      if (mismatch)
        return json({
          ...row,
          expiresAt: '2026-11-25T00:00:00Z',
          revokedAt: '2026-10-26T12:00:00Z',
        })
      revoked = true
      return json({ ...row, revokedAt: '2026-10-26T12:00:00Z' })
    }
    return json(
      String(url).includes('mode=preview')
        ? preview
        : {
            ...history,
            total: 1,
            rows: [
              { ...row, revokedAt: revoked ? '2026-10-26T12:00:00Z' : null },
            ],
          },
    )
  })
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Revoke link' }))
  await screen.findByText(/Revocation was not acknowledged exactly/)
  expect(screen.queryByText(/Link revoked\./)).not.toBeInTheDocument()
  mismatch = false
  fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))
  await screen.findByText(
    'Link revoked. Previously saved recipient copies cannot be recalled.',
  )
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Revoke link' })).toBeDisabled(),
  )
})
it('removes a settled device key without silently revoking or duplicating its grant', async () => {
  show()
  await review()
  fireEvent.click(
    screen.getByRole('button', { name: 'Create expiring review link' }),
  )
  await screen.findByRole('link', { name: 'Open shared draft' })
  fireEvent.click(
    screen.getByRole('button', { name: 'Remove key from this device' }),
  )
  await waitFor(() =>
    expect(
      screen.queryByRole('link', { name: 'Open shared draft' }),
    ).not.toBeInTheDocument(),
  )
  expect(readParcelSharePending(actor, project)).toBeNull()
  expect(
    fetcher.mock.calls.filter(([_url, init]) => init?.method === 'POST'),
  ).toHaveLength(1)
})
