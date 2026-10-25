import { act, render, screen, waitFor } from '@testing-library/react'
import Portal from '@/components/scheme/PublicParcelDraft'
let currentId = '44444444-4444-4444-8444-444444444444'
jest.mock('next/navigation', () => ({ useParams: () => ({ id: currentId }) }))
const key = 'A'.repeat(43)
const originalFetch = global.fetch,
  fetcher = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>()
const snapshot = {
  protocol: 'parcel-draft-share-v1',
  assessment: 'unverified_draft',
  sourceCrs: 'EPSG:32737',
  sourceHash: 'a'.repeat(64),
  sourceRevision: `scheme:${'q'.repeat(42)}o`,
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
const data = () => ({
  id: currentId,
  createdAt: '2026-10-26T00:00:00Z',
  expiresAt: '2026-11-02T00:00:00Z',
  snapshotHash: 'c'.repeat(64),
  snapshot,
})
const response = (value: unknown, ok = true) =>
  ({ ok, json: async () => value }) as Response
beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-26T12:00:00Z'))
  currentId = '44444444-4444-4444-8444-444444444444'
  window.history.replaceState({}, '', `/p/${currentId}`)
  fetcher.mockReset().mockResolvedValue(response({ data: data() }))
  global.fetch = fetcher
})
afterEach(() => {
  jest.restoreAllMocks()
  global.fetch = originalFetch
})
it('does not request private data or location permission without an explicit sharing key', async () => {
  render(<Portal />)
  await screen.findByRole('heading', { name: 'Shared draft unavailable' })
  expect(fetcher).not.toHaveBeenCalled()
})
it('passes the fragment capability only in the authorization header and shows draft provenance', async () => {
  window.history.replaceState({}, '', `/p/${currentId}#key=${key}`)
  render(<Portal />)
  await screen.findByText('LOT 7')
  const [url, options] = fetcher.mock.calls[0]
  expect(String(url)).toBe(`/api/public/parcel/${currentId}`)
  expect(options).toMatchObject({
    headers: { Authorization: `Bearer ${key}` },
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  })
  expect(
    screen.getByText(/not field verification or an issued survey plan/i),
  ).toBeInTheDocument()
  expect(
    screen.queryByText(
      /Boundary Beacons Fixed|Registered Landowner|Official Survey Extent/,
    ),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('main')).toHaveAttribute('data-sentry-block', 'true')
})
it('rejects a response belonging to a different sharing identity', async () => {
  window.history.replaceState({}, '', `/p/${currentId}#key=${key}`)
  fetcher.mockResolvedValue(
    response({
      data: { ...data(), id: '55555555-5555-4555-8555-555555555555' },
    }),
  )
  render(<Portal />)
  await screen.findByRole('heading', { name: 'Shared draft unavailable' })
  expect(screen.queryByText('LOT 7')).not.toBeInTheDocument()
})
it('discards a late response after changing the sharing identity', async () => {
  window.history.replaceState({}, '', `/p/${currentId}#key=${key}`)
  let finish!: (value: Response) => void
  const oldData = data()
  fetcher.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve
      }),
  )
  const view = render(<Portal />)
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
  currentId = '55555555-5555-4555-8555-555555555555'
  window.history.replaceState({}, '', `/p/${currentId}`)
  view.rerender(<Portal />)
  await act(async () => {
    finish(response({ data: oldData }))
  })
  await screen.findByRole('heading', { name: 'Shared draft unavailable' })
  expect(screen.queryByText('LOT 7')).not.toBeInTheDocument()
})
