const mockQuery = jest.fn<Promise<{ rows: Array<{ organization_id: string }> }>, unknown[]>()
const mockSetUser = jest.fn<void, [string | null]>()
const mockSetOrg = jest.fn<void, [string | null]>()
jest.mock('@/lib/db', () => ({
  db: { query: (...args: unknown[]) => mockQuery(...args) },
  setCurrentUserId: (id: string | null) => mockSetUser(id),
  setCurrentOrgId: (id: string | null) => mockSetOrg(id),
}))
import { setAuthenticatedDatabaseContext, resolveAuthenticatedOrganization } from '@/lib/auth/requestContext'

beforeEach(() => { jest.clearAllMocks() })

test('anonymous queries clear the caller user and organization identities', () => {
  setAuthenticatedDatabaseContext(null)
  expect(mockSetUser).toHaveBeenCalledWith(null)
  expect(mockSetOrg).toHaveBeenCalledWith(null)
  expect(mockQuery).not.toHaveBeenCalled()
})
test('clears previous organization context before binding the verified membership', async () => {
  mockQuery.mockResolvedValue({ rows: [{ organization_id: 'firm-id' }] })
  setAuthenticatedDatabaseContext('user-id')
  const organizationId = await resolveAuthenticatedOrganization('user-id')
  expect(organizationId).toBe('firm-id')
  setAuthenticatedDatabaseContext('user-id', organizationId)
  expect(mockSetUser).toHaveBeenCalledWith('user-id')
  expect(mockSetOrg.mock.calls).toEqual([[null], ['firm-id']])
  expect(mockQuery.mock.calls[0][1]).toEqual(['user-id'])
  expect(mockSetOrg.mock.invocationCallOrder[0]).toBeLessThan(mockQuery.mock.invocationCallOrder[0])
})
test('a user with no active membership retains null organization scope', async () => {
  mockQuery.mockResolvedValue({ rows: [] })
  setAuthenticatedDatabaseContext('user-id')
  const organizationId = await resolveAuthenticatedOrganization('user-id')
  expect(organizationId).toBeNull()
  setAuthenticatedDatabaseContext('user-id', organizationId)
  expect(mockSetOrg.mock.calls).toEqual([[null], [null]])
})
test('does not hide membership database failures or retain an earlier firm', async () => {
  mockQuery.mockRejectedValue(new Error('membership lookup unavailable'))
  setAuthenticatedDatabaseContext('user-id')
  await expect(resolveAuthenticatedOrganization('user-id')).rejects.toThrow('membership lookup unavailable')
  expect(mockSetOrg.mock.calls).toEqual([[null]])
})
