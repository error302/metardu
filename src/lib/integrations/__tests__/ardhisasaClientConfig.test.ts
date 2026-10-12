import { createArdhisasaClient, getArdhisasaStatus, isArdhisasaConfigured } from '../ardhisasaClient'

const keys = [
  'ARDHISASA_API_ENABLED',
  'ARDHISASA_API_CONTRACT_VERIFIED',
  'ARDHISASA_API_KEY',
  'ARDHISASA_CLIENT_ID',
  'ARDHISASA_CLIENT_SECRET',
  'ARDHISASA_BASE_URL',
  'ARDHISASA_ENVIRONMENT',
] as const

const original: Partial<Record<(typeof keys)[number], string | undefined>> = {}

beforeEach(() => {
  keys.forEach(key => {
    original[key] = process.env[key]
    delete process.env[key]
  })
})

afterEach(() => {
  keys.forEach(key => {
    const value = original[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  })
})

describe('Ardhisasa API configuration gate', () => {
  it('stays disabled when credentials alone are present', () => {
    process.env.ARDHISASA_API_KEY = 'test-key'
    process.env.ARDHISASA_CLIENT_ID = 'test-client'
    process.env.ARDHISASA_CLIENT_SECRET = 'test-secret'
    process.env.ARDHISASA_BASE_URL = 'https://api.example.test'
    process.env.ARDHISASA_ENVIRONMENT = 'sandbox'

    expect(isArdhisasaConfigured()).toBe(false)
    expect(() => createArdhisasaClient()).toThrow(/disabled/i)
  })

  it('requires explicit opt-in, contract confirmation, a valid HTTPS base URL, and a declared environment', () => {
    process.env.ARDHISASA_API_ENABLED = 'true'
    process.env.ARDHISASA_API_CONTRACT_VERIFIED = 'true'
    process.env.ARDHISASA_API_KEY = 'test-key'
    process.env.ARDHISASA_CLIENT_ID = 'test-client'
    process.env.ARDHISASA_CLIENT_SECRET = 'test-secret'
    process.env.ARDHISASA_BASE_URL = 'https://api.example.test/v1'
    process.env.ARDHISASA_ENVIRONMENT = 'sandbox'

    expect(isArdhisasaConfigured()).toBe(true)
    expect(createArdhisasaClient()).toBeDefined()
    expect(getArdhisasaStatus()).toMatchObject({ configured: true, environment: 'sandbox' })
  })

  it('rejects insecure URLs and unknown environments even when the flags are enabled', () => {
    process.env.ARDHISASA_API_ENABLED = 'true'
    process.env.ARDHISASA_API_CONTRACT_VERIFIED = 'true'
    process.env.ARDHISASA_API_KEY = 'test-key'
    process.env.ARDHISASA_CLIENT_ID = 'test-client'
    process.env.ARDHISASA_CLIENT_SECRET = 'test-secret'
    process.env.ARDHISASA_BASE_URL = 'http://api.example.test/v1'
    process.env.ARDHISASA_ENVIRONMENT = 'development'

    expect(isArdhisasaConfigured()).toBe(false)
  })
})
