import '@testing-library/jest-dom'

// T1.8/T1.9 FIX (2026-07-09): Set required env vars for tests that import
// @/lib/db (which triggers @/lib/env validation). Without this, any test
// touching the DB layer fails with "Missing required environment variables".
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-jest'
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test'

// Polyfill Request/Response for Next.js server utilities in tests
if (typeof globalThis.Request === 'undefined') {
  globalThis.Request = class Request {
    url: string
    method: string
    headers: Map<string, string>
    private _body: string | null
    constructor(url: string, init?: any) {
      this.url = url
      this.method = init?.method || 'GET'
      this._body = init?.body || null
      this.headers = new Map(Object.entries(init?.headers || {}))
    }
    async json() { return JSON.parse(this._body || '{}') }
    async text() { return this._body || '' }
  } as any
}

if (typeof globalThis.Response === 'undefined') {
  globalThis.Response = class Response {
    status: number
    private _body: string
    headers: Map<string, string>
    constructor(body?: string | null, init?: any) {
      this.status = init?.status || 200
      this._body = body || ''
      this.headers = new Map(Object.entries(init?.headers || {}))
    }
    async json() { return JSON.parse(this._body) }
  } as any
}

// Polyfill crypto.subtle for jsdom environment (used by auditHash.ts SHA-256)
// Node 18+ has crypto.subtle via node:crypto/webcrypto
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
  const { webcrypto } = require('crypto')
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: true,
    configurable: true,
  })
}

// Polyfill TextEncoder/TextDecoder for jsdom (used by auditHash.ts)
if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util')
  globalThis.TextEncoder = TextEncoder
  globalThis.TextDecoder = TextDecoder
}
