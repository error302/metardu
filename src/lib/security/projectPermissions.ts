/**
 * Central permission policy for project collaboration.
 *
 * Role vocabulary matches what production actually stores and enforces:
 * project_members.role is validated against the same list as
 * src/lib/auth/rbac.ts (`super_admin | org_admin | project_manager |
 * surveyor | viewer`), and canAccessProject() returns one of those, the
 * literal 'owner', or null. Every route/UI asks this module instead of
 * re-deriving "who may do what" with raw string compares.
 *
 * Unknown or missing roles fail closed.
 */

/** Roles that may be granted to an invited member of a single project. */
export const PROJECT_MEMBER_ROLES = ['viewer', 'surveyor', 'project_manager'] as const

export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number]

/** Any role canAccessProject() may return for an authorized caller. */
export type ProjectAccessRole =
  | 'owner'
  | 'super_admin'
  | 'org_admin'
  | 'project_manager'
  | 'surveyor'
  | 'viewer'

export function isProjectMemberRole(role: unknown): role is ProjectMemberRole {
  return typeof role === 'string' && (PROJECT_MEMBER_ROLES as readonly string[]).includes(role)
}

/** Read the project and its data. Any recognized access role may read. */
export function canReadProject(accessRole: unknown): boolean {
  return (
    accessRole === 'owner' ||
    accessRole === 'super_admin' ||
    accessRole === 'org_admin' ||
    accessRole === 'project_manager' ||
    accessRole === 'surveyor' ||
    accessRole === 'viewer'
  )
}

/**
 * Advance workflow steps / acknowledge tolerance gates. Viewers are
 * read-only; every other recognized role may advance.
 */
export function canAdvanceWorkflow(accessRole: unknown): boolean {
  return canReadProject(accessRole) && accessRole !== 'viewer'
}

/**
 * Invite members, change their roles, or revoke them.
 *
 * Personal projects: only the owner — project_members RLS
 * (project_child_members) permits writes only by the project owner, so a
 * member-level "manager" would pass this check and then be silently
 * denied by the database. Org projects: the owner, org_admin and
 * project_manager manage members.
 */
export function canManageMembers(
  accessRole: unknown,
  context: { isProjectOwner: boolean; isOrganizationProject: boolean },
): boolean {
  if (context.isProjectOwner) return true
  if (!context.isOrganizationProject) return false
  return (
    accessRole === 'org_admin' ||
    accessRole === 'project_manager' ||
    accessRole === 'super_admin'
  )
}
