jest.mock('@/lib/auth/requireAuth', () => ({ requireAuth: jest.fn() }))
jest.mock('@/lib/compute/pythonService', () => ({ callPythonCompute: jest.fn() }))
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: HeadersInit }) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      }),
  },
}))
jest.mock('@/lib/security/rateLimit', () => ({
  getClientIdentifier: jest.fn(() => 'test-client'),
  rateLimit: jest.fn(),
}))

import { requireAuth } from '@/lib/auth/requireAuth'
import { callPythonCompute } from '@/lib/compute/pythonService'
import { rateLimit } from '@/lib/security/rateLimit'
import { POST } from './route'

const mockedRequireAuth = requireAuth as jest.Mock
const mockedCallPythonCompute = callPythonCompute as jest.Mock
const mockedRateLimit = rateLimit as jest.Mock

describe('/api/compute/parse-lidar', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedRequireAuth.mockResolvedValue({ session: { user: { id: 'surveyor-1' } }, error: null })
    mockedRateLimit.mockResolvedValue({ allowed: true, remaining: 4 })
  })

  it('requires a signed-in user before parsing an upload', async () => {
    mockedRequireAuth.mockResolvedValueOnce({
      session: null,
      error: new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 }),
    })
    const request = new Request('https://metardu.test/api/compute/parse-lidar', { method: 'POST' })

    const response = await POST(request as never)

    expect(response.status).toBe(401)
    expect(mockedRateLimit).not.toHaveBeenCalled()
    expect(mockedCallPythonCompute).not.toHaveBeenCalled()
  })

  it('rejects an oversized request before reading multipart data', async () => {
    const request = new Request('https://metardu.test/api/compute/parse-lidar', {
      method: 'POST',
      headers: { 'content-length': String(33 * 1024 * 1024) },
    })

    const response = await POST(request as never)

    expect(response.status).toBe(413)
    expect(mockedCallPythonCompute).not.toHaveBeenCalled()
  })

  it('rate limits repeated lidar processing by authenticated user', async () => {
    mockedRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 })
    const request = new Request('https://metardu.test/api/compute/parse-lidar', { method: 'POST' })

    const response = await POST(request as never)

    expect(response.status).toBe(429)
    expect(mockedRateLimit).toHaveBeenCalledWith('parse-lidar:surveyor-1', 5, 60_000)
    expect(mockedCallPythonCompute).not.toHaveBeenCalled()
  })

  it('sends an authenticated bounded payload to the private worker', async () => {
    const bytes = Uint8Array.from([1, 2, 3])
    const file = new File([bytes], 'field.laz')
    Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer })
    mockedCallPythonCompute.mockResolvedValueOnce({
      ok: true,
      value: { points: [], metadata: { source: 'LAS/LAZ Point Cloud', totalPoints: 0 } },
    })
    const request = {
      headers: new Headers(),
      formData: async () => ({ get: (key: string) => key === 'file' ? file : null }),
    }

    const response = await POST(request as never)

    expect(response.status).toBe(200)
    expect(mockedCallPythonCompute).toHaveBeenCalledWith('parse_lidar', {
      filename: 'field.laz',
      dataBase64: 'AQID',
      maxPoints: 100_000,
    }, { timeoutMs: 90_000 })
  })
})
