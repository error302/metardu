/**
 * Structured application logging for PM2 + audit trail.
 */
type LogLevel = 'info' | 'warn' | 'error' | 'audit'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  user_id?: string
  action?: string
  resource?: string
  ip?: string
  metadata?: Record<string, unknown>
}

export function log(entry: Omit<LogEntry, 'timestamp'>) {
  const full: LogEntry = { ...entry, timestamp: new Date().toISOString() }
  console.log(JSON.stringify(full))
}

export function auditLog(
  userId: string,
  action: string,
  resource: string,
  metadata?: Record<string, unknown>
) {
  log({
    level: 'audit',
    message: `${action} on ${resource}`,
    user_id: userId,
    action,
    resource,
    metadata,
  })
}
