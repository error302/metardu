import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import SchemeExportHistory from '@/components/scheme/SchemeExportHistory'
import { schemeExportSourceRevision } from '@/lib/scheme/exportContract'
const actor = '11111111-1111-4111-8111-111111111111',
  project = '33333333-3333-4333-8333-333333333333',
  sourceCrs = 'EPSG:32737',
  sourceHash = 'a'.repeat(64)
const row = (i: number) => ({
  requestId: `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`,
  format: 'geojson',
  outcome: 'committed',
  createdAt: '2026-10-25T00:00:00Z',
  parcelCount: 1,
  sourceHash,
  sourceRevision: schemeExportSourceRevision(sourceHash),
  deliverableId: actor,
  revision: i,
  sourceCrs,
})
const data = (page = 1) => ({
  projectId: project,
  viewerId: actor,
  page,
  pageSize: 24,
  total: 55,
  rows: Array.from({ length: 24 }, (_, i) => row((page - 1) * 24 + i + 1)),
})
const originalFetch = global.fetch,
  fetcher = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>()
const response = (value: unknown, ok = true) =>
  ({ ok, json: async () => value }) as Response
beforeEach(() => {
  fetcher
    .mockReset()
    .mockImplementation(async (url) =>
      response({
        data: data(
          Number(
            new URL(String(url), 'http://127.0.0.1').searchParams.get('page'),
          ),
        ),
      }),
    )
  global.fetch = fetcher
})
afterEach(() => {
  global.fetch = originalFetch
})
it('shows bounded history and a recovery link for the exact old request', async () => {
  render(
    <SchemeExportHistory
      projectId={project}
      viewerId={actor}
      refreshVersion={0}
    />,
  )
  await screen.findByText(
    '55 retained requests for your account in this project.',
  )
  expect(
    screen.getAllByRole('link', { name: 'Recover saved GEOJSON' }),
  ).toHaveLength(24)
  expect(
    screen.getAllByRole('link', { name: 'Recover saved GEOJSON' })[0],
  ).toHaveAttribute(
    'href',
    `/api/scheme/export/geojson?project_id=${project}&request_id=${row(1).requestId}`,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Next exports' }))
  await screen.findByText('Page 2 of 3')
  expect(fetcher.mock.calls.at(-1)?.[0]).toContain('page=2')
  expect(
    screen.getAllByRole('link', { name: 'Recover saved GEOJSON' })[0],
  ).toHaveAttribute(
    'href',
    `/api/scheme/export/geojson?project_id=${project}&request_id=${row(25).requestId}`,
  )
})
it('does not fabricate an empty history after a read failure', async () => {
  fetcher.mockResolvedValue(response({ error: 'History unavailable' }, false))
  render(
    <SchemeExportHistory
      projectId={project}
      viewerId={actor}
      refreshVersion={0}
    />,
  )
  await screen.findByRole('alert')
  expect(screen.queryByText(/0 retained requests/)).not.toBeInTheDocument()
  expect(
    screen.queryByText(
      'No retained exports or cancellations for this account.',
    ),
  ).not.toBeInTheDocument()
  fetcher.mockResolvedValue(
    response({ data: { ...data(), total: 0, rows: [] } }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Reload export history' }))
  await screen.findByText(
    'No retained exports or cancellations for this account.',
  )
})
it('refuses a history response belonging to another account', async () => {
  fetcher.mockResolvedValue(
    response({ data: { ...data(), viewerId: project } }),
  )
  render(
    <SchemeExportHistory
      projectId={project}
      viewerId={actor}
      refreshVersion={0}
    />,
  )
  await screen.findByRole('alert')
  expect(
    screen.queryByRole('link', { name: 'Recover saved GEOJSON' }),
  ).not.toBeInTheDocument()
})
it('does not turn a cancellation into a downloadable or approved artifact', async () => {
  fetcher.mockResolvedValue(
    response({
      data: {
        ...data(),
        total: 1,
        rows: [
          {
            ...row(1),
            outcome: 'cancelled',
            sourceRevision: null,
            deliverableId: null,
            revision: null,
            sourceCrs: null,
          },
        ],
      },
    }),
  )
  render(
    <SchemeExportHistory
      projectId={project}
      viewerId={actor}
      refreshVersion={0}
    />,
  )
  await screen.findByText('Cancelled')
  expect(screen.getByText('No file')).toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: 'Recover saved GEOJSON' }),
  ).not.toBeInTheDocument()
})
it('clears obsolete rows immediately while switching project or account scope', async () => {
  const view = render(
    <SchemeExportHistory
      projectId={project}
      viewerId={actor}
      refreshVersion={0}
    />,
  )
  await screen.findByText(
    '55 retained requests for your account in this project.',
  )
  fetcher.mockImplementation(() => new Promise(() => {}))
  view.rerender(
    <SchemeExportHistory
      projectId={actor}
      viewerId={actor}
      refreshVersion={0}
    />,
  )
  await waitFor(() =>
    expect(
      screen.queryByRole('link', { name: 'Recover saved GEOJSON' }),
    ).not.toBeInTheDocument(),
  )
  view.unmount()
  expect(fetcher.mock.calls.at(-1)?.[1]?.signal?.aborted).toBe(true)
})
