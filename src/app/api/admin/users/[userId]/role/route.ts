import { NextResponse } from 'next/server';
import { apiHandler } from '@/lib/apiHandler';
import { setCurrentRlsServiceRole } from '@/lib/db';
import { assignRole, PLATFORM_ADMIN_API_ROLES, type Role, ROLE_HIERARCHY } from '@/lib/auth/rbac';
import { logAuditEvent } from '@/lib/enterprise/auditTrail';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const assignRoleSchema = z.object({
  role: z.enum(['super_admin', 'org_admin', 'project_manager', 'surveyor', 'viewer']),
});

/**
 * PUT /api/admin/users/[userId]/role
 *
 * Assign a global account role. Requires a freshly verified platform admin.
 * Organization invitations do not confer global account administration.
 * Body: { role: Role }
 */
export const PUT = apiHandler(
  { auth: true, roles: PLATFORM_ADMIN_API_ROLES, schema: assignRoleSchema , rateLimit: { max: 60, windowMs: 60000 } },
  async (req, ctx) => {
    const callerId = ctx.userId;
    const targetUserId = ctx.params.userId;
    const { role } = ctx.body as z.infer<typeof assignRoleSchema>;

    // apiHandler has replaced the session role with the fresh database role.
    const callerRoleRaw = ctx.session?.user.role || '';
    // Map legacy 'admin' → 'org_admin'
    const callerRole = (callerRoleRaw === 'admin' ? 'org_admin' : callerRoleRaw) as Role;
    const callerLevel = ROLE_HIERARCHY.indexOf(callerRole);
    const targetLevel = ROLE_HIERARCHY.indexOf(role);

    if (callerLevel === -1 || targetLevel === -1) {
      return NextResponse.json(
        { error: 'Invalid role', code: 'BAD_REQUEST' },
        { status: 400 },
      );
    }

    // Can only assign roles at or below your level
    if (targetLevel < callerLevel) {
      return NextResponse.json(
        { error: `Cannot assign role '${role}' — insufficient privilege. You can only assign roles at or below '${callerRole}'.`, code: 'FORBIDDEN' },
        { status: 403 },
      );
    }

    // Cannot change your own role
    if (callerId === targetUserId) {
      return NextResponse.json(
        { error: 'Cannot change your own role', code: 'BAD_REQUEST' },
        { status: 400 },
      );
    }

    // Assign the role
    setCurrentRlsServiceRole('platform_admin');
    await assignRole(targetUserId, role, callerId);

    // Audit log
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const userAgent = req.headers.get('user-agent') || undefined;
    await logAuditEvent({
      userId: callerId,
      action: 'user.role.assign',
      resourceType: 'user',
      resourceId: targetUserId,
      details: { newRole: role, previousRole: callerRoleRaw },
      ipAddress: clientIp,
      userAgent,
      timestamp: new Date(),
    });

    return NextResponse.json({
      success: true,
      data: {
        userId: targetUserId,
        newRole: role,
        assignedBy: callerId,
      },
    });
  },
);
