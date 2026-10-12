/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BeaconReestablishmentForm } from '@/components/beacons/BeaconReestablishmentForm'
import { BeaconRegistryPanel } from '@/components/beacons/BeaconRegistryPanel'

const project = { id: '00000000-0000-4000-8000-000000000001', name: 'Synthetic field project', horizontalCrs: 'EPSG:' + 21037, verticalDatum: 'Synthetic BM' }
const beacon = { id: '00000000-0000-4000-8000-000000000002', beacon_number: 'SYN-A', easting: 500000, northing: 9800000, horizontal_crs: project.horizontalCrs }
function response(value: unknown, ok = true): Response {
  const result = new Response(JSON.stringify(value), { status: ok ? 200 : 503 })
  Object.defineProperty(result, 'ok', { value: ok })
  return result
}
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
test('replacement retries preserve their request ID, exact coordinates and observed zero height', async () => {
  const submissions: Array<Record<string, unknown>> = []
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    if (String(input).includes('/projects?')) return response({ data: { projects: [project], nextCursor: null } })
    submissions.push(JSON.parse(String(options?.body)) as Record<string, unknown>)
    return submissions.length === 1 ? response({ error: 'Synthetic connection failure' }, false) : response({ data: { replayed: true } })
  })
  const saved = jest.fn()
  render(<BeaconReestablishmentForm beacon={beacon} onClose={jest.fn()} onSaved={saved} />)
  await screen.findByRole('option', { name: /Synthetic field project/ })
  fireEvent.change(screen.getByRole('combobox', { name: 'Owned project' }), { target: { value: project.id } })
  fireEvent.change(screen.getByLabelText('Observed easting (m)'), { target: { value: '500000.01234' } })
  fireEvent.change(screen.getByLabelText('Observed northing (m)'), { target: { value: '9800000.05678' } })
  fireEvent.change(screen.getByLabelText('Observed height (m, optional)'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText(/Observation date and time/), { target: { value: '2026-10-01T09:00' } })
  fireEvent.change(screen.getByLabelText('Instrument and serial/reference'), { target: { value: 'SYN-TS' } })
  fireEvent.change(screen.getByLabelText('Observed ties to control'), { target: { value: 'SYN-A 12 m; SYN-B 18 m' } })
  fireEvent.change(screen.getByLabelText('Reason and field notes'), { target: { value: 'Synthetic damaged mark only' } })
  fireEvent.click(screen.getByRole('button', { name: 'Record observed replacement' }))
  await screen.findByText('Synthetic connection failure')
  fireEvent.click(screen.getByRole('button', { name: 'Record observed replacement' }))
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
  expect(submissions).toHaveLength(2)
  expect(submissions[1].requestId).toBe(submissions[0].requestId)
  expect(submissions[0]).toMatchObject({ projectId: project.id, easting: 500000.01234, northing: 9800000.05678, elevation: 0, verticalDatum: 'Synthetic BM', horizontalCrs: project.horizontalCrs })
})
test('registry renders actual rows and sends an explicit grid for nearby searches', async () => {
  const calls: string[] = []
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    calls.push(String(input))
    return response({ data: { beacons: [{ ...beacon, beacon_type: 'concrete', condition: 'good', elevation: 0, owned: true }] } })
  })
  render(<BeaconRegistryPanel />)
  await screen.findByText('SYN-A')
  expect(screen.getByText(/E 500000/).textContent).toContain('RL 0')
  expect(screen.getByRole('button', { name: 'Record observed replacement' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Search by Location' }))
  fireEvent.change(screen.getByLabelText('Easting'), { target: { value: '500000.01234' } })
  fireEvent.change(screen.getByLabelText('Northing'), { target: { value: '9800000.05678' } })
  fireEvent.change(screen.getByLabelText('Search grid'), { target: { value: project.horizontalCrs } })
  fireEvent.click(screen.getByRole('button', { name: 'Search Beacons' }))
  await waitFor(() => expect(calls).toHaveLength(2))
  const query = new URL(calls[1], 'http://localhost').searchParams
  expect(query.get('crs')).toBe(project.horizontalCrs)
  expect(query.get('easting')).toBe('500000.01234')
})
