/** @jest-environment node */
const mockQuery = jest.fn(async () => ({ rows: [], rowCount: 0 }))
jest.mock('@/lib/db', () => ({ db: { transaction: (run: (client: { query: typeof mockQuery }) => Promise<void>) => run({ query: mockQuery }) } }))
import { assignRole, type Role } from '../rbac'

it.each<[Role, string]>([['super_admin', 'admin'], ['org_admin', 'surveyor'], ['project_manager', 'surveyor'], ['surveyor', 'surveyor'], ['viewer', 'viewer']])('stores global %s separately from legacy profile %s', async (role, profileRole) => {
  mockQuery.mockClear()
  await assignRole('target', role, 'platform-reviewer')
  expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE users SET role'), [role, 'target'])
  expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE surveyor_profiles SET role'), [profileRole, 'target'])
})
