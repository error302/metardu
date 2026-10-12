/** @jest-environment node */

import { GET } from '../route'
import { db } from '@/lib/db'
import { execSync } from 'child_process'

jest.mock('@/lib/db', () => ({
  db: { query: jest.fn() },
}))

jest.mock('child_process', () => ({
  execSync: jest.fn(() => Buffer.from('15%')),
}))

const dbQuery = db.query as jest.Mock
const execSyncMock = execSync as jest.Mock
let previousBuildSha: string | undefined
let previousRedisUrl: string | undefined
interface PublicHealth {
  releaseId: string
  status: string
  checks: Record<string, { status: string; error?: string }>
}

beforeEach(() => {
  previousBuildSha = process.env.METARDU_BUILD_SHA
  previousRedisUrl = process.env.REDIS_URL
  process.env.METARDU_BUILD_SHA = 'a'.repeat(40)
  delete process.env.REDIS_URL
  dbQuery.mockResolvedValue({ rows: [{ health_check: 1 }] })
  execSyncMock.mockReturnValue(Buffer.from('15%'))
})

afterEach(() => {
  if (previousBuildSha === undefined) delete process.env.METARDU_BUILD_SHA
  else process.env.METARDU_BUILD_SHA = previousBuildSha

  if (previousRedisUrl === undefined) delete process.env.REDIS_URL
  else process.env.REDIS_URL = previousRedisUrl

  jest.clearAllMocks()
})

describe('public release health endpoint', () => {
  test('identifies a promoted working-tree build without presenting it as a commit', async () => {
    const release = 'working-tree-3b06c0222c304aa3'
    process.env.METARDU_BUILD_SHA = release

    const response = await GET()
    const body = await response.json() as PublicHealth

    expect(body.releaseId).toBe(release)
    expect(response.headers.get('X-METARDU-Release')).toBe(release)
  })

  test('does not disclose database connection details on the public endpoint', async () => {
    dbQuery.mockRejectedValue(new Error('connect postgres://private-user:private-password@private-host:5432/customer-db failed'))

    const response = await GET()
    const body = await response.json() as PublicHealth

    expect(response.status).toBe(503)
    expect(body.status).toBe('unhealthy')
    expect(body.checks.database).toEqual({ status: 'error', error: 'Database unavailable' })
    expect(JSON.stringify(body)).not.toContain('private-')
    expect(JSON.stringify(body)).not.toContain('customer-db')
  })

  test('returns the deployed commit and prevents caching of health state', async () => {
    const response = await GET()
    const body = await response.json() as PublicHealth

    expect(response.status).toBe(200)
    expect(body.releaseId).toBe('a'.repeat(40))
    expect(response.headers.get('X-METARDU-Release')).toBe('a'.repeat(40))
    expect(response.headers.get('Cache-Control')).toContain('no-store')
  })

  test('fails closed to an unknown release when the configured value is malformed', async () => {
    process.env.METARDU_BUILD_SHA = 'not-a-commit'

    const response = await GET()
    const body = await response.json() as PublicHealth

    expect(body.releaseId).toBe('unknown')
    expect(response.headers.get('X-METARDU-Release')).toBe('unknown')
  })
})
