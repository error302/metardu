/**
 * Offline Field Book DB Tests
 * Run: npx jest src/lib/offline/__tests__/fieldBookDB.test.ts
 */

import { describe, it, expect } from '@jest/globals'
import { openDB } from 'idb'
import type { OfflineRoadFieldPlan } from '../fieldBookDB'

jest.mock('idb', () => ({
  openDB: jest.fn().mockResolvedValue({
    put: jest.fn().mockResolvedValue(undefined),
    getAllFromIndex: jest.fn().mockResolvedValue([]),
    getAll: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
  }),
}))

import { generateId, isOnline, listCachedRoadFieldPlans, upgradeFieldBookStores } from '../fieldBookDB'

describe('fieldBookDB', () => {
  it('generateId produces unique strings', () => {
    const id1 = generateId()
    const id2 = generateId()
    expect(id1).not.toBe(id2)
    expect(typeof id1).toBe('string')
    expect(id1.length).toBeGreaterThan(10)
  })

  it('isOnline returns boolean', () => {
    expect(typeof isOnline()).toBe('boolean')
  })

  it('lists device-cached road plans for offline project selection', async () => {
    const fixtureCrs = ['EPSG', '32737'].join(':')
    const older: OfflineRoadFieldPlan = {
      projectId: 'road-project',
      projectName: 'Older road',
      plan: {
        startChainageM: 0,
        endChainageM: 100,
        stationIntervalM: 20,
        leftExtentM: null,
        rightExtentM: null,
        projectCrs: fixtureCrs,
        controlReference: 'BM-01',
        featureCodes: ['CL'],
      },
      projectCrsCode: fixtureCrs,
      cachedAt: '2026-10-16T08:00:00.000Z',
    }
    const newer: OfflineRoadFieldPlan = { ...older, projectId: 'newer-road', projectName: 'Newer road', cachedAt: '2026-10-17T08:00:00.000Z' }
    const cachedDb = { getAll: jest.fn().mockResolvedValue([older, null, { ...newer, cachedAt: 'not-a-date' }, newer]) }
    jest.mocked(openDB).mockResolvedValueOnce(cachedDb as never)

    await expect(listCachedRoadFieldPlans()).resolves.toEqual([newer, older])
  })

  it('adds the road plan store without recreating existing field-book stores', () => {
    const existing = new Set(['observations', 'projects', 'photos'])
    const createObjectStore = jest.fn((name: string, _options?: { keyPath?: string }) => {
      existing.add(name)
      return { createIndex: jest.fn() }
    })
    const db = {
      objectStoreNames: { contains: (name: string) => existing.has(name) },
      createObjectStore,
    } as unknown as Parameters<typeof upgradeFieldBookStores>[0]

    upgradeFieldBookStores(db)

    expect(createObjectStore).toHaveBeenCalledTimes(1)
    expect(createObjectStore.mock.calls).toEqual([[ 'roadFieldPlans', { keyPath: 'projectId' } ]])
  })

  it('creates the complete field-book schema for a fresh database', () => {
    const existing = new Set<string>()
    const createIndex = jest.fn()
    const createObjectStore = jest.fn((name: string, _options?: { keyPath?: string }) => {
      existing.add(name)
      return { createIndex }
    })
    const db = {
      objectStoreNames: { contains: (name: string) => existing.has(name) },
      createObjectStore,
    } as unknown as Parameters<typeof upgradeFieldBookStores>[0]

    upgradeFieldBookStores(db)

    expect(createObjectStore.mock.calls.map(([name]) => name)).toEqual([
      'observations',
      'projects',
      'photos',
      'roadFieldPlans',
    ])
    expect(createIndex).toHaveBeenCalledTimes(4)
  })
})
