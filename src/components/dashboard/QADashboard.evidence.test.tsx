import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QADashboard } from './QADashboard'
import type { StageReference } from '@/lib/workspaces/stageReference'
const mockTopology = jest.fn<Promise<{ issues: { type: string }[] }>, []>()
jest.mock('@/lib/survey/topologyChecker', () => ({ runTopologyCheck: () => mockTopology() }))

const reference: StageReference = { code: 'EPSG:21037', name: 'Synthetic projected metre grid', source: 'declared', hemisphere: 'S', verticalDatum: null, distanceMode: 'grid' }
const rectangle = (width: number) => [{ easting: 500000, northing: 9800000 }, { easting: 500000 + width, northing: 9800000 },
  { easting: 500000 + width, northing: 9800010 }, { easting: 500000, northing: 9800010 }]
const parcel = (width: number, id = 'synthetic') => ({ id, lrNumber: id, vertices: rectangle(width) })
const originalFetch = global.fetch
const response = (ok = true) => ({ ok, status: ok ? 201 : 503 }) as Response
const deferred = () => {
  let resolve!: (value: Response) => void
  const promise = new Promise<Response>(done => { resolve = done })
  return { promise, resolve }
}
interface Report { inputSnapshot: string; results: { checkType: string; result: string; measuredValue: number | null; thresholdValue: number | null; unit: string | null; details: { comparison?: string } }[] }
const lastReport = () => JSON.parse(String(jest.mocked(fetch).mock.calls.at(-1)?.[1]?.body)) as Report
beforeEach(() => { global.fetch = jest.fn().mockResolvedValue(response()); mockTopology.mockReset().mockResolvedValue({ issues: [] }) })
afterAll(() => { global.fetch = originalFetch })

test('editing other vertices with an unchanged first corner recomputes the area and preserves the new input snapshot', async () => {
  const initial = [parcel(10)], changed = [parcel(20)]
  const view = render(<QADashboard projectId="synthetic-area-edit" reference={reference} parcels={initial} parentAreaHa={0.01} />)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  expect(lastReport().results.find(check => check.checkType === 'dashboard.area-recon')).toMatchObject({ result: 'PASS' })
  view.rerender(<QADashboard projectId="synthetic-area-edit" reference={reference} parcels={changed} parentAreaHa={0.01} />)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  expect(lastReport().results.find(check => check.checkType === 'dashboard.area-recon')).toMatchObject({ result: 'FAIL' })
  expect(screen.getByText(/parent 0.0100 ha vs parts 0.0200 ha/)).toBeInTheDocument()
  expect((JSON.parse(lastReport().inputSnapshot) as { parcels: unknown }).parcels).toEqual(changed)
})

test('adjacent parcels sharing their first corner do not reuse each other’s area', async () => {
  render(<QADashboard projectId="synthetic-shared-corner" reference={reference} parcels={[parcel(10, 'east'), parcel(-20, 'west')]} parentAreaHa={0.03} />)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  expect(screen.getByText(/Sum of parts \(0.0300 ha\) matches parent/)).toBeInTheDocument()
  expect(lastReport().results.find(check => check.checkType === 'dashboard.area-recon')).toMatchObject({ result: 'PASS' })
})

test('reported area evidence carries its measured difference, units, threshold and comparison', async () => {
  render(<QADashboard projectId="synthetic-area-measurement" reference={reference} parcels={[parcel(10)]} parentAreaHa={0.03} />)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  const area = lastReport().results.find(check => check.checkType === 'dashboard.area-recon')
  expect(area).toMatchObject({
    result: 'FAIL', thresholdValue: 0.001, unit: 'ha', details: { comparison: 'lte' },
  })
  expect(area?.measuredValue).toBeCloseTo(0.02, 8)
})

test.each(['EPSG:3857', 'EPSG:4326', 'EPSG:999999'])('a declared-looking but unusable %s cannot produce a spatial PASS', async code => {
  render(<QADashboard projectId="synthetic-invalid-reference" reference={{ ...reference, code }} parcels={[parcel(10)]} parentAreaHa={0.01} />)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  expect(lastReport().results.find(check => check.checkType === 'dashboard.qa-reference')).toMatchObject({ result: 'INFO' })
  expect(lastReport().results.some(check => check.checkType === 'dashboard.area-recon')).toBe(false)
})

test('an old save success cannot mark changed inputs in the same project as saved', async () => {
  const old = deferred(), current = deferred()
  jest.mocked(fetch).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
  const view = render(<QADashboard projectId="synthetic-late-success" parentAreaHa={0.01} />)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  view.rerender(<QADashboard projectId="synthetic-late-success" parentAreaHa={0.02} />)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  await act(async () => { old.resolve(response()) })
  expect(screen.getByRole('status')).toHaveTextContent('Saving QA evidence')
  await act(async () => { current.resolve(response(false)) })
  expect(screen.getByRole('status')).toHaveTextContent('this run was not saved')
})

test('an old save failure cannot erase successful evidence for the current inputs', async () => {
  const old = deferred(), current = deferred()
  jest.mocked(fetch).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
  const view = render(<QADashboard projectId="synthetic-late-failure" parentAreaHa={0.01} />)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  view.rerender(<QADashboard projectId="synthetic-late-failure" parentAreaHa={0.02} />)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  await act(async () => { current.resolve(response()) })
  await act(async () => { old.resolve(response(false)) })
  expect(screen.getByRole('status')).toHaveTextContent('Saved as reported QA evidence')
})

test('re-running identical inputs coalesces the pending request and adopts its matching result', async () => {
  const pending = deferred()
  jest.mocked(fetch).mockReturnValueOnce(pending.promise)
  render(<QADashboard projectId="synthetic-same-input" />)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: 'Re-run Checks' }))
  expect(fetch).toHaveBeenCalledTimes(1)
  await act(async () => { pending.resolve(response()) })
  expect(screen.getByRole('status')).toHaveTextContent('Saved as reported QA evidence')
})

test('an earlier verdict cannot acknowledge a rerun whose topology results changed', async () => {
  const old = deferred(), current = deferred()
  jest.mocked(fetch).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
  mockTopology.mockResolvedValueOnce({ issues: [] }).mockResolvedValueOnce({ issues: [{ type: 'overlap' }] })
  render(<QADashboard projectId="synthetic-new-verdict" reference={reference} parcels={[parcel(10)]} />)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: 'Re-run Checks' }))
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  expect(lastReport().results.find(check => check.checkType === 'dashboard.topo-overlap')).toMatchObject({ result: 'FAIL' })
  await act(async () => { old.resolve(response()) })
  expect(screen.getByRole('status')).toHaveTextContent('Saving QA evidence')
  await act(async () => { current.resolve(response(false)) })
  expect(screen.getByRole('status')).toHaveTextContent('this run was not saved')
})

test('checks that finish after leaving the dashboard cannot start a new evidence write', async () => {
  let finish!: (value: { issues: { type: string }[] }) => void
  mockTopology.mockReturnValueOnce(new Promise(done => { finish = done }))
  const view = render(<QADashboard projectId="synthetic-unmounted" reference={reference} parcels={[parcel(10)]} />)
  await waitFor(() => expect(mockTopology).toHaveBeenCalledTimes(1))
  view.unmount()
  await act(async () => { finish({ issues: [] }) })
  expect(fetch).not.toHaveBeenCalled()
})
