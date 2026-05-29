/**
 * Role-Based Access Control utilities for METARDU.
 *
 * Three roles per Kenya Survey Act hierarchy:
 *   FIELD      — Field assistant (limited read/create)
 *   SURVEYOR   — Registered surveyor (compute, edit, draft PDFs)
 *   LICENSED   — Licensed land surveyor (approve, lock, final PDFs)
 */

// Three roles per Kenya Survey Act hierarchy
export type UserRole = 'FIELD' | 'SURVEYOR' | 'LICENSED';

// Permission matrix
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  FIELD: [
    'projects:create',
    'observations:create',
    'instruments:upload',
    // Cannot delete, generate PDFs, or approve
  ],
  SURVEYOR: [
    'projects:create',
    'projects:edit',
    'observations:create',
    'observations:edit',
    'instruments:upload',
    'compute:run',
    'compute:edit',
    'road_reserve:clip',
    'pdf:draft',
  ],
  LICENSED: [
    'projects:create',
    'projects:edit',
    'observations:create',
    'observations:edit',
    'instruments:upload',
    'compute:run',
    'compute:edit',
    'road_reserve:clip',
    'pdf:draft',
    'pdf:final',
    'project:approve_lock',
    'parcel:override_minimum',
  ],
};

export function hasPermission(role: UserRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function requireLicense(role: UserRole): boolean {
  return role === 'LICENSED';
}

/**
 * Only true if the user is LICENSED **and** has verified ISK credentials.
 * This gates the most critical action: approving and locking a project.
 */
export function canApproveAndLock(role: UserRole, verifiedIsk: boolean): boolean {
  return role === 'LICENSED' && verifiedIsk;
}

/** Only LICENSED users can generate final (seal-bearing) PDFs. */
export function canGenerateFinalPdf(role: UserRole): boolean {
  return role === 'LICENSED';
}

/** Both SURVEYOR and LICENSED users can run computations. */
export function canRunComputation(role: UserRole): boolean {
  return role === 'SURVEYOR' || role === 'LICENSED';
}

// Get role from surveyor_profiles record
export function getRoleFromProfile(profile: {
  role?: string | null;
  verified_isk?: boolean | null;
}): UserRole {
  if (profile?.role === 'admin' || profile?.role === 'LICENSED') return 'LICENSED';
  if (profile?.role === 'surveyor' || profile?.role === 'SURVEYOR') {
    return profile?.verified_isk ? 'LICENSED' : 'SURVEYOR';
  }
  return profile?.role === 'FIELD' ? 'FIELD' : 'SURVEYOR'; // default to SURVEYOR
}

/**
 * Cross-system mapping: Enhanced RBAC roles → Domain roles.
 *
 * The enhanced system (src/lib/auth/rbac.ts) uses: super_admin, org_admin,
 * project_manager, surveyor, viewer. This function maps them to the domain
 * roles used by the Kenya Survey Act hierarchy.
 *
 * Used by API routes that need to bridge both systems.
 */
export function mapEnhancedRoleToDomain(enhancedRole: string, verifiedIsk?: boolean): UserRole {
  switch (enhancedRole) {
    case 'super_admin':
    case 'org_admin':
      return 'LICENSED'; // System admins have full domain privileges
    case 'project_manager':
      return verifiedIsk ? 'LICENSED' : 'SURVEYOR';
    case 'surveyor':
      return verifiedIsk ? 'LICENSED' : 'SURVEYOR';
    case 'viewer':
      return 'FIELD';
    default:
      return 'SURVEYOR';
  }
}

/**
 * Cross-system mapping: Domain roles → Enhanced RBAC roles.
 * Useful for displaying the correct role label in the UI.
 */
export function mapDomainToEnhanced(domainRole: UserRole): string {
  switch (domainRole) {
    case 'LICENSED': return 'project_manager';
    case 'SURVEYOR': return 'surveyor';
    case 'FIELD': return 'viewer';
    default: return 'surveyor';
  }
}
