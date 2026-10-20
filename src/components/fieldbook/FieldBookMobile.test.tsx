import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FieldBookMobile } from './FieldBookMobile'
import { offlineStorage } from '@/lib/mobile/offlineStorage'
import { syncService } from '@/lib/mobile/syncService'
let mockOwner: string | null
jest.mock('next-auth/react', () => ({ useSession: () => ({ status: mockOwner ? 'authenticated' : 'unauthenticated', data: mockOwner ? { user: { id: mockOwner } } : null }) }))
jest.mock('@/lib/mobile/offlineStorage', () => ({ offlineStorage: {
  getFieldObservations: jest.fn(), getProjectPhotos: jest.fn(), getStorageStats: jest.fn(), saveFieldObservationWithPhotos: jest.fn(),
} }))
jest.mock('@/lib/mobile/syncService', () => ({ syncService: { startAutoSync: jest.fn(), stopAutoSync: jest.fn(), syncPending: jest.fn(), forceSync: jest.fn(), getSyncStatus: jest.fn() } }))
jest.mock('@/lib/mobile/capturedPhotoData', () => ({ prepareCapturedPhotoData: async () => [] }))
jest.mock('./QuickAddModal', () => ({ QuickAddModal: ({ onAdd }: { onAdd: (row: Record<string, unknown>, photos: []) => Promise<void> }) =>
  <button onClick={() => { void onAdd({ station_from: 'A', station_to: 'B', horizontal_angle: 0, slope_distance: 12, instrument_height: 1, target_height: 2 }, []) }}>Save quick reading</button> }))
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn() } }))
const props = { projectId: 'project', surveyType: 'traverse', surveyorId: 'unused-prop' }
beforeEach(() => {
  jest.clearAllMocks()
  mockOwner = '11111111-1111-4111-8111-111111111111'
  jest.mocked(offlineStorage.getFieldObservations).mockResolvedValue([])
  jest.mocked(offlineStorage.getProjectPhotos).mockResolvedValue([])
  jest.mocked(offlineStorage.getStorageStats).mockResolvedValue({ observations: 0, photos: 0, pendingSync: 0, failedSync: 0, storageUsed: '0 B' })
  jest.mocked(syncService.getSyncStatus).mockReturnValue({ isOnline: true, isSyncing: false, message: null, retryAt: null })
})

test('local reads are scoped to the authenticated account rather than a surveyor prop', async () => {
  render(<FieldBookMobile {...props} />)
  await waitFor(() => expect(offlineStorage.getProjectPhotos).toHaveBeenCalledWith('project', mockOwner))
  expect(offlineStorage.getFieldObservations).toHaveBeenCalledWith('project', mockOwner)
  expect(offlineStorage.getStorageStats).toHaveBeenCalledWith(mockOwner)
})

test('signed-out users do not read a previous account’s device records', () => {
  mockOwner = null
  render(<FieldBookMobile {...props} />)
  expect(screen.getByText(/sign in to access.*device readings/i)).toBeInTheDocument()
  expect(offlineStorage.getFieldObservations).not.toHaveBeenCalled()
})

test('a quick reading stays captured once even if subsequent delivery fails', async () => {
  jest.mocked(syncService.syncPending).mockRejectedValue(new Error('Connection lost'))
  render(<FieldBookMobile {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /add observation/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Save quick reading' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Saved on this device')
  expect(offlineStorage.saveFieldObservationWithPhotos).toHaveBeenCalledTimes(1)
  expect(offlineStorage.saveFieldObservationWithPhotos).toHaveBeenCalledWith(expect.objectContaining({ ownerId: mockOwner }), [])
  expect(syncService.forceSync).not.toHaveBeenCalled()
})
