/** @jest-environment node */
import { logger } from './logger'

jest.mock('./logger', () => ({ logger: { warn: jest.fn() } }))
const originalEnvironment = { ...process.env }
const DATABASE = 'postgresql://synthetic:synthetic-only@127.0.0.1:55433/metardu_runtime_verify'
interface EnvironmentModule { env: { DATABASE_URL?: string; AUTH_SECRET?: string; PAYPAL_MODE?: string; NEXT_PUBLIC_LOG_ENDPOINT?: string; NEXT_PUBLIC_SENTRY_ENVIRONMENT?: string } }
function loadEnvironment() {
  let environmentModule: EnvironmentModule | undefined
  jest.isolateModules(() => { environmentModule = jest.requireActual<EnvironmentModule>('./env') })
  if (!environmentModule) throw new Error('Environment module was not loaded')
  return environmentModule.env
}
beforeEach(() => {
  process.env = { NODE_ENV: 'test', AUTH_SECRET: 'synthetic-auth-only', DATABASE_URL: DATABASE }
  jest.clearAllMocks()
})
afterEach(() => { process.env = { ...originalEnvironment } })

describe('independent environment validation', () => {
  test('retains valid database and authentication settings when an optional provider mode is invalid', () => {
    process.env.PAYPAL_MODE = ''
    const environment = loadEnvironment()
    expect(environment.DATABASE_URL).toBe(DATABASE)
    expect(environment.AUTH_SECRET).toBe('synthetic-auth-only')
    expect(environment.PAYPAL_MODE).toBeUndefined()
  })
  test('omits an invalid optional URL without discarding valid database configuration', () => {
    process.env.NEXT_PUBLIC_LOG_ENDPOINT = 'synthetic-invalid-url'
    expect(loadEnvironment()).toMatchObject({ DATABASE_URL: DATABASE, AUTH_SECRET: 'synthetic-auth-only' })
    expect(loadEnvironment().NEXT_PUBLIC_LOG_ENDPOINT).toBeUndefined()
  })
  test('does not turn an invalid monitoring environment into a database outage', () => {
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT = ''
    const environment = loadEnvironment()
    expect(environment.DATABASE_URL).toBe(DATABASE)
    expect(environment.NEXT_PUBLIC_SENTRY_ENVIRONMENT).toBeUndefined()
    expect(JSON.stringify((logger.warn as jest.Mock).mock.calls)).not.toContain(DATABASE)
  })
  test('continues to reject a missing required authentication secret at runtime', () => {
    delete process.env.AUTH_SECRET
    expect(loadEnvironment).toThrow('Missing required environment variables: AUTH_SECRET')
  })
})
