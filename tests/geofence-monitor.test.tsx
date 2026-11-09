/* eslint-disable no-restricted-syntax -- Synthetic WGS 84 UTM and Arc 1960 project fixtures. */
import { act, fireEvent, render, screen } from '@testing-library/react'
import GeofenceMonitor from '@/components/survey/GeofenceMonitor'
import { transformPoint } from '@/lib/spatial/projectCrs'

const originalFetch = global.fetch
const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, 'geolocation')
let success: PositionCallback
let failure: PositionErrorCallback
const clearWatch = jest.fn()
const watchPosition = jest.fn((onFix: PositionCallback, onError: PositionErrorCallback) => {
  success = onFix
  failure = onError
  return 10
})

beforeEach(() => {
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition, clearWatch } })
  watchPosition.mockClear()
  clearWatch.mockClear()
})

afterEach(() => {
  global.fetch = originalFetch
  if (originalGeolocation) Object.defineProperty(navigator, 'geolocation', originalGeolocation)
  else Reflect.deleteProperty(navigator, 'geolocation')
  jest.useRealTimers()
})

function mockProject(crs: string) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      referenceSystem: {
        prs: {
          horizontalCrs: crs, horizontalName: 'Synthetic grid', datum: 'Synthetic fixture', units: 'metres',
          zone: 37, hemisphere: 'S', angularUnit: 'degrees', distanceMode: 'grid', coordinatePrecision: 2,
        },
      },
    }),
  })
}

async function startMonitoring() {
  mockProject('EPSG:32737')
  render(<GeofenceMonitor projectId="synthetic-site" />)
  const start = await screen.findByRole('button', { name: 'Start device monitoring' })
  expect(start).toBeDisabled()
  const [, northing] = transformPoint(39, -1, 'EPSG:4326', 'EPSG:32737')
  fireEvent.change(screen.getByLabelText(/Boundary vertices/), {
    target: { value: '500004,' + (northing - 50) + '\n500104,' + (northing - 50) + '\n500104,' + (northing + 50) + '\n500004,' + (northing + 50) },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Apply perimeter & buffer' }))
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(start)
  expect(watchPosition).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('button', { name: 'Test position' })).not.toBeInTheDocument()
}

function reportFix(accuracy: number, timestamp: number, longitude = 39) {
  act(() => success({
    timestamp,
    coords: { latitude: -1, longitude, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
  } as GeolocationPosition))
}

test('distinguishes a near-boundary fix from a breach and expires old device state', async () => {
  await startMonitoring()
  jest.useFakeTimers()
  const now = Date.now()
  reportFix(6, now)
  expect(screen.getByRole('status')).toHaveTextContent('Position uncertain near an alert zone')
  act(() => jest.advanceTimersByTime(1))
  reportFix(2, now + 1)
  expect(screen.getByRole('status')).toHaveTextContent('Outside perimeter')
  expect(screen.getByText('Device · Outside perimeter')).toBeVisible()
  act(() => jest.advanceTimersByTime(15_000))
  expect(screen.getByRole('status')).toHaveTextContent('Device location expired')
  fireEvent.click(screen.getByRole('button', { name: 'Stop device monitoring' }))
  expect(clearWatch).toHaveBeenCalledWith(10)
  expect(screen.getByRole('status')).toHaveTextContent('Awaiting a position')
})

test('leaves no device reading after permission is denied', async () => {
  await startMonitoring()
  act(() => failure({ code: 1 } as GeolocationPositionError))
  expect(screen.getByRole('status')).toHaveTextContent('Location permission denied')
  expect(clearWatch).toHaveBeenCalledWith(10)
  expect(screen.getByRole('button', { name: 'Test position' })).toBeVisible()
})

test('keeps unsupported project grids in simulation and blocks access failure', async () => {
  mockProject('EPSG:21037')
  const view = render(<GeofenceMonitor projectId="arc-grid" />)
  expect(await screen.findByRole('heading', { name: 'Project simulation' })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Start device monitoring' })).not.toBeInTheDocument()
  view.unmount()
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 })
  render(<GeofenceMonitor projectId="denied-project" />)
  expect(await screen.findByText(/The project reference is unavailable/)).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Test position' })).not.toBeInTheDocument()
})


test('pauses a hidden tab and waits for a fresh position after returning', async () => {
  const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  try {
    await startMonitoring()
    reportFix(2, Date.now())
    expect(screen.getByRole('status')).toHaveTextContent('Outside perimeter')
    visibility.mockReturnValue('hidden')
    fireEvent(document, new Event('visibilitychange'))
    expect(clearWatch).toHaveBeenCalledWith(10)
    expect(screen.getByRole('status')).toHaveTextContent('Device monitoring paused')
    expect(screen.queryByText(/Reported accuracy/)).not.toBeInTheDocument()
    visibility.mockReturnValue('visible')
    fireEvent(document, new Event('visibilitychange'))
    expect(watchPosition).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for a fresh device location')
  } finally {
    visibility.mockRestore()
  }
})
