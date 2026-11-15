import { can, effectiveRole, isProjectRole, PROJECT_ROLES } from '../projectPermissions'

describe('projectPermissions', () => {
  describe('isProjectRole', () => {
    it.each(PROJECT_ROLES)('accepts the defined role %s', (role) => {
      expect(isProjectRole(role)).toBe(true)
    })

    it.each(['', 'Owner', 'OWNER', 'super_admin', 'user', 'viewer ', null, undefined, 42])(
      'rejects %p',
      (role) => {
        expect(isProjectRole(role)).toBe(false)
      },
    )
  })

  describe('can(role, action) — table driven', () => {
    const actions = [
      'project.read',
      'project.write',
      'workflow.advance',
      'observation.capture',
      'members.manage',
    ] as const

    // The expected matrix: rows = roles in rank order, columns = actions.
    const matrix: Record<string, Record<string, boolean>> = {
      viewer: { 'project.read': true, 'project.write': false, 'workflow.advance': false, 'observation.capture': false, 'members.manage': false },
      editor: { 'project.read': true, 'project.write': true, 'workflow.advance': true, 'observation.capture': false, 'members.manage': false },
      surveyor: { 'project.read': true, 'project.write': true, 'workflow.advance': true, 'observation.capture': true, 'members.manage': false },
      admin: { 'project.read': true, 'project.write': true, 'workflow.advance': true, 'observation.capture': true, 'members.manage': true },
    }

    it.each(PROJECT_ROLES)('grants exactly the matrix row for %s', (role) => {
      for (const action of actions) {
        expect(can(role, action)).toBe(matrix[role][action])
      }
    })

    it.each(['', 'owner', 'super_admin', 'user', null, undefined, 7])(
      'fails closed for unknown role %p on every action',
      (role) => {
        for (const action of actions) {
          expect(can(role, action)).toBe(false)
        }
      },
    )
  })

  describe('effectiveRole', () => {
    it('owners hold full authority regardless of any stale membership row', () => {
      expect(effectiveRole({ isOwner: true, memberRole: null })).toBe('admin')
      expect(effectiveRole({ isOwner: true, memberRole: 'viewer' })).toBe('admin')
    })

    it.each(PROJECT_ROLES)('members contribute exactly their granted role (%s)', (role) => {
      expect(effectiveRole({ isOwner: false, memberRole: role })).toBe(role)
    })

    it('fails closed on garbage or missing member roles', () => {
      expect(effectiveRole({ isOwner: false, memberRole: null })).toBeNull()
      expect(effectiveRole({ isOwner: false, memberRole: 'owner' })).toBeNull()
      expect(effectiveRole({ isOwner: false, memberRole: 'DROP TABLE' })).toBeNull()
    })
  })
})
