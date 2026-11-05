import {requireProjectReadAccess} from '@/lib/auth/ownership'
import {canAccessProject} from '@/lib/auth/rbac'
import {roomRoleSchema,type RoomRole} from './collaborationProtocol'

/** Room membership cannot bypass the saved project's ownership/RLS boundaries. */
export async function resolveProjectRoomAccess(userId: string,projectId: string): Promise<RoomRole|null> {
  if (!userId || !projectId) return null
  const access = await requireProjectReadAccess(projectId,userId)
  if (!access.ok || !access.projectUserId) return null
  if (access.projectUserId === userId) return 'owner'
  const parsed = roomRoleSchema.safeParse(await canAccessProject(userId,projectId))
  // The owner role is established only by the recorded parent, never a membership string.
  return parsed.success && parsed.data !== 'owner' ? parsed.data : null
}
