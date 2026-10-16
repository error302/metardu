/** @jest-environment node */
jest.mock('pg', () => ({ Pool: jest.fn().mockImplementation(() => ({ on: jest.fn() })) }))
jest.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'postgresql://synthetic@127.0.0.1:55433/synthetic' } }))

const cacheKey = Symbol.for('metardu.development.postgres-pool')
const registry = globalThis as typeof globalThis & { [cacheKey]?: unknown }
afterEach(() => { delete registry[cacheKey]; jest.restoreAllMocks(); jest.resetModules() })

it('reuses one development pool across module reloads and attaches one error listener', async () => {
  jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: 'development' })
  const first = (await import('../db')).getPool()
  jest.resetModules()
  const second = (await import('../db')).getPool()
  expect(second).toBe(first)
  expect(first.on).toHaveBeenCalledTimes(1)
})
it('refuses a changed development configuration rather than reusing a different database', async () => {
  jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: 'development', DB_POOL_MAX: '10' })
  ;(await import('../db')).getPool()
  jest.resetModules()
  jest.replaceProperty(process, 'env', { ...process.env, DB_POOL_MAX: '11' })
  expect(() => jest.requireActual<typeof import('../db')>('../db').getPool()).toThrow(/configuration changed/)
})
