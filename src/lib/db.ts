import { Pool, type PoolClient, type QueryResult } from 'pg'
import { env } from '@/lib/env'

let pool: Pool | null = null

/**
 * Per-request storage for the current user ID.
 * Set by API routes after authentication, read by db.query() to
 * configure the PostgreSQL session variable used by RLS policies.
 *
 * Uses AsyncLocalStorage so it's safe across concurrent requests.
 */
import { AsyncLocalStorage } from 'async_hooks'

const userIdStore = new AsyncLocalStorage<string>()

/** Set the current user ID for RLS (call this in API routes after auth) */
export function setCurrentUserId(userId: string) {
  userIdStore.enterWith(userId)
}

/** Get the current user ID (used internally by db.query) */
function getCurrentUserId(): string | undefined {
  return userIdStore.getStore()
}

function getPoolConfig() {
  if (env.DATABASE_URL) {
    return {
      connectionString: env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    }
  }

  if (env.DB_HOST && env.DB_NAME && env.DB_USER) {
    return {
      host: env.DB_HOST,
      port: env.DB_PORT ?? 5432,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    }
  }

  throw new Error('Database connection is not configured. Set DATABASE_URL or DB_HOST/DB_NAME/DB_USER.')
}

/** UUID validation regex for RLS context safety */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Get the singleton Pool instance (lazy-initialized) */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(getPoolConfig())
    // NOTE: DDL migrations removed from hot path.
    // Column additions (payment_history.plan_id, transaction_id) are handled
    // by scripts/migrate.js which runs in docker-entrypoint.sh before the
    // server starts. Running ALTER TABLE on every pool creation takes an
    // ACCESS EXCLUSIVE lock on the table, blocking all reads/writes.
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
  }
}

/** Set the RLS session variable on a client (exported for manual transaction use) */
export async function setRlsContext(client: PoolClient | Pool) {
  return _setRlsContext(client)
}

/** Convenient query helper — acquires and releases a client per call */
export const db = {
  query: async (text: string, params?: unknown[]): Promise<QueryResult> => {
    const client = await getPool().connect()
    try {
      const userId = getCurrentUserId()
      if (userId) {
        // Defense-in-depth: validate UUID format before interpolating into SQL.
        if (!UUID_RE.test(userId)) {
          throw new Error(`Invalid userId format for RLS context: ${userId}`)
        }
        await client.query(`SET LOCAL request.user_id = '${userId}'`)
      }
      return await client.query(text, params)
    } finally {
      client.release()
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
      const userId = getCurrentUserId()
      if (userId) {
        if (!UUID_RE.test(userId)) {
          throw new Error(`Invalid userId format for RLS context: ${userId}`)
        }
        await client.query(`SET LOCAL request.user_id = '${userId}'`)
      }
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
}

export default db
