import {
  canAdvanceWorkflow,
  canManageMembers,
  canReadProject,
  isProjectMemberRole,
  PROJECT_MEMBER_ROLES,
} from '../projectPermissions'

describe('projectPermissions', () => {
  describe('isProjectMemberRole', () => {
    it.each(PROJECT_MEMBER_ROLES)('accepts grantable member role %s', (role) => {
      expect(isProjectMemberRole(role)).toBe(true)
    })

    it.each(['owner', 'org_admin', 'super_admin', 'editor', 'admin', '', 'VIEWER', null, undefined, 3])(
      'rejects %p (not grantable to a project member)',
      (role) => {
        expect(isProjectMemberRole(role)).toBe(false)
      },
    )
  })

  describe('canReadProject', () => {
    it.each(['owner', 'super_admin', 'org_admin', 'project_manager', 'surveyor', 'viewer'])(
      'allows recognized access role %s',
      (role) => {
        expect(canReadProject(role)).toBe(true)
      },
    )

    it.each([null, undefined, '', 'editor', 'admin', 'user'])('fails closed for %p', (role) => {
      expect(canReadProject(role)).toBe(false)
    })
  })

  describe('canAdvanceWorkflow', () => {
    it.each(['owner', 'super_admin', 'org_admin', 'project_manager', 'surveyor'])(
      'allows editing role %s',
      (role) => {
        expect(canAdvanceWorkflow(role)).toBe(true)
      },
    )

    it('blocks viewers and unknown roles', () => {
      expect(canAdvanceWorkflow('viewer')).toBe(false)
      expect(canAdvanceWorkflow(null)).toBe(false)
      expect(canAdvanceWorkflow('editor')).toBe(false)
    })
  })

  describe('canManageMembers', () => {
    const personal = { isProjectOwner: false, isOrganizationProject: false }
    const personalOwner = { isProjectOwner: true, isOrganizationProject: false }
    const org = { isProjectOwner: false, isOrganizationProject: true }

    it('personal projects: only the owner manages members (matches DB RLS)', () => {
      expect(canManageMembers('owner', personalOwner)).toBe(true)
      expect(canManageMembers('project_manager', personal)).toBe(false)
      expect(canManageMembers('surveyor', personal)).toBe(false)
      expect(canManageMembers('viewer', personal)).toBe(false)
    })

    it('org projects: owner, org_admin, project_manager and super_admin manage', () => {
      expect(canManageMembers('owner', { isProjectOwner: true, isOrganizationProject: true })).toBe(true)
      expect(canManageMembers('org_admin', org)).toBe(true)
      expect(canManageMembers('project_manager', org)).toBe(true)
      expect(canManageMembers('super_admin', org)).toBe(true)
      expect(canManageMembers('surveyor', org)).toBe(false)
      expect(canManageMembers('viewer', org)).toBe(false)
      expect(canManageMembers(null, org)).toBe(false)
    })
  })
})
