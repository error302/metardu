import '@testing-library/jest-dom'
import { ReadableStream, WritableStream, TransformStream } from 'node:stream/web'
import { webcrypto } from 'node:crypto'
import { TextEncoder, TextDecoder } from 'node:util'

process.env.AUTH_SECRET ||= 'test-secret-for-jest'
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/unavailable'
process.env.NEXTAUTH_URL ||= 'http://127.0.0.1:3021'

if (typeof globalThis.TextEncoder === 'undefined') {
  Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder, configurable: true, writable: true })
}
if (typeof globalThis.TextDecoder === 'undefined') {
  Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder, configurable: true, writable: true })
}

for (const [name, value] of Object.entries({ ReadableStream, WritableStream, TransformStream })) {
  if (!(name in globalThis)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

// Use complete Web API implementations instead of incomplete casts to Request/Response.
const fetchPrimitives = jest.requireActual<typeof import('next/dist/compiled/@edge-runtime/primitives/fetch')>('next/dist/compiled/@edge-runtime/primitives/fetch')
if (typeof globalThis.Request === 'undefined') globalThis.Request = fetchPrimitives.Request
if (typeof globalThis.Response === 'undefined') globalThis.Response = fetchPrimitives.Response
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, writable: true, configurable: true })
}
