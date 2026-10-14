/** @jest-environment node */
import { NextRequest } from 'next/server'
import { createHash } from 'crypto'

const mockQuery = jest.fn<Promise<{ rows: Record<string, unknown>[] }>, [string, unknown[]?]>()
const mockTxQuery = jest.fn<Promise<{ rows: Record<string, unknown>[] }>, [string, unknown[]?]>()
const mockSend = jest.fn<Promise<{ success: boolean; error?: string }>, unknown[]>()
const mockTransaction = jest.fn(async (work: (client: { query: typeof mockTxQuery }) => Promise<unknown>) => work({ query: mockTxQuery }))
jest.mock('@/lib/db', () => ({ db: {
  query: (...args: Parameters<typeof mockQuery>) => mockQuery(...args),
  transaction: (work: (client: { query: typeof mockTxQuery }) => Promise<unknown>) => mockTransaction(work),
  getClient: async () => ({ query: mockTxQuery, release: jest.fn() }),
}, setCurrentUserId: jest.fn() }))
jest.mock('@/lib/email-templates', () => ({ sendTemplatedEmail: (...args: unknown[]) => mockSend(...args) }))
jest.mock('@/lib/security/rateLimit', () => ({ rateLimit: async () => ({ allowed: true }), getClientIdentifier: () => 'test-client' }))
jest.mock('bcryptjs', () => ({ hash: async () => 'hashed-password' }))
jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }))
import { POST as forgot } from '../forgot-password/route'
import { POST as reset } from '../reset-password/route'

const USER_ID = '90000000-0000-4000-8000-000000000010'
const request = (body: unknown) => new NextRequest('https://metardu.space/api/auth/recovery', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(() => {
  jest.clearAllMocks()
  mockQuery.mockResolvedValue({ rows: [{ id: USER_ID, user_id: USER_ID, email: 'crew@example.com', full_name: 'Road crew' }] })
  mockTxQuery.mockImplementation(async (sql: string) => ({ rows: sql.includes('RETURNING') || sql.includes('SELECT')
    ? [{ id: 'reset-id', user_id: USER_ID, email: 'crew@example.com', full_name: 'Road crew' }] : [] }))
  mockSend.mockResolvedValue({ success: true })
})

describe('password recovery delivery', () => {
  it('reports a service failure rather than claiming an email was sent after a database error', async () => {
    mockQuery.mockRejectedValue(new Error('database unavailable'))
    expect((await forgot(request({ email: 'crew@example.com' }))).status).toBe(503)
    expect(mockSend).not.toHaveBeenCalled()
  })
  it('reports a service failure when the provider rejects delivery', async () => {
    mockSend.mockResolvedValue({ success: false, error: 'provider unavailable' })
    expect((await forgot(request({ email: 'crew@example.com' }))).status).toBe(503)
  })
  it('normalizes custom email addresses and stores only the reset-token digest', async () => {
    const response = await forgot(request({ email: ' Crew+Road@Example.com ' }))
    expect(response.status).toBe(200)
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('SELECT id'), ['crew+road@example.com'])
    const sendArgs = mockSend.mock.calls[0]?.[1] as { resetToken: string }
    expect(sendArgs.resetToken).toMatch(/^[a-f0-9]{64}$/)
    const insert = mockQuery.mock.calls.find(([sql]) => sql.includes('INSERT INTO password_reset_tokens')) as [string, unknown[]]
    expect(insert[1][1]).toBe(`sha256:${createHash('sha256').update(sendArgs.resetToken).digest('hex')}`)
  })
  it('keeps the same generic acknowledgement for an unknown address without sending', async () => {
    mockQuery.mockResolvedValue({ rows: [] })
    const response = await forgot(request({ email: 'unknown@example.com' }))
    expect(response.status).toBe(200)
    expect(mockSend).not.toHaveBeenCalled()
  })
})

describe('password reset completion', () => {
  it('locks and consumes the reset token in the password-update transaction, revokes sessions, and notifies the owner', async () => {
    const response = await reset(request({ token: 'a'.repeat(64), password: 'New-password-123' }))
    expect(response.status).toBe(200)
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(mockTxQuery).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), expect.any(Array))
    expect(mockTxQuery).toHaveBeenCalledWith(expect.stringContaining('session_version = session_version + 1'), expect.any(Array))
    expect(mockSend).toHaveBeenCalledWith('passwordChanged', expect.objectContaining({ to: 'crew@example.com' }))
  })
  it('rejects an expired or already consumed token without updating a password or sending confirmation', async () => {
    mockQuery.mockResolvedValue({ rows: [] })
    mockTxQuery.mockResolvedValue({ rows: [] })
    expect((await reset(request({ token: 'a'.repeat(64), password: 'New-password-123' }))).status).toBe(400)
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockTxQuery.mock.calls.some(([sql]) => sql.includes('UPDATE users'))).toBe(false)
  })

  it('does not accept a stored digest as the public reset token', async () => {
    const response = await reset(request({ token: `sha256:${'a'.repeat(64)}`, password: 'New-password-123' }))
    expect(response.status).toBe(400)
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})
