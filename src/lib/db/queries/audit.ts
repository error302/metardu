/**
 * Audit Trail Database Queries
 * 
 * Every survey operation must be logged for legal compliance.
 * This creates an immutable record of all computations and corrections.
 */

import prisma from '../client';

export interface CreateAuditEntry {
  entityType: string;
  entityId: string;
  action: string;
  userId: string;
  userName: string;
  changes?: string;
}

/**
 * Create an audit log entry.
 * This is fire-and-forget — it should never block the main operation.
 */
export async function createAuditLog(entry: CreateAuditEntry) {
  try {
    return await prisma.auditLog.create({
      data: {
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        userId: entry.userId,
        userName: entry.userName,
        changes: entry.changes,
      },
    });
  } catch (error) {
    // Audit logging should never fail the main operation
    console.error('Audit log creation failed:', error);
    return null;
  }
}

/**
 * Get audit trail for an entity.
 */
export async function getAuditTrail(entityType: string, entityId: string) {
  return prisma.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { timestamp: 'desc' },
  });
}

/**
 * Get recent audit entries for a user.
 */
export async function getRecentAuditEntries(userId: string, limit: number = 50) {
  return prisma.auditLog.findMany({
    where: { userId },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
}
