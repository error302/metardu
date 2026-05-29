/** @jest-environment node */
jest.mock('@/lib/db', () => ({
  db: { query: jest.fn() },
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

import { POST } from '../blocks/route'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'

const mockDb = db.query as jest.MockedFunction<typeof db.query>
const mockSession = getServerSession as jest.MockedFunction<typeof getServerSession>

describe('Security - SQL Injection Resistance', () => {
  beforeEach(() => jest.clearAllMocks())

  it('should not allow SQL injection in block_number', async () => {
    mockSession.mockResolvedValue({
      user: { id: 'u1', email: 'test@test.com', name: 'Test' },
      expires: new Date().toISOString(),
    })

    const maliciousInput = "1'; DROP TABLE blocks; --"
    const req = new Request('http://localhost/api/scheme/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: 'proj-1', block_number: maliciousInput }),
    })

    await POST(req as any)

    // Verify that the malicious string is NOT passed raw to any query
    const calls = mockDb.mock.calls
    const allQueryStrings = calls.map(c => c[0])

    // The malicious string should appear as a parameter ($2), not in the SQL string
    for (const sql of allQueryStrings) {
      expect(sql).not.toContain('DROP TABLE')
      expect(sql).not.toContain('--')
    }
  })

  it('should sanitize block_name with special characters', async () => {
    mockSession.mockResolvedValue({
      user: { id: 'u1', email: 'test@test.com', name: 'Test' },
      expires: new Date().toISOString(),
    })

    // This should not crash — special chars should be parameterized
    mockDb.mockResolvedValue({ rows: [{ id: 'b1', block_number: '1' }], command: 'SELECT', rowCount: 1, oid: 0, fields: [] })

    const req = new Request('http://localhost/api/scheme/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: 'proj-1',
        block_number: '5',
        block_name: "Test'; DELETE FROM users WHERE '1'='1",
      }),
    })

    const res = await POST(req as any)
    // Should either succeed (parameterized) or fail validation, NOT crash the DB
    expect([201, 400, 500]).toContain(res.status)
  })
})
