/**
 * Enterprise Audit Trail — Full audit logging system for METARDU
 *
 * Provides structured logging, paginated querying, timeline retrieval,
 * and CSV export of all significant actions across the platform.
 *
 * DB table (run once to create):
 * ```sql
 * CREATE TABLE IF NOT EXISTS audit_logs (
 *   id SERIAL PRIMARY KEY,
 *   user_id UUID NOT NULL,
 *   action VARCHAR(100) NOT NULL,
 *   resource_type VARCHAR(50) NOT NULL,
 *   resource_id VARCHAR(100),
 *   details JSONB,
 *   ip_address INET,
 *   user_agent TEXT,
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 *
 * CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
 * CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
 * CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
 * CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
 * ```
 */

import { db } from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditEvent {
  id: number;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export interface AuditQuery {
  userId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// logAuditEvent
// ---------------------------------------------------------------------------

/**
 * Insert a new audit event into the audit_logs table.
 * All fields are required except ipAddress and userAgent which are optional.
 */
export async function logAuditEvent(event: Omit<AuditEvent, 'id'>): Promise<number> {
  const { userId, action, resourceType, resourceId, details, ipAddress, userAgent, timestamp } = event;

  const result = await db.query(
    `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address, user_agent, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      userId,
      action,
      resourceType,
      resourceId ?? null,
      details ? JSON.stringify(details) : null,
      ipAddress ?? null,
      userAgent ?? null,
      timestamp instanceof Date ? timestamp : new Date(),
    ],
  );

  return result.rows[0].id as number;
}

// ---------------------------------------------------------------------------
// queryAuditLogs
// ---------------------------------------------------------------------------

/**
 * Query audit logs with pagination and optional filters.
 * Returns both the matching events and the total count.
 */
export async function queryAuditLogs(
  query: AuditQuery,
): Promise<{ events: AuditEvent[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (query.userId) {
    conditions.push(`al.user_id = $${paramIdx++}`);
    params.push(query.userId);
  }
  if (query.action) {
    conditions.push(`al.action = $${paramIdx++}`);
    params.push(query.action);
  }
  if (query.resourceType) {
    conditions.push(`al.resource_type = $${paramIdx++}`);
    params.push(query.resourceType);
  }
  if (query.resourceId) {
    conditions.push(`al.resource_id = $${paramIdx++}`);
    params.push(query.resourceId);
  }
  if (query.startDate) {
    conditions.push(`al.created_at >= $${paramIdx++}`);
    params.push(query.startDate);
  }
  if (query.endDate) {
    conditions.push(`al.created_at <= $${paramIdx++}`);
    params.push(query.endDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 500);
  const offset = Math.max(query.offset ?? 0, 0);

  // Count query
  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM audit_logs al ${whereClause}`,
    params,
  );
  const total = parseInt(countResult.rows[0].total as string, 10) || 0;

  // Data query
  const dataResult = await db.query(
    `SELECT al.id,
            al.user_id as "userId",
            al.action,
            al.resource_type as "resourceType",
            al.resource_id as "resourceId",
            al.details,
            al.ip_address as "ipAddress",
            al.user_agent as "userAgent",
            al.created_at as "timestamp"
     FROM audit_logs al
     ${whereClause}
     ORDER BY al.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset],
  );

  const events: AuditEvent[] = dataResult.rows.map((row: Record<string, unknown>) => ({
    id: row.id as number,
    userId: row.userId as string,
    action: row.action as string,
    resourceType: row.resourceType as string,
    resourceId: row.resourceId as string | undefined,
    details: row.details as Record<string, unknown> | undefined,
    ipAddress: row.ipAddress as string | undefined,
    userAgent: row.userAgent as string | undefined,
    timestamp: new Date(row.timestamp as string),
  }));

  return { events, total };
}

// ---------------------------------------------------------------------------
// getAuditTimeline
// ---------------------------------------------------------------------------

/**
 * Get an activity timeline for a specific resource.
 * Returns all audit events for the given resource type + id, ordered
 * chronologically (newest first).
 */
export async function getAuditTimeline(
  resourceType: string,
  resourceId: string,
): Promise<AuditEvent[]> {
  const { rows } = await db.query(
    `SELECT al.id,
            al.user_id as "userId",
            al.action,
            al.resource_type as "resourceType",
            al.resource_id as "resourceId",
            al.details,
            al.ip_address as "ipAddress",
            al.user_agent as "userAgent",
            al.created_at as "timestamp"
     FROM audit_logs al
     WHERE al.resource_type = $1 AND al.resource_id = $2
     ORDER BY al.created_at DESC
     LIMIT 500`,
    [resourceType, resourceId],
  );

  return rows.map((row: Record<string, unknown>) => ({
    id: row.id as number,
    userId: row.userId as string,
    action: row.action as string,
    resourceType: row.resourceType as string,
    resourceId: row.resourceId as string | undefined,
    details: row.details as Record<string, unknown> | undefined,
    ipAddress: row.ipAddress as string | undefined,
    userAgent: row.userAgent as string | undefined,
    timestamp: new Date(row.timestamp as string),
  }));
}

// ---------------------------------------------------------------------------
// exportAuditCSV
// ---------------------------------------------------------------------------

/**
 * Export audit logs matching the query as a CSV string.
 * The first row is a header line with column names.
 */
export async function exportAuditCSV(query: AuditQuery): Promise<string> {
  // Fetch up to 10 000 rows for export
  const exportQuery: AuditQuery = {
    ...query,
    limit: Math.min(query.limit ?? 10000, 10000),
    offset: 0,
  };

  const { events } = await queryAuditLogs(exportQuery);

  const headers = [
    'id',
    'timestamp',
    'user_id',
    'action',
    'resource_type',
    'resource_id',
    'details',
    'ip_address',
    'user_agent',
  ];

  const rows = events.map((e) => {
    const detailsStr = e.details ? JSON.stringify(e.details) : '';
    return [
      String(e.id),
      e.timestamp.toISOString(),
      e.userId,
      csvEscape(e.action),
      csvEscape(e.resourceType),
      e.resourceId ? csvEscape(e.resourceId) : '',
      csvEscape(detailsStr),
      e.ipAddress ?? '',
      csvEscape(e.userAgent ?? ''),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape a string for CSV: wrap in double quotes and double any internal
 * double quotes.
 */
function csvEscape(value: string): string {
  if (!value) return '""';
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}
