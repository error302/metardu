import type { NextRequest, NextResponse } from 'next/server'
import { POST } from '../route'
import { expect } from '@jest/globals'


jest.mock('next/server', () => {
  class MockNextResponse {
    status: number
    headers: Map<string, string>
    private bytes: Uint8Array

    constructor(body: string | Uint8Array | null, init?: { status?: number; headers?: Record<string, string> }) {
      this.status = init?.status ?? 200
      this.headers = new Map(Object.entries(init?.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]))
      this.bytes = body instanceof Uint8Array ? body : new TextEncoder().encode(body ?? '')
    }

    static json(body: unknown, init?: { status?: number }) {
      return new MockNextResponse(JSON.stringify(body), {
        status: init?.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    async arrayBuffer() {
      return this.bytes.buffer.slice(this.bytes.byteOffset, this.bytes.byteOffset + this.bytes.byteLength)
    }

    async json(): Promise<unknown> {
      return JSON.parse(new TextDecoder().decode(this.bytes))
    }
  }

  return { NextResponse: MockNextResponse }
})

jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: unknown) => handler,
}))

const routePost = POST as unknown as (request: NextRequest, context: never) => Promise<NextResponse>
const basePayload = {
  projectName: 'Project / access road',
  surveyorName: 'Surveyor Example',
  surveyorLicense: 'LS-123',
  date: '2026-10-12',
  projection: 'EPSG:32737',
  points: [{ pointId: 'P-01', designE: 500010, designN: 9900000 }],
}

function context(body: unknown) {
  return { body, userId: 'user-test', session: null, params: {} } as never
}

describe('POST /api/documents/setting-out-sheet', () => {
  it('returns a private, non-persistent PDF with a sanitized attachment name', async () => {
    const response = await routePost(
      {} as NextRequest,
      context(basePayload),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('cache-control')).toContain('private, no-store')
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="setting-out-Project-access-road.pdf"')
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })

  it('rejects display CRS and invalid design coordinates before PDF generation', async () => {
    const response = await routePost(
      {} as NextRequest,
      context({ ...basePayload, projection: 'EPSG:3857' }),
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/CRS_DISPLAY_ONLY_FOR_SURVEY|display-only|survey/i) })
  })
})
