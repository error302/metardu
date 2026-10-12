/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PublicControlCatalog } from '@/components/beacons/PublicControlCatalog'
import { PublicControlSubmission } from '@/components/beacons/PublicControlSubmission'
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role: 'surveyor' } } }) }))
jest.mock('next/dynamic', () => () => () => null)
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
function response(body: unknown, status = 200) {
  const result = new Response(JSON.stringify(body), { status })
  Object.defineProperty(result, 'ok', { value: status >= 200 && status < 300 })
  return result
}
const project = { id: '00000000-0000-4000-8000-000000000001', name: 'Synthetic owned project', horizontalCrs: 'EPSG:21037', verticalDatum: 'Synthetic BM' }
const source = { id: '00000000-0000-4000-8000-000000000002', name: 'SYN-CONTROL', beacon_type: 'control', easting: 500000.01234, northing: 9800000.05678, elevation: 0, horizontal_crs: 'EPSG:21037', vertical_datum: 'Synthetic BM', source_reference: 'Synthetic source sheet', authority: 'Synthetic publisher', country: 'Kenya', status: 'verified' }
test('published zero and explicit reference reach the real submission contract', async () => {
  const fetchMock = jest.fn(async () => response({ data: { beacon: { status: 'pending' } } }, 201))
  globalThis.fetch = fetchMock
  render(<PublicControlSubmission />)
  for (const [label, value] of [['Reference name', 'SYN-CONTROL'], ['Published horizontal grid (EPSG code)', 'EPSG:21037'], ['Published easting (m)', '500000.01234'], ['Published northing (m)', '9800000.05678'], ['Published height (m, optional)', '0'], ['Published vertical datum', 'Synthetic BM'], ['Source document, sheet, revision or publication reference', 'Synthetic source sheet'], ['Source publisher or authority', 'Synthetic publisher'], ['Country', 'Kenya']]) fireEvent.change(screen.getByLabelText(label), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit for catalogue review' }))
  await screen.findByText('Submission recorded for independent catalogue review.')
  const call = (fetchMock as jest.Mock).mock.calls[0] as [string, RequestInit]
  expect(call[0]).toBe('/api/public-beacons')
  expect(JSON.parse(String(call[1].body))).toMatchObject({ elevation: 0, horizontalCrs: 'EPSG:21037', verticalDatum: 'Synthetic BM' })
  expect(JSON.parse(String(call[1].body))).not.toHaveProperty('status')
})
test('catalogue imports keep a retry identity and direct the surveyor to their control register', async () => {
  const imports: Array<Record<string, unknown>> = []
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    if (String(input).includes('/api/beacons/projects?')) return response({ data: { projects: [project], nextCursor: null } })
    if (String(input).includes('/import')) { imports.push(JSON.parse(String(options?.body)) as Record<string, unknown>); return imports.length === 1 ? response({ error: 'Synthetic connection failure' }, 503) : response({ data: { captureId: source.id, fieldVerified: false } }) }
    return response({ data: { beacons: [source] } })
  })
  render(<PublicControlCatalog />)
  await screen.findByText('SYN-CONTROL')
  expect(screen.getByText('E 500000.01234 · N 9800000.05678 · Height 0 m')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Review submissions' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Import with provenance' }))
  await screen.findByRole('option', { name: /Synthetic owned project/ })
  fireEvent.change(screen.getByRole('combobox', { name: 'Owned project' }), { target: { value: project.id } })
  fireEvent.click(screen.getByRole('button', { name: 'Register source control' }))
  await screen.findByText('Synthetic connection failure')
  fireEvent.click(screen.getByRole('button', { name: 'Register source control' }))
  await waitFor(() => expect(screen.getByRole('link', { name: 'Open project control register' })).toHaveAttribute('href', `/project/${project.id}/control`))
  expect(imports[1].requestId).toBe(imports[0].requestId)
  expect(imports[0]).toMatchObject({ projectId: project.id, pointName: source.name })
  expect(imports[0]).not.toHaveProperty('easting')
})
