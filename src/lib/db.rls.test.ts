const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
}
const mockPool = {
  connect: jest.fn(async () => mockClient),
  on: jest.fn(),
}

jest.mock('pg', () => ({ Pool: jest.fn(() => mockPool) }))
jest.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'postgresql://test.invalid/metardu' } }))
jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))

describe('database RLS request context', () => {
  it('keeps user, organization, and trusted service identity for the statement, then clears it before pool release', async () => {
    mockClient.query.mockResolvedValue({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] })
    const { db, setCurrentUserId, setCurrentOrgId, setCurrentRlsServiceRole } = await import('./db')
    const userId = 'e07a3e3e-b95e-4d9b-a445-0880a55e840e'
    const organizationId = '1bd95dc4-88d0-4d31-83ea-c5936db6a3c6'
    setCurrentUserId(userId)
    setCurrentOrgId(organizationId)
    setCurrentRlsServiceRole('billing_reconciliation')

    await db.query('SELECT id FROM projects WHERE id = $1', ['project-id'])

    expect(mockClient.query).toHaveBeenNthCalledWith(1,
      `SELECT set_config('request.user_id', $1, false),
            set_config('request.organization_id', $2, false),
            set_config('app.current_user_id', $3, false),
            set_config('request.access_role', $4, false),
            set_config('request.till_claim_code', $5, false)`,
      [userId, organizationId, userId, 'billing_reconciliation', ''],
    )
    expect(mockClient.query).toHaveBeenNthCalledWith(2, 'SELECT id FROM projects WHERE id = $1', ['project-id'])
    expect(mockClient.query).toHaveBeenNthCalledWith(3,
      `SELECT set_config('request.user_id', '', false),
            set_config('request.organization_id', '', false),
            set_config('app.current_user_id', $1, false),
            set_config('request.access_role', '', false),
            set_config('request.till_claim_code', '', false)`,
      ['00000000-0000-0000-0000-000000000000'],
    )
    expect(mockClient.release).toHaveBeenCalledTimes(1)
    expect(mockClient.release).toHaveBeenCalledWith()
    setCurrentOrgId(null)
    setCurrentRlsServiceRole(null)
  })
})
