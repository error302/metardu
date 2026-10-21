import { act, fireEvent, render, screen } from '@testing-library/react'
import GNSSProcessingPanel from '../GNSSProcessingPanel'
import { processRINEXBaseline, type RINEXBaselineResponse } from '@/lib/gnss/baselineClient'

jest.mock('@/lib/gnss/baselineClient', () => ({ processRINEXBaseline: jest.fn() }))
const compute = jest.mocked(processRINEXBaseline)
const response: RINEXBaselineResponse = {
  baseline: { rover_latitude: -1, rover_longitude: 36, rover_height: 100, sigma_east: 0.01, sigma_north: 0.02, sigma_up: 0.03, quality: 'FIX', sat_count: 12, ratio: 4 },
  meta: { processedBy: 'RTKLIB (rnx2rtkp)', processedAt: '2026-10-21T10:00:00.000Z', mode: 'static', frequency: 'l1+l2', elevationMask: 15, ambiguityResolution: 'continuous', basePosition: { latitude: -1, longitude: 36, ellipsoidalHeight: 100 } },
}
function pending() {
  let resolve!: (value: RINEXBaselineResponse) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<RINEXBaselineResponse>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
function prepare() {
  for (const label of ['Base observation file', 'Rover observation file', 'Navigation file']) {
    fireEvent.change(screen.getByLabelText(label), { target: { files: [new File(['synthetic'], 'input.rnx')] } })
  }
  for (const [label, value] of [['Latitude (degrees)', '-1'], ['Longitude (degrees)', '36'], ['Ellipsoidal height (m)', '100']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
}
beforeEach(() => compute.mockReset())

test('unchanged inputs present the result and deliver its measured geographic position once', async () => {
  const onPosition = jest.fn()
  compute.mockResolvedValue(response)
  render(<GNSSProcessingPanel onPositionComputed={onPosition} />)
  prepare()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Process baseline' })) })
  expect(screen.getByRole('heading', { name: 'Worker result' })).toBeInTheDocument()
  expect(onPosition).toHaveBeenCalledTimes(1)
  expect(onPosition).toHaveBeenCalledWith(expect.objectContaining({ lat: -1, lon: 36, ellipsoidalHeight: 100, quality: 'FIX' }))
})

test.each([
  ['Latitude (degrees)', '-2'], ['Longitude (degrees)', '37'], ['Ellipsoidal height (m)', '101'],
  ['Positioning mode', 'kinematic'], ['Frequency', 'l1'], ['Elevation mask (degrees)', '20'], ['Ambiguity resolution', 'off'],
])('editing %s invalidates a completed result', async (label, value) => {
  compute.mockResolvedValue(response)
  render(<GNSSProcessingPanel />)
  prepare()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Process baseline' })) })
  expect(screen.getByRole('heading', { name: 'Worker result' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
  expect(screen.queryByRole('heading', { name: 'Worker result' })).not.toBeInTheDocument()
})

test.each(['Base observation file', 'Rover observation file', 'Navigation file', 'Latitude (degrees)'])('a late result after changing %s is discarded before the callback', async label => {
  const task = pending(), onPosition = jest.fn()
  compute.mockReturnValue(task.promise)
  render(<GNSSProcessingPanel onPositionComputed={onPosition} />)
  prepare()
  fireEvent.click(screen.getByRole('button', { name: 'Process baseline' }))
  fireEvent.change(screen.getByLabelText(label), { target: label.includes('file') ? { files: [new File(['replacement'], 'input.rnx')] } : { value: '-2' } })
  expect(screen.getByRole('status')).toHaveTextContent('its result will be discarded')
  expect(screen.getByRole('button', { name: /Processing RINEX/ })).toBeDisabled()
  await act(async () => { task.resolve(response) })
  expect(screen.queryByRole('heading', { name: 'Worker result' })).not.toBeInTheDocument()
  expect(onPosition).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Process baseline' })).toBeEnabled()
})

test('changing away and back still discards a pending run and suppresses its error', async () => {
  const task = pending()
  compute.mockReturnValue(task.promise)
  render(<GNSSProcessingPanel />)
  prepare()
  fireEvent.click(screen.getByRole('button', { name: 'Process baseline' }))
  fireEvent.change(screen.getByLabelText('Latitude (degrees)'), { target: { value: '-2' } })
  fireEvent.change(screen.getByLabelText('Latitude (degrees)'), { target: { value: '-1' } })
  await act(async () => { task.reject(new Error('Old run failed')) })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('leaving the panel prevents a pending result from delivering a position', async () => {
  const task = pending(), onPosition = jest.fn()
  compute.mockReturnValue(task.promise)
  const view = render(<GNSSProcessingPanel onPositionComputed={onPosition} />)
  prepare()
  fireEvent.click(screen.getByRole('button', { name: 'Process baseline' }))
  view.unmount()
  await act(async () => { task.resolve(response) })
  expect(onPosition).not.toHaveBeenCalled()
})

test('current inputs can be processed after an obsolete run settles', async () => {
  const task = pending(), onPosition = jest.fn()
  const currentResponse = { ...response, baseline: { ...response.baseline, rover_latitude: -2 }, meta: { ...response.meta, basePosition: { ...response.meta.basePosition, latitude: -2 } } }
  compute.mockReturnValueOnce(task.promise).mockResolvedValueOnce(currentResponse)
  render(<GNSSProcessingPanel onPositionComputed={onPosition} />)
  prepare()
  fireEvent.click(screen.getByRole('button', { name: 'Process baseline' }))
  fireEvent.change(screen.getByLabelText('Latitude (degrees)'), { target: { value: '-2' } })
  await act(async () => { task.resolve(response) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Process baseline' })) })
  expect(compute).toHaveBeenLastCalledWith(expect.any(Object), expect.any(Object), { latitude: -2, longitude: 36, ellipsoidalHeight: 100 })
  expect(onPosition).toHaveBeenCalledTimes(1)
  expect(onPosition).toHaveBeenCalledWith(expect.objectContaining({ lat: -2 }))
  expect(screen.getByRole('heading', { name: 'Worker result' })).toBeInTheDocument()
})
