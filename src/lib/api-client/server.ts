/**
 * Server-side database client
 * Uses direct PostgreSQL via pg Pool.
 *
 * @deprecated Auth methods (.auth.getSession / .auth.getUser) are migration artifacts.
 * Use `getServerSession(authOptions)` or `requireAuth()` from `@/lib/auth/` instead.
 * DB methods (.from()) are actively used and safe.
 */

import { QueryBuilder } from '@/lib/db/queryBuilder'
import { getPool } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export interface DbClient {
  from(table: string): QueryBuilder
  auth: {
    getUser(): Promise<{ data: { user: any | null }; error: { message: string } | null }>
    getSession(): Promise<{ data: { session: any | null }; error: { message: string } | null }>
    exchangeCodeForSession(code: string): Promise<{ data: { session: any | null }; error: null }>
  }
  channel(name: string): any
  removeChannel(channel: any): Promise<void>
  storage: {
    from(bucket: string): {
      upload(path: string, file: any, opts?: any): Promise<{ data: any; error: any }>
      getPublicUrl(path: string): { data: { publicUrl: string } }
      createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: any }>
      download(path: string): Promise<{ data: any; error: any }>
      remove(paths: string[]): Promise<{ data: any; error: any }>
    }
  }
  rpc(fn: string, args?: any): Promise<{ data: any; error: any }>
}

export async function createClient(): Promise<DbClient> {
  const getCompatSession = async () => {
    const session = await getServerSession(authOptions)
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
      return new QueryBuilder(getPool(), table)
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
      async exchangeCodeForSession(_code: string) {
        // No-op — auth code exchange handled by NextAuth
        return { data: { session: null }, error: null }
      },
    },
    // Realtime stubs — use @/lib/realtime for polling-based realtime
    channel(_name: string) {
      return {
        on(..._args: any[]) { return this },
        subscribe() { return this },
        track() { return Promise.resolve() },
        untrack() { return Promise.resolve() },
        presenceState() { return {} },
      }
    },
    async removeChannel(_channel: any) {},
    // Storage stubs — use /api/storage endpoint (GCS-backed) instead
    storage: {
      from(_bucket: string) {
        return {
          upload: async () => ({ data: null, error: { message: 'Use /api/storage endpoint (GCS-backed) instead.' } }),
          getPublicUrl: () => ({ data: { publicUrl: '' }, error: { message: 'Use /api/storage endpoint (GCS-backed) instead.' } }),
          createSignedUrl: async () => ({ data: null, error: { message: 'Use /api/storage endpoint (GCS-backed) instead.' } }),
          download: async () => ({ data: null, error: { message: 'Use /api/storage endpoint (GCS-backed) instead.' } }),
          remove: async () => ({ data: null, error: { message: 'Use /api/storage endpoint (GCS-backed) instead.' } }),
        }
      }
    },
    rpc: async (fn: string, _args?: any) => {
      console.warn(`[db/server] rpc(${fn}) called but not implemented.`)
      return { data: null, error: { message: 'RPC not implemented' } }
    }
  }
}