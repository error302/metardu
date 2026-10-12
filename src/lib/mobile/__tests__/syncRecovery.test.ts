import {
  isSyncQueueItemRecoveryExpired,
  offlineStorage,
  SYNC_RECOVERY_LEASE_MS,
  type SyncQueueItem,
} from '../offlineStorage'
import { syncService } from '../syncService'

describe('offline field sync recovery', () => {
  it('recovers only syncing items whose lease has expired', () => {
    const now = 10_000
    const syncing: SyncQueueItem = {
      id: 'stuck-observation',
      type: 'field_observation',
      recordId: 'observation-1',
      action: 'create',
      data: {},
      timestamp: now - SYNC_RECOVERY_LEASE_MS - 1,
      status: 'syncing',
      retryCount: 0,
      lastAttempt: now - SYNC_RECOVERY_LEASE_MS,
    }

    expect(isSyncQueueItemRecoveryExpired(syncing, now)).toBe(true)
    expect(isSyncQueueItemRecoveryExpired({ ...syncing, lastAttempt: now - 1 }, now)).toBe(false)
    expect(isSyncQueueItemRecoveryExpired({ ...syncing, status: 'pending' }, now)).toBe(false)
  })

  it('recovers interrupted items before it reads the pending queue', async () => {
    const calls: string[] = []
    const recover = jest.spyOn(offlineStorage, 'recoverStaleSyncItems').mockImplementation(async () => {
      calls.push('recover')
      return 1
    })
    const getPending = jest.spyOn(offlineStorage, 'getPendingSyncItems').mockImplementation(async () => {
      calls.push('pending')
      return []
    })

    try {
      await expect(syncService.syncPending()).resolves.toEqual({ synced: 0, failed: 0 })
      expect(calls).toEqual(['recover', 'pending'])
    } finally {
      recover.mockRestore()
      getPending.mockRestore()
    }
  })
})
