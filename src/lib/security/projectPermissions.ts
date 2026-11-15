/**
 * Central permission policy for project collaboration (Tier 2 #7).
 *
 * Roles are ranked, not string-compared ad hoc: every API route and UI surface
 * asks `can(role, action)` instead of re-deriving "who may do what" locally.
 * Unknown or missing roles fail closed.
 */

export const PROJECT_ROLES = ['viewer', 'editor', 'surveyor', 'admin'] as const

export type ProjectRole = (typeof PROJECT_ROLES)[number]

const ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 0,
  editor: 1,
  surveyor: 2,
  admin: 3,
}

export type ProjectAction =
  | 'project.read'
  | 'project.write'
  | 'workflow.advance'
  | 'observation.capture'
  | 'members.manage'

/**
 * The one table of "who may do what". Minimum role is inclusive: a role at or
 * above the minimum may perform the action.
 */
const ACTION_MINIMUM: Record<ProjectAction, ProjectRole> = {
  /** Read the project and its data. */
  'project.read': 'viewer',
  /** Change project content: engineering data, drawings, parcels, deliverables. */
  'project.write': 'editor',
  /** Advance workflow steps and acknowledge tolerance gates. */
  'workflow.advance': 'editor',
  /** Capture field observations, import raw readings, run instruments. */
  'observation.capture': 'surveyor',
  /** Invite members, change their roles, remove them. */
  'members.manage': 'admin',
}

export function isProjectRole(role: unknown): role is ProjectRole {
  return typeof role === 'string' && (PROJECT_ROLES as readonly string[]).includes(role)
}

export function can(role: unknown, action: ProjectAction): boolean {
  if (!isProjectRole(role)) return false
  return ROLE_RANK[role] >= ROLE_RANK[ACTION_MINIMUM[action]]
}

/**
 * Resolve the caller's effective role on a project. The owner holds full
 * authority; an invited member contributes exactly the role they were granted.
 * Unknown member roles (garbage rows) resolve to null — fail closed.
 */
export function effectiveRole(access: { isOwner: boolean; memberRole: string | null }): ProjectRole | null {
  if (access.isOwner) return 'admin'
  return isProjectRole(access.memberRole) ? access.memberRole : null
}
