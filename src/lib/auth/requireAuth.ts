/**
 * requireAuth — Server-side auth guard for API routes.
 * Uses NextAuth getServerSession (not getUser, which causes timeouts).
 * 
 * Usage in any /api/* route handler:
 *   const { session, error } = await requireAuth()
 *   if (error) return error
 *   // session.user is available
 */
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { Pool } from 'pg'
import { env } from '@/lib/env'

export async function requireAuth() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return {
        session: null,
        error: NextResponse.json(
          { error: 'Authentication required', code: 'UNAUTHORIZED' },
          { status: 401 }
        ),
      }
    }
    return { session, error: null }
  } catch (err) {
    console.error('[requireAuth] Session check failed:', err)
    return {
      session: null,
      error: NextResponse.json(
        { error: 'Authentication check failed', code: 'AUTH_ERROR' },
        { status: 401 }
      ),
    }
  }
}

/**
 * requireRole — Auth guard that also checks user role from surveyor_profiles.
 * Call after requireAuth() succeeds.
 */
let rolePool: Pool | null = null
function getRolePool(): Pool {
  if (!rolePool) {
    if (env.DATABASE_URL) {
      rolePool = new Pool({ connectionString: env.DATABASE_URL, max: 3, connectionTimeoutMillis: 3000 })
    } else if (env.DB_HOST) {
      rolePool = new Pool({
        host: env.DB_HOST, port: env.DB_PORT ?? 5432,
        database: env.DB_NAME!, user: env.DB_USER!, password: env.DB_PASSWORD,
        max: 3, connectionTimeoutMillis: 3000,
      })
    } else {
      throw new Error('Database not configured for role check')
    }
  }
  return rolePool
}

export type UserRole = 'surveyor' | 'admin' | 'enterprise' | 'university' | 'government_auditor'

export async function requireRole(allowedRoles: UserRole[], userId: string) {
  const pool = getRolePool()
  const { rows } = await pool.query(
    'SELECT role, is_suspended FROM surveyor_profiles WHERE id = $1',
    [userId]
  )
  
  if (rows.length === 0) {
    return { allowed: false, error: 'Profile not found' }
  }
  
  const profile = rows[0]
  if (profile.is_suspended) {
    return { allowed: false, error: 'Account suspended' }
  }
  if (!allowedRoles.includes(profile.role)) {
    return { allowed: false, error: 'Insufficient permissions' }
  }
  
  return { allowed: true, role: profile.role }
}
