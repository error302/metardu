import {requireProjectReadAccess} from '@/lib/auth/ownership'
import {canAccessProject} from '@/lib/auth/rbac'
import {roomRoleSchema,type RoomRole} from './collaborationProtocol'

/** Room membership cannot bypass the saved project's ownership/RLS boundaries. */
export async function resolveProjectRoomAccess(userId: string,projectId: string): Promise<RoomRole|null> {
  if (!userId || !projectId) return null
  const access = await requireProjectReadAccess(projectId,userId)
  if (!access.ok || !access.projectUserId) return null
  const parsed = roomRoleSchema.safeParse(await canAccessProject(userId,projectId))
  // Canonical RBAC resolves firm role first; creator identity cannot retain firm write access.
  if (!parsed.success) return null
  if (parsed.data === 'owner' && access.projectUserId !== userId) return null
  return parsed.data
}
