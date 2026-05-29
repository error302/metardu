import { hasRole, isAdmin, ROLES, DEFAULT_ROLE, PROJECT_WRITE_ROLES, SCHEME_ADMIN_ROLES } from '../rbac'

describe('RBAC Module', () => {
  describe('hasRole', () => {
    it('should return true when user role is in allowed list', () => {
      expect(hasRole('org_admin', [ROLES.ORG_ADMIN])).toBe(true)
      expect(hasRole('surveyor', [ROLES.ORG_ADMIN, ROLES.SURVEYOR])).toBe(true)
    })

    it('should return false when user role is not in allowed list', () => {
      expect(hasRole('viewer', [ROLES.ORG_ADMIN])).toBe(false)
      expect(hasRole('surveyor', [ROLES.ORG_ADMIN])).toBe(false)
    })

    it('should fall back to default role when role is null', () => {
      expect(hasRole(null, [ROLES.SURVEYOR])).toBe(true)
      expect(hasRole(null, [ROLES.ORG_ADMIN])).toBe(false)
    })

    it('should fall back to default role when role is undefined', () => {
      expect(hasRole(undefined, [ROLES.SURVEYOR])).toBe(true)
    })
  })

  describe('isAdmin', () => {
    it('should return true for super_admin role', () => {
      expect(isAdmin('super_admin')).toBe(true)
    })

    it('should return true for org_admin role', () => {
      expect(isAdmin('org_admin')).toBe(true)
    })

    it('should return false for non-admin roles', () => {
      expect(isAdmin('surveyor')).toBe(false)
      expect(isAdmin('viewer')).toBe(false)
    })

    it('should return false for null/undefined', () => {
      expect(isAdmin(null)).toBe(false)
      expect(isAdmin(undefined)).toBe(false)
    })
  })

  describe('Constants', () => {
    it('should have correct role constants', () => {
      expect(ROLES.ORG_ADMIN).toBe('org_admin')
      expect(ROLES.SURVEYOR).toBe('surveyor')
      expect(ROLES.VIEWER).toBe('viewer')
    })

    it('should have correct default role', () => {
      expect(DEFAULT_ROLE).toBe('surveyor')
    })

    it('should include org_admin and surveyor in project write roles', () => {
      expect(PROJECT_WRITE_ROLES).toContain('org_admin')
      expect(PROJECT_WRITE_ROLES).toContain('surveyor')
    })

    it('should include super_admin and org_admin in scheme admin roles', () => {
      expect(SCHEME_ADMIN_ROLES).toEqual(['super_admin', 'org_admin'])
    })
  })
})
