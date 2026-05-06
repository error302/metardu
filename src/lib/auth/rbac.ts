/**
 * RBAC — Role-Based Access Control for Metardu
 * 
 * Roles: admin, surveyor, viewer
 * - admin: full access to all projects and system settings
 * - surveyor: create/edit own projects, assigned scheme work
 * - viewer: read-only access to shared projects
 */

export type Role = 'admin' | 'surveyor' | 'viewer'

export const ROLES = {
  ADMIN: 'admin' as Role,
  SURVEYOR: 'surveyor' as Role,
  VIEWER: 'viewer' as Role,
} as const

/** Roles that can create/edit projects */
export const PROJECT_WRITE_ROLES: Role[] = [ROLES.ADMIN, ROLES.SURVEYOR]

/** Roles that can approve submissions and manage scheme status */
export const SCHEME_ADMIN_ROLES: Role[] = [ROLES.ADMIN]

/** Roles that can manage users and system settings */
export const SYSTEM_ADMIN_ROLES: Role[] = [ROLES.ADMIN]

/** Default role for new users */
export const DEFAULT_ROLE: Role = ROLES.SURVEYOR

/**
 * Check if a user's role includes any of the allowed roles.
 * Falls back to 'surveyor' if role is not set.
 */
export function hasRole(userRole: string | null | undefined, allowedRoles: Role[]): boolean {
  const role = (userRole || DEFAULT_ROLE) as Role
  return allowedRoles.includes(role)
}

/**
 * Check if user is an admin. Convenience wrapper.
 */
export function isAdmin(userRole: string | null | undefined): boolean {
  return hasRole(userRole, [ROLES.ADMIN])
}
