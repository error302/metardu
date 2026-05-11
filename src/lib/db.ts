import { Pool, type PoolClient, type QueryResult } from 'pg'
import { env } from '@/lib/env'

let pool: Pool | null = null

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

/** Get the singleton Pool instance (lazy-initialized) */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(getPoolConfig())
  }
  return pool
}

/** Convenient query helper — acquires and releases a client per call */
export const db = {
  query: async (text: string, params?: unknown[]): Promise<QueryResult> => {
    const client = await getPool().connect()
    try {
      return await client.query(text, params)
    } finally {
      client.release()
    }
  },

  /**
   * Run multiple queries in a single atomic transaction.
   * The callback receives a connected client. If the callback throws,
   * the transaction is rolled back automatically.
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
