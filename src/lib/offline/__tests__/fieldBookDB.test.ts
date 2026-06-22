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

import { generateId, isOnline } from '../fieldBookDB'

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
})
