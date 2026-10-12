/**
 * Offline Field Book DB Tests
 * Run: npx jest src/lib/offline/__tests__/fieldBookDB.test.ts
 */

import { describe, it, expect } from '@jest/globals'

jest.mock('idb', () => ({
  openDB: jest.fn().mockResolvedValue({
    put: jest.fn().mockResolvedValue(undefined),
    getAllFromIndex: jest.fn().mockResolvedValue([]),
    getAll: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
  }),
}))

import { generateId, isOnline, upgradeFieldBookStores } from '../fieldBookDB'

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
