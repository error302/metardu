import { act, fireEvent, render, screen } from '@testing-library/react'
import OnlineServicesPage from './page'
import { transformOnlineCoordinates, type TransformResult } from '@/lib/online/coordinates'

// Other tabs own unrelated network/device effects. The transform tab and its
// discovery catalogue stay real; only request settlement is controlled here.
jest.mock('@/components/online/GNSSProcessor', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/beacons/ReviewedBenchmarkSearch', () => ({ __esModule: true, default: () => null }))
jest.mock('next/dynamic', () => ({ __esModule: true, default: () => () => null }))
jest.mock('@/lib/online/coordinates', () => ({
  ...jest.requireActual<typeof import('@/lib/online/coordinates')>('@/lib/online/coordinates'),
  transformOnlineCoordinates: jest.fn(),
}))

beforeEach(() => jest.mocked(transformOnlineCoordinates).mockReset())

test('editing a measurement removes a completed result from the actual page immediately', async () => {
  const service = jest.requireActual<typeof import('@/lib/online/coordinates')>('@/lib/online/coordinates')
  const result = await service.transformOnlineCoordinates({ fromCRS: 'EPSG:4326', toCRS: 'EPSG:4326', longitude: 0, latitude: 0 })
  jest.mocked(transformOnlineCoordinates).mockResolvedValueOnce(result)
  render(<OnlineServicesPage />)
  fireEvent.click(screen.getByRole('button', { name: 'Coordinate Transform' }))
  fireEvent.change(screen.getByLabelText('Target CRS'), { target: { value: 'EPSG:4326' } })
  fireEvent.change(screen.getByLabelText('Longitude (degrees)'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Latitude (degrees)'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Transform Coordinates' }))
  await screen.findByText(/transformation successful/i)
  fireEvent.change(screen.getByLabelText('Latitude (degrees)'), { target: { value: '1' } })
  expect(screen.queryByText(/transformation successful/i)).not.toBeInTheDocument()
})

test('the actual online transform tab requires a named target and shows source units', () => {
  render(<OnlineServicesPage />)
  expect(screen.queryByLabelText('Source CRS')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Coordinate Transform' }))
  expect(screen.getByLabelText('Source CRS')).toHaveValue('EPSG:4326')
  expect(screen.getByLabelText('Target CRS')).toHaveValue('')
  expect(screen.getByLabelText('Longitude (degrees)')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Transform Coordinates' })).toBeDisabled()
})

test.each(['success', 'error'])('a pending %s cannot attach to a fresh transform form after changing tabs', async settlement => {
  let settle!: (value: TransformResult) => void
  jest.mocked(transformOnlineCoordinates).mockReturnValue(new Promise(resolve => { settle = resolve }))
  render(<OnlineServicesPage />)
  fireEvent.click(screen.getByRole('button', { name: 'Coordinate Transform' }))
  fireEvent.change(screen.getByLabelText('Target CRS'), { target: { value: 'EPSG:4326' } })
  fireEvent.change(screen.getByLabelText('Longitude (degrees)'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Latitude (degrees)'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Transform Coordinates' }))
  fireEvent.click(screen.getByRole('button', { name: 'EDM Corrections' }))
  fireEvent.click(screen.getByRole('button', { name: 'Coordinate Transform' }))
  const service = jest.requireActual<typeof import('@/lib/online/coordinates')>('@/lib/online/coordinates')
  const outcome: TransformResult = settlement === 'success'
    ? await service.transformOnlineCoordinates({ fromCRS: 'EPSG:4326', toCRS: 'EPSG:4326', longitude: 0, latitude: 0 })
    : { success: false, code: 'TRANSFORM_FAILED', error: 'Old request must stay discarded' }
  await act(async () => settle(outcome))
  expect(screen.getByLabelText('Target CRS')).toHaveValue('')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByText('Transformation successful')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Transform Coordinates' })).toBeDisabled()
})
