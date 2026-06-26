/**
 * @jest-environment node
 */

// Mock env to prevent DB connection errors
jest.mock('@/lib/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/testdb',
    DB_HOST: undefined,
    DB_NAME: undefined,
    DB_USER: undefined,
    DB_PASSWORD: undefined,
    DB_PORT: undefined,
  },
}))

import { db, getPool } from '../db'

describe('DB Module', () => {
  it('should export db object with query method', () => {
    expect(db).toBeDefined()
    expect(typeof db.query).toBe('function')
  })

  it('should export getClient method', () => {
    expect(typeof db.getClient).toBe('function')
  })

  it('should export getPool function', () => {
    expect(typeof getPool).toBe('function')
  })

  it('getPool should return same instance (singleton)', () => {
    const pool1 = getPool()
    const pool2 = getPool()
    expect(pool1).toBe(pool2)
  })
})
