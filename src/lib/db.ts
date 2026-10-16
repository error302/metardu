import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg'
import { logger } from '@/lib/logger'
import { env } from '@/lib/env'

let pool: Pool | null = null
// Next development reloads this server module. Keep one pool across those
// reloads instead of orphaning connections until PostgreSQL refuses new ones.
const developmentPoolKey = Symbol.for('metardu.development.postgres-pool')
type DevelopmentPoolCache = typeof globalThis & { [developmentPoolKey]?: { pool: Pool; configuration: string } }

/**
 * Per-request storage for the current user ID and organization ID.
 * Set by API routes after authentication, read by db.query() to
 * configure the PostgreSQL session variables used by RLS policies.
 *
 * Uses AsyncLocalStorage so it's safe across concurrent requests.
 *
 * AUDIT FIX (C6, 2026-07-02): Added orgIdStore for org-level RLS.
 * Routes that operate on org-scoped resources should call
 * setCurrentOrgId() after authentication. When not set, RLS policies
 * fall back to user_id-only checks (legacy personal projects).
 */
import { AsyncLocalStorage } from 'async_hooks'

const userIdStore = new AsyncLocalStorage<string | null>()
const orgIdStore = new AsyncLocalStorage<string | null>()
const rlsServiceRoleStore = new AsyncLocalStorage<RlsServiceRole | null>()
const tillClaimCodeStore = new AsyncLocalStorage<string | null>()

export type RlsServiceRole = 'payment_provider' | 'billing_reconciliation' | 'platform_admin'
const RLS_SERVICE_ROLES = new Set<RlsServiceRole>([
  'payment_provider',
  'billing_reconciliation',
  'platform_admin',
])

/** Set the current user ID for RLS (call this in API routes after auth) */
export function setCurrentUserId(userId: string | null) {
  userIdStore.enterWith(userId)
}

/** Set the current organization ID for org-level RLS (call after auth) */
export function setCurrentOrgId(orgId: string | null) {
  orgIdStore.enterWith(orgId)
}

/** Mark a request as a server-authenticated payment, cron, or admin workflow. */
export function setCurrentRlsServiceRole(role: RlsServiceRole | null) {
  if (role !== null && !RLS_SERVICE_ROLES.has(role)) {
    throw new Error('Invalid service role for PostgreSQL RLS context.')
  }
  rlsServiceRoleStore.enterWith(role)
}

/** Scope the one unclaimed Till row a signed-in user is attempting to claim. */
export function setCurrentTillClaimCode(code: string | null) {
  if (code !== null && !/^[A-Z0-9]{8,12}$/.test(code)) {
    throw new Error('Invalid M-Pesa Till code for PostgreSQL RLS context.')
  }
  tillClaimCodeStore.enterWith(code)
}

/** Get the current user ID (used internally by db.query) */
function getCurrentUserId(): string | null | undefined {
  return userIdStore.getStore()
}

/** Get the current organization ID (used internally by db.query) */
function getCurrentOrgId(): string | null | undefined {
  return orgIdStore.getStore()
}

function getCurrentRlsServiceRole(): RlsServiceRole | null | undefined {
  return rlsServiceRoleStore.getStore()
}

function getCurrentTillClaimCode(): string | null | undefined {
  return tillClaimCodeStore.getStore()
}

function getPoolConfig() {
  // Pool sizing — tune based on expected load.
  // Default 10 connections is conservative; production should set DB_POOL_MAX
  // based on (max_connections - reserved_for_admin - other_apps).
  //
  // Rule of thumb (HikariCP formula): pool_size = (peak_qps × avg_query_ms) / 1000
  // For METARDU: peak ~100 qps × 50ms = 5 connections minimum.
  // Set to 20 for headroom on multi-user deployments.
  const poolMax = parseInt(process.env.DB_POOL_MAX ?? '20', 10)
  const idleTimeoutMs = parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS ?? '30000', 10)
  const connTimeoutMs = parseInt(process.env.DB_POOL_CONNECT_TIMEOUT_MS ?? '2000', 10)
  const statementTimeoutMs = parseInt(process.env.DB_STATEMENT_TIMEOUT_MS ?? '10000', 10)

  const base = {
    max: poolMax,
    idleTimeoutMillis: idleTimeoutMs,
    connectionTimeoutMillis: connTimeoutMs, // Fail fast when DB is unavailable
    statement_timeout: statementTimeoutMs, // 10s — prevents runaway queries
    // Best-practice: keep idle connections warm so first request after idle
    // doesn't pay connection setup latency.
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  }

  if (env.DATABASE_URL) {
    return {
      connectionString: env.DATABASE_URL,
      ...base,
    }
  }

  if (env.DB_HOST && env.DB_NAME && env.DB_USER) {
    return {
      host: env.DB_HOST,
      port: env.DB_PORT ?? 5432,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      ...base,
    }
  }

  throw new Error('Database connection is not configured. Set DATABASE_URL or DB_HOST/DB_NAME/DB_USER.')
}

/** UUID validation regex for RLS context safety */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMPTY_RLS_UUID = '00000000-0000-0000-0000-000000000000'

/** Slow query threshold in milliseconds */
const SLOW_QUERY_THRESHOLD_MS = 5000

/**
 * T1.8 FIX (2026-07-09): Whitelist of table names allowed in
 * updateWithOptimisticLock / deleteWithOptimisticLock. Prevents SQL injection
 * via the `table` parameter (which is interpolated into the SQL string).
 * Add tables here as needed — the list covers the entities that have
 * `updated_at` columns per the canonical schema.
 */
const ALLOWED_TABLES = new Set([
  'projects',
  'deed_plans',
  'survey_points',
  'surveyor_profiles',
  'marketplace_listings',
  'marketplace_jobs',
  'scheme_parcels',
  'scheme_blocks',
  'scheme_beacons',
  'traverse_results',
  'traverse_observations',
  'payments',
  'subscriptions',
  'equipment',
  'beacons',
  'field_projects',
  'cpd_certificates',
  'cpd_activities',
  'white_label_settings',
  'announcements',
])

/** Assert that a table name is in the whitelist (SQL injection guard) */
function assertTable(table: string): void {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`[db] table "${table}" is not in the optimistic-lock whitelist. Add it to ALLOWED_TABLES in src/lib/db.ts.`)
  }
}

/** Get the singleton Pool instance (lazy-initialized) */
export function getPool(): Pool {
  if (!pool) {
    const config = getPoolConfig()
    const development = process.env.NODE_ENV === 'development'
    const registry = globalThis as DevelopmentPoolCache
    const configuration = JSON.stringify(config)
    const cached = development ? registry[developmentPoolKey] : undefined
    if (cached && cached.configuration !== configuration) throw new Error('Database configuration changed. Restart the development server before connecting.')
    pool = cached?.pool ?? new Pool(config)
    if (development && !cached) registry[developmentPoolKey] = { pool, configuration }
    // NOTE: DDL migrations removed from hot path.
    // Column additions (payment_history.plan_id, transaction_id) are handled
    // by scripts/migrate.js which runs in docker-entrypoint.sh before the
    // server starts. Running ALTER TABLE on every pool creation takes an
    // ACCESS EXCLUSIVE lock on the table, blocking all reads/writes.

    // Pool-level error listener — prevents unhandled errors from crashing the process
    if (!cached) pool.on('error', (err) => {
      logger.error('[db] Unexpected pool error:', { error: err })
    })
  }
  return pool
}

/**
 * Set the RLS session variable on a client so that current_user_id() works.
 * This must be called after acquiring a client and before any data queries.
 */
async function _setRlsContext(client: PoolClient | Pool) {
  const userId = getCurrentUserId()
  if (userId) {
    // Defense-in-depth: validate UUID format before interpolating into SQL.
    // SET LOCAL does not support $1 parameterized placeholders.
    if (!UUID_RE.test(userId)) {
      throw new Error(`Invalid userId format for RLS context: ${userId}`)
    }
    await client.query(`SET LOCAL request.user_id = '${userId}'`)
    await client.query(`SET LOCAL app.current_user_id = '${userId}'`)
  } else {
    await client.query(`SET LOCAL request.user_id = ''`)
    // Older table policies cast this compatibility setting directly to UUID;
    // an empty string would raise a database error on anonymous requests.
    await client.query(`SET LOCAL app.current_user_id = '${EMPTY_RLS_UUID}'`)
  }
  // AUDIT FIX (C6, 2026-07-02): Set org context for org-level RLS policies.
  const orgId = getCurrentOrgId()
  if (orgId) {
    if (!UUID_RE.test(orgId)) {
      throw new Error(`Invalid orgId format for RLS context: ${orgId}`)
    }
    await client.query(`SET LOCAL request.organization_id = '${orgId}'`)
  } else {
    // Explicitly clear (in case the connection was reused from the pool)
    await client.query(`SET LOCAL request.organization_id = ''`)
  }
  const serviceRole = getCurrentRlsServiceRole()
  await client.query(`SET LOCAL request.access_role = '${serviceRole ?? ''}'`)
  const tillClaimCode = getCurrentTillClaimCode()
  await client.query(`SET LOCAL request.till_claim_code = '${tillClaimCode ?? ''}'`)
}

/**
 * db.query runs its statement in PostgreSQL autocommit mode. SET LOCAL in a
 * preceding query is therefore cleared before the application query runs.
 * Set the request variables at session scope for this one pooled-client lease,
 * then clear them before returning that connection to the pool.
 */
async function _setRlsSessionContext(client: PoolClient) {
  const userId = getCurrentUserId()
  const orgId = getCurrentOrgId()
  const serviceRole = getCurrentRlsServiceRole()
  const tillClaimCode = getCurrentTillClaimCode()
  if (userId && !UUID_RE.test(userId)) {
    throw new Error(`Invalid userId format for RLS context: ${userId}`)
  }
  if (orgId && !UUID_RE.test(orgId)) {
    throw new Error(`Invalid orgId format for RLS context: ${orgId}`)
  }
  await client.query(
    `SELECT set_config('request.user_id', $1, false),
            set_config('request.organization_id', $2, false),
            set_config('app.current_user_id', $3, false),
            set_config('request.access_role', $4, false),
            set_config('request.till_claim_code', $5, false)`,
    [userId ?? '', orgId ?? '', userId ?? EMPTY_RLS_UUID, serviceRole ?? '', tillClaimCode ?? ''],
  )
}

async function _clearRlsSessionContext(client: PoolClient) {
  await client.query(
    `SELECT set_config('request.user_id', '', false),
            set_config('request.organization_id', '', false),
            set_config('app.current_user_id', $1, false),
            set_config('request.access_role', '', false),
            set_config('request.till_claim_code', '', false)`,
    [EMPTY_RLS_UUID],
  )
}

/** Set the RLS session variable on a client (exported for manual transaction use) */
export async function setRlsContext(client: PoolClient | Pool) {
  return _setRlsContext(client)
}

/** Convenient query helper — acquires and releases a client per call */
export const db = {
  query: async <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>> => {
    const client = await getPool().connect()
    const start = Date.now()
    let contextMayBeSet = false
    let clientDestroyed = false
    try {
      contextMayBeSet = true
      await _setRlsSessionContext(client)
      const result = await client.query(text, params)
      const elapsed = Date.now() - start
      if (elapsed > SLOW_QUERY_THRESHOLD_MS) {
        logger.warn(`[db] Slow query (${elapsed}ms): ${text.slice(0, 200)}`)
      }
      return result
    } finally {
      if (contextMayBeSet) {
        try {
          await _clearRlsSessionContext(client)
        } catch (error) {
          // Never return a pooled connection with request identity still set.
          // Destroy this client; the query result/error itself remains intact.
          logger.error('[db] Failed to clear request RLS context; destroying pooled connection:', { error })
          client.release(true)
          clientDestroyed = true
        }
      }
      if (!clientDestroyed) client.release()
    }
  },

  /**
   * Run multiple queries in a single atomic transaction.
   * The callback receives a connected client. If the callback throws,
   * the transaction is rolled back automatically.
   * RLS context is set automatically if a user ID is available.
   *
   * @example
   * await db.transaction(async (client) => {
   *   await client.query('INSERT INTO projects ...', [...])
   *   await client.query('INSERT INTO scheme_details ...', [...])
   * })
   */
  transaction: async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
    const client = await getPool().connect()
    try {
      await client.query('BEGIN')
      await _setRlsContext(client)
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  },

  getClient: async (): Promise<PoolClient> => getPool().connect(),

  /**
   * T1.8 FIX (2026-07-09): Optimistic locking UPDATE — puts the guard in the
   * SQL WHERE clause itself, eliminating the TOCTOU race in the old
   * `checkOptimisticLock()` helper (which did SELECT → JS check → UPDATE
   * without `AND updated_at = $2` in the UPDATE).
   *
   * Returns the updated row, or `null` if 0 rows were affected (meaning the
   * row was either modified by another user or doesn't exist — caller should
   * return 409 Conflict).
   *
   * @param table     - table name (validated against a whitelist; see assertTable)
   * @param id        - row UUID
   * @param updates   - { column: value, ... } — only these columns are SET
   * @param clientUpdatedAt - the updated_at the client saw when it read the row
   *
   * @example
   * const row = await db.updateWithOptimisticLock('projects', id, { name: 'New' }, body.updated_at)
   * if (!row) return NextResponse.json({ error: 'CONFLICT' }, { status: 409 })
   */
  updateWithOptimisticLock: async <T = Record<string, unknown>>(
    table: string,
    id: string,
    updates: Record<string, unknown>,
    clientUpdatedAt: string,
  ): Promise<T | null> => {
    assertTable(table)
    const cols = Object.keys(updates)
    if (cols.length === 0) {
      throw new Error('[db.updateWithOptimisticLock] no columns to update')
    }
    // Build SET clause: col1 = $1, col2 = $2, ...
    // Always bump updated_at in the same statement (atomic with the guard).
    const setClauses = cols.map((c, i) => `${c} = $${i + 1}`)
    const params: unknown[] = [...cols.map(c => updates[c]), id, clientUpdatedAt]
    const n = params.length
    const sql = `UPDATE ${table}
                 SET ${setClauses.join(', ')}, updated_at = NOW()
                 WHERE id = $${n - 1} AND updated_at = $${n}
                 RETURNING *`
    const { rows } = await db.query(sql, params)
    return (rows[0] as T) ?? null
  },

  /**
   * T1.8 FIX (2026-07-09): Optimistic locking DELETE — same pattern as
   * updateWithOptimisticLock but for deletes. Prevents deleting a row that
   * was modified after the client last read it.
   *
   * Returns `true` if the row was deleted, `false` if 0 rows affected (conflict).
   */
  deleteWithOptimisticLock: async (
    table: string,
    id: string,
    clientUpdatedAt: string,
  ): Promise<boolean> => {
    assertTable(table)
    const sql = `DELETE FROM ${table}
                 WHERE id = $1 AND updated_at = $2`
    const result = await db.query(sql, [id, clientUpdatedAt])
    return (result.rowCount ?? 0) > 0
  },

  /**
   * Health check — runs SELECT 1 with a 2-second timeout.
   * Returns true if the database is reachable, false otherwise.
   */
  isHealthy: async (): Promise<boolean> => {
    try {
      const p = getPool()
      const client = await p.connect()
      try {
        await client.query('SELECT 1')
        return true
      } finally {
        client.release()
      }
    } catch (err) {
      logger.error('[db] Health check failed:', { error: err })
      return false
    }
  },

  /**
   * Pool metrics — returns connection pool statistics.
   * Useful for monitoring and diagnostics.
   */
  getPoolMetrics: (): { totalCount: number; idleCount: number; waitingCount: number } => {
    const p = pool
    if (!p) {
      return { totalCount: 0, idleCount: 0, waitingCount: 0 }
    }
    return {
      totalCount: p.totalCount,
      idleCount: p.idleCount,
      waitingCount: p.waitingCount,
    }
  },
}

export default db
