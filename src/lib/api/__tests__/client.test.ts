/**
 * API Client — Jest tests
 * Run: npx jest src/lib/api/__tests__/client.test.ts
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { z } from 'zod'
import { api, apiGet, apiPost, apiDelete, apiInvalidate, apiInvalidateAll, ApiError } from '../client'

// ponytail: mock fetch with minimal Response shape (jest jsdom lacks native Response.text())
function mockResponse(status: number, body: unknown): Response {
  const json = body === null ? '' : JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    text: async () => json,
    json: async () => body,
    headers: { get: (name: string) => name === 'Content-Type' ? 'application/json' : null },
  } as unknown as Response
}

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>
global.fetch = mockFetch

describe('api() client', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    apiInvalidateAll()
  })

  it('returns parsed body on 200 OK', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { id: 'p1', name: 'Test' }))
    const result = await api('/api/test', z.object({ id: z.string(), name: z.string() }))
    expect(result).toEqual({ id: 'p1', name: 'Test' })
  })

  it('returns undefined on 204 No Content', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(204, null))
    const result = await api<null | undefined>('/api/test', z.null().optional())
    expect(result).toBeUndefined()
  })

  it('throws ApiError on 401 Unauthorized', async () => {
    mockFetch.mockResolvedValue(mockResponse(401, { error: 'Auth required', code: 'UNAUTHORIZED' }))
    try {
      await api('/api/test', z.object({}))
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as InstanceType<typeof ApiError>).status).toBe(401)
      expect((err as InstanceType<typeof ApiError>).code).toBe('UNAUTHORIZED')
      expect((err as InstanceType<typeof ApiError>).isUnauthorized).toBe(true)
    }
  })

  it('throws ApiError with issues on 400 VALIDATION_ERROR', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(400, {
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      issues: [{ path: ['name'], message: 'Required' }],
    }))
    try {
      await api('/api/test', z.object({}))
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as InstanceType<typeof ApiError>).isValidation).toBe(true)
      expect((err as InstanceType<typeof ApiError>).issues).toHaveLength(1)
    }
  })

  it('throws on response schema mismatch', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { id: 'p1' }))
    await expect(
      api('/api/test', z.object({ id: z.string(), name: z.string() })),
    ).rejects.toThrow(/schema mismatch/)
  })

  it('auto-stringifies JSON body and sets Content-Type', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(201, { id: 'p2', name: 'new' }))
    await apiPost('/api/test', z.object({ id: z.string(), name: z.string() }), { name: 'new' })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'new' }),
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )
  })

  it('apiGet caches within TTL', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, { id: 'p1', name: 'cached' }))
    const schema = z.object({ id: z.string(), name: z.string() })
    await apiGet('/api/cached', schema, { ttlMs: 5000 })
    await apiGet('/api/cached', schema, { ttlMs: 5000 })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('apiInvalidate busts the cache', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, { id: 'p1', name: 'fresh' }))
    const schema = z.object({ id: z.string(), name: z.string() })
    await apiGet('/api/invalidatable', schema, { ttlMs: 5000 })
    apiInvalidate('/api/invalidatable')
    await apiGet('/api/invalidatable', schema, { ttlMs: 5000 })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('apiDelete without schema accepts 204', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(204, null))
    await expect(apiDelete('/api/test/123')).resolves.toBeUndefined()
  })

  it('falls back to status-based code when server omits code', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(404, { error: 'Not found' }))
    try {
      await api('/api/missing', z.object({}))
    } catch (err) {
      expect((err as InstanceType<typeof ApiError>).code).toBe('NOT_FOUND')
      expect((err as InstanceType<typeof ApiError>).isNotFound).toBe(true)
    }
  })
})
