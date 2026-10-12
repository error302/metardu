/**
 * Server-side database client
 * Uses the request-context-aware PostgreSQL helper under the captured session.
 *
 * @deprecated Auth methods (.auth.getSession / .auth.getUser) are migration artifacts.
 * Use `getServerSession(authOptions)` or `requireAuth()` from `@/lib/auth/` instead.
 * DB methods (.from()) are actively used and safe.
 */

import { AsyncResource } from 'node:async_hooks'
import { QueryBuilder, type QueryExecutor } from '@/lib/db/queryBuilder'
import { db, setCurrentRlsServiceRole, setCurrentTillClaimCode } from '@/lib/db'
import { setAuthenticatedDatabaseContext, resolveAuthenticatedOrganization } from '@/lib/auth/requestContext'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// from() returns QueryBuilder which defaults to Record<string, unknown> for type safety.
export interface DbClient {
  from(table: string): QueryBuilder
  auth: {
    getUser(): Promise<{ data: { user: { id?: unknown; email?: unknown; name?: unknown } | null }; error: { message: string } | null }>
    getSession(): Promise<{ data: { session: unknown | null }; error: { message: string } | null }>
  }
}

export async function createClient(): Promise<DbClient> {
  const authenticatedSession = await getServerSession(authOptions)
  const userId = authenticatedSession?.user?.id ?? null
  const inSessionScope = async <T,>(work: () => Promise<T>, organizationId: string | null = null): Promise<T> => {
    const resource = new AsyncResource('METARDU_SERVER_DATABASE_CLIENT')
    try {
      return await resource.runInAsyncScope(() => {
        setAuthenticatedDatabaseContext(userId, organizationId)
        setCurrentRlsServiceRole(null)
        setCurrentTillClaimCode(null)
        return work()
      })
    } finally { resource.emitDestroy() }
  }
  const organizationId = userId === null ? null
    : await inSessionScope(() => resolveAuthenticatedOrganization(userId))
  const executor: QueryExecutor = {
    query: (sql, params) => inSessionScope(() => db.query(sql, params), organizationId),
  }
  const getCompatSession = async () => {
    const session = authenticatedSession
    if (!session?.user?.email) return null
    return {
      ...session,
      user: {
        ...session.user,
        id: (session.user as { id?: string }).id ?? '',
        user_metadata: { full_name: session.user.name ?? '' },
      },
    }
  }

  return {
    from(table: string): QueryBuilder {
      return new QueryBuilder(executor, table)
    },
    auth: {
      async getUser() {
        const session = await getCompatSession()
        return { data: { user: session?.user ?? null }, error: null }
      },
      async getSession() {
        const session = await getCompatSession()
        return { data: { session }, error: null }
      },
    }
  }
}
