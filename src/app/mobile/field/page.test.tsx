import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import MobileFieldPage from './page'
import { syncService } from '@/lib/mobile/syncService'
import { offlineStorage } from '@/lib/mobile/offlineStorage'
import { useInstrumentStore } from '@/stores/instrumentStore'
let mockOwner: string | null = '11111111-1111-4111-8111-111111111111'
let mockQuery = 'project=synthetic-project'
const mockReplace = jest.fn()
jest.mock('next-auth/react', () => ({ useSession: () => ({ status: mockOwner ? 'authenticated' : 'unauthenticated', data: mockOwner ? { user: { id: mockOwner } } : null }) }))

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mockQuery), useRouter: () => ({ replace: mockReplace }) }))
jest.mock('@/components/field/ProjectPicker', () => ({ ProjectPicker: ({ onPick, title }: { onPick: (id: string) => void; title: string }) => <>
  <h1>{title}</h1><button onClick={() => onPick('chosen-project')}>Choose synthetic project</button>
</> }))
jest.mock('@/lib/mobile/syncService', () => ({ syncService: {
  startAutoSync: jest.fn(), stopAutoSync: jest.fn(), syncPending: jest.fn(), forceSync: jest.fn(), getSyncStatus: jest.fn(),
} }))
jest.mock('@/lib/mobile/offlineStorage', () => ({ offlineStorage: {
  getFieldObservations: jest.fn(), getStorageStats: jest.fn(), saveFieldObservationWithPhotos: jest.fn(),
} }))
jest.mock('@/lib/api-client/client', () => ({ createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { name: 'Synthetic road' } }) }) }) }) }) }))
jest.mock('@/lib/mobile/capturedPhotoData', () => ({ prepareCapturedPhotoData: jest.fn(async () => []) }))
jest.mock('@/components/gnss/GNSSConnectionPanel', () => ({ GNSSConnectionPanel: () => null }))
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn() } }))
let mockRow: Record<string, string>
let mockPulledReading: Partial<Record<string, string>> | undefined
jest.mock('@/components/fieldbook/UniversalMobileObservationForm', () => ({ UniversalMobileObservationForm: ({ onAdd, onPullInstrumentReading }: {
  onAdd: (row: Record<string, string>, photos: []) => Promise<void>
  onPullInstrumentReading?: () => Promise<Partial<Record<string, string>>>
}) => <>
  <button onClick={() => { void onAdd(mockRow, []).catch(() => undefined) }}>Save synthetic reading</button>
  <button onClick={() => { void onPullInstrumentReading?.().then(reading => { mockPulledReading = reading }) }}>Pull synthetic instrument</button>
</> }))

beforeEach(() => {
  jest.clearAllMocks()
  mockOwner = '11111111-1111-4111-8111-111111111111'
  mockQuery = 'project=synthetic-project'
  mockRow = { station: 'P1', easting: '0', northing: '10' }
  mockPulledReading = undefined
  useInstrumentStore.setState({ status: 'disconnected', latestPoint: null })
  jest.mocked(offlineStorage.getFieldObservations).mockResolvedValue([])
  jest.mocked(offlineStorage.getStorageStats).mockResolvedValue({ observations: 0, photos: 0, pendingSync: 2, failedSync: 1, storageUsed: '0 B' })
  jest.mocked(syncService.forceSync).mockResolvedValue({ synced: 0, failed: 0 })
  jest.mocked(syncService.syncPending).mockResolvedValue({ synced: 0, failed: 0 })
  jest.mocked(syncService.getSyncStatus).mockReturnValue({ isOnline: true, isSyncing: false, message: null, retryAt: null })
  jest.spyOn(window, 'alert').mockImplementation(() => undefined)
})
afterEach(() => jest.restoreAllMocks())

test('opening the collector without a project selects one before starting local reads or delivery', async () => {
  mockQuery = 'survey=traverse'
  render(<MobileFieldPage />)
  expect(screen.getByRole('heading', { name: 'Choose a field project' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'New Traverse Reading' })).not.toBeInTheDocument()
  expect(offlineStorage.getFieldObservations).not.toHaveBeenCalled()
  expect(offlineStorage.getStorageStats).not.toHaveBeenCalled()
  expect(syncService.startAutoSync).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Choose synthetic project' }))
  expect(mockReplace).toHaveBeenCalledWith('/mobile/field?survey=traverse&project=chosen-project')
})

test('a paused attempt explains retained records and never labels the attempt as a completed sync', async () => {
  jest.mocked(syncService.getSyncStatus).mockReturnValue({ isOnline: true, isSyncing: false, message: 'Delivery is paused until the retry time. Your device records are retained.', retryAt: Date.now() + 60_000 })
  render(<MobileFieldPage />)
  fireEvent.click(screen.getByRole('button', { name: 'Sync' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Delivery is paused')
  expect(screen.queryByText(/^Synced:/)).not.toBeInTheDocument()
  expect(screen.getByText(/Needs review:/)).toHaveTextContent('1')
})

test('saving a new reading uses ordinary delivery and preserves previously blocked records', async () => {
  render(<MobileFieldPage />)
  fireEvent.click(screen.getByRole('button', { name: 'New Traverse Reading' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save synthetic reading' }))
  await waitFor(() => expect(offlineStorage.saveFieldObservationWithPhotos).toHaveBeenCalled())
  await waitFor(() => expect(syncService.syncPending).toHaveBeenCalledTimes(1))
  expect(syncService.forceSync).not.toHaveBeenCalled()
  expect(offlineStorage.saveFieldObservationWithPhotos).toHaveBeenCalledWith(expect.objectContaining({ ownerId: mockOwner }), [])
})

test('signed-out users cannot open another account’s local observations or start capture', async () => {
  mockOwner = null
  render(<MobileFieldPage />)
  expect(await screen.findByText(/sign in to access.*device readings/i)).toBeInTheDocument()
  expect(offlineStorage.getFieldObservations).not.toHaveBeenCalled()
  expect(offlineStorage.getStorageStats).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'New Traverse Reading' })).not.toBeInTheDocument()
})

test('delivery failure after durable capture reports a saved device copy rather than a failed capture', async () => {
  jest.mocked(syncService.syncPending).mockRejectedValue(new Error('Queue read interrupted'))
  render(<MobileFieldPage />)
  fireEvent.click(screen.getByRole('button', { name: 'New Traverse Reading' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save synthetic reading' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Saved on this device')
  expect(window.alert).not.toHaveBeenCalled()
})

test('traverse capture retains distance, distinct setup heights, zero angles and original bearing text', async () => {
  mockRow = { station: 'A1', bearing: '45.5056', slopeDist: '125.456', vaDeg: '0', ih: '1.2', th: '2.3', remarks: 'Raw values' }
  render(<MobileFieldPage />)
  fireEvent.click(screen.getByRole('button', { name: 'New Traverse Reading' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save synthetic reading' }))
  await waitFor(() => expect(offlineStorage.saveFieldObservationWithPhotos).toHaveBeenCalledWith(expect.objectContaining({
    slopeDistance: 125.456, verticalAngle: 0, instrumentHeight: 1.2, rodHeight: 2.3,
    rawForm: mockRow, surveyType: 'traverse', observationSource: 'manual',
  }), []))
  const saved = jest.mocked(offlineStorage.saveFieldObservationWithPhotos).mock.calls[0][0]
  // The form has no adopted bearing encoding, so do not interpret 45.5056 as decimal degrees.
  expect(saved.horizontalAngle).toBeUndefined()
})

test('levelling retains backsight, intermediate and foresight readings including measured zero', async () => {
  mockRow = { station: 'TP1', bs: '0', is: '1.500', fs: '2.25', remarks: 'Original level row' }
  render(<MobileFieldPage />)
  fireEvent.click(screen.getByRole('button', { name: 'Leveling' }))
  fireEvent.click(screen.getByRole('button', { name: 'New Leveling Reading' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save synthetic reading' }))
  await waitFor(() => expect(offlineStorage.saveFieldObservationWithPhotos).toHaveBeenCalledWith(expect.objectContaining({
    backsightReading: 0, intermediateReading: 1.5, foresightReading: 2.25, surveyType: 'leveling', rawForm: mockRow,
  }), []))
})

test('non-finite entered measurements fail visibly before durable capture', async () => {
  mockRow = { station: 'A1', slopeDist: 'Infinity' }
  render(<MobileFieldPage />)
  fireEvent.click(screen.getByRole('button', { name: 'New Traverse Reading' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save synthetic reading' }))
  await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('finite')))
  expect(offlineStorage.saveFieldObservationWithPhotos).not.toHaveBeenCalled()
})

test('GNSS coordinates never populate angle/distance fields and zero projected coordinates survive pull', async () => {
  useInstrumentStore.setState({ status: 'connected', latestPoint: { id: 'synthetic-point', pointName: 'P0', latitude: -1.25, longitude: 36.75,
    easting: 0, northing: 0, elevation: 0, timestamp: new Date(), source: 'nmea' } })
  render(<MobileFieldPage />)
  fireEvent.click(screen.getByRole('button', { name: 'New Traverse Reading' }))
  fireEvent.click(screen.getByRole('button', { name: 'Pull synthetic instrument' }))
  await waitFor(() => expect(mockPulledReading).toBeDefined())
  expect(mockPulledReading).toMatchObject({ easting: '0', northing: '0', elevation: '0' })
  expect(mockPulledReading?.bearing).toBeUndefined()
  expect(mockPulledReading?.slopeDist).toBeUndefined()
})

test('instrument pull retains numerical precision and does not round a measured reading before capture', async () => {
  useInstrumentStore.setState({ status: 'connected', latestPoint: { id: 'synthetic-point', pointName: 'P1',
    easting: 123.123456789, northing: 0.000001, elevation: 0.000009, timestamp: new Date(), source: 'gsi' } })
  render(<MobileFieldPage />)
  fireEvent.click(screen.getByRole('button', { name: 'New Traverse Reading' }))
  fireEvent.click(screen.getByRole('button', { name: 'Pull synthetic instrument' }))
  await waitFor(() => expect(mockPulledReading).toBeDefined())
  expect(mockPulledReading).toMatchObject({ easting: '123.123456789', northing: '0.000001', elevation: '0.000009' })
})
