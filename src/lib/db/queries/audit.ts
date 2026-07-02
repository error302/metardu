/**
 * Audit Trail Database Queries
 *
 * Every survey operation must be logged for legal compliance.
 * This creates an immutable record of all computations and corrections.
 *
 * AUDIT FIX (H1, 2026-07-02): Rewrote from Prisma client to raw SQL.
 * The Prisma schema declared an `AuditLog` model with camelCase fields
 * (entityType, entityId, userName, timestamp) but the actual SQL table
 * is `audit_logs` with snake_case columns (entity_type, entity_id,
 * user_id, user_name, created_at). Now uses the real schema.
 */

import { db } from '@/lib/db'

export interface CreateAuditEntry {
  entityType: string
  entityId: string
  action: string
  userId: string
  userName: string
  changes?: string
}

export interface AuditLogRow {
  id: string
  entity_type: string
  entity_id: string
  action: string
  user_id: string | null
  user_name: string | null
  changes: string | null
  created_at: string
}

/**
 * Create an audit log entry.
 * This is fire-and-forget — it should never block the main operation.
 */
export async function createAuditLog(entry: CreateAuditEntry): Promise<AuditLogRow | null> {
  try {
    const { rows } = await db.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, user_id, user_name, changes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, entity_type, entity_id, action, user_id, user_name, changes, created_at`,
      [
        entry.entityType,
        entry.entityId,
        entry.action,
        entry.userId,
        entry.userName,
        entry.changes ?? null,
      ]
    )
    return rows[0] as AuditLogRow
  } catch (error) {
    // Audit logging should never fail the main operation
    console.error('Audit log creation failed:', error)
    return null
  }
}

/**
 * Get audit trail for an entity.
 */
export async function getAuditTrail(
  entityType: string,
  entityId: string
): Promise<AuditLogRow[]> {
  const { rows } = await db.query(
    `SELECT id, entity_type, entity_id, action, user_id, user_name, changes, created_at
     FROM audit_logs
     WHERE entity_type = $1 AND entity_id = $2
     ORDER BY created_at DESC`,
    [entityType, entityId]
  )
  return rows as AuditLogRow[]
}

/**
 * Get recent audit entries for a user.
 */
export async function getRecentAuditEntries(
  userId: string,
  limit: number = 50
): Promise<AuditLogRow[]> {
  const { rows } = await db.query(
    `SELECT id, entity_type, entity_id, action, user_id, user_name, changes, created_at
     FROM audit_logs
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  )
  return rows as AuditLogRow[]
}
