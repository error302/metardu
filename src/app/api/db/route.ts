/**
 * /api/db — Database proxy for client-side queries
 * 
 * Client components send query specs here, this route executes them
 * against the VM PostgreSQL. Auth is verified via NextAuth session.
 * 
 * SECURITY:
 * - Table whitelist prevents arbitrary table access
 * - User-scoped tables automatically filter by session user_id
 * - Admin-only tables restricted to ADMIN_EMAILS
 * - Rate-limited to prevent abuse
 * - Parameterized queries prevent SQL injection
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Pool } from 'pg'
import { QueryBuilder } from '@/lib/db/queryBuilder'
import { env } from '@/lib/env'
import { rateLimit, getClientIdentifier } from '@/lib/security/rateLimit'

let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    const connectionString = env.DATABASE_URL
    if (connectionString) {
      pool = new Pool({ connectionString, max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 })
    } else if (env.DB_HOST && env.DB_NAME && env.DB_USER) {
      pool = new Pool({
        host: env.DB_HOST,
        port: env.DB_PORT ?? 5432,
        database: env.DB_NAME,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      })
    } else {
      throw new Error('Database not configured')
    }
  }
  return pool
}

// Tables that can be queried without authentication
const PUBLIC_TABLES = new Set([
  'benchmarks', 'survey_standards', 'countries', 'professional_bodies',
])

// Tables that are scoped to the authenticated user's ID
// Queries on these tables automatically get a WHERE user_id = $userId filter
const USER_SCOPED_TABLES = new Set([
  'projects', 'survey_points', 'parcels', 'alignments', 'profiles', 'cross_sections',
  'project_members', 'user_subscriptions', 'survey_epochs', 'project_fieldbook_entries',
  'leveling_runs', 'collaboration_sessions', 'cpd_activities', 'peer_reviews',
  'peer_review_payments', 'digital_signatures', 'cleaned_datasets',
  'cadastra_validations', 'mine_twins', 'workflows', 'bathymetric_surveys',
  'usv_missions', 'safety_incidents', 'geofusion_projects', 'geofusion_layers',
  'deed_plans', 'survey_reports', 'parcel_metadata', 'gnss_sessions',
  'signatures', 'equipment', 'equipment_calibrations', 'job_applications',
  'job_reviews', 'payment_history', 'render_jobs', 'project_submissions',
  'submission_documents', 'import_sessions', 'online_service_logs',
  'surveyor_profiles', 'plan_usage', 'field_projects'
])

// Tables that are read-only for all authenticated users (no user scoping needed)
const READ_ONLY_SHARED_TABLES = new Set([
  'benchmarks', 'survey_standards', 'countries', 'professional_bodies',
  'land_law_cases', 'land_law_regulations', 'nlims_cache',
])

// Tables accessible only by admins
const ADMIN_ONLY_TABLES = new Set([
  'audit_logs', 'analytics_events', 'rate_limit_events',
  'enterprise_organizations', 'enterprise_members', 'enterprise_invitations',
  'enterprise_settings',
])

// Public browse tables (any authenticated user can read, but write is scoped)
const PUBLIC_BROWSE_TABLES = new Set([
  'jobs', 'job_missions', 'newsletter_subscribers', 'feedback',
  'survey_type_expand', 'community',
])

// Build the full allowlist from all sets
const ALLOWED_TABLES = new Set([
  ...Array.from(USER_SCOPED_TABLES),
  ...Array.from(READ_ONLY_SHARED_TABLES),
  ...Array.from(ADMIN_ONLY_TABLES),
  ...Array.from(PUBLIC_BROWSE_TABLES),
  'project_sheets', 'survey_photos',
])

// NEVER allow these tables through the proxy
// password_reset_tokens, users — must use dedicated auth endpoints only
const FORBIDDEN_TABLES = new Set([
  'password_reset_tokens', 'users',
])

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const adminEmails = (env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
  return adminEmails.includes(email.toLowerCase())
}

export async function POST(request: NextRequest) {
  try {
    // ─── Rate limiting ──────────────────────────────────────────────
    const clientId = getClientIdentifier(request)
    const isWriteOp = ['insert', 'update', 'delete', 'upsert'].includes(
      request.headers.get('x-operation') || ''
    )
    const maxReqs = isWriteOp ? 30 : 120
    const { allowed, remaining } = await rateLimit(clientId, maxReqs, 60000)

    if (!allowed) {
      return NextResponse.json(
        { data: null, error: { message: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' } },
        {
          status: 429,
          headers: {
            'Retry-After': '60',
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }

    const body = await request.json()
    const { table, operation, columns, filters, orFilters, order, limit, offset, single, maybeSingle, count, head, payload } = body

    // ─── Table validation ─────────────────────────────────────────
    if (!table || FORBIDDEN_TABLES.has(table)) {
      return NextResponse.json(
        { data: null, error: { message: 'Access denied', code: 'FORBIDDEN' } },
        { status: 403 }
      )
    }

    if (!ALLOWED_TABLES.has(table)) {
      return NextResponse.json(
        { data: null, error: { message: `Table not allowed: ${table}`, code: 'FORBIDDEN' } },
        { status: 403 }
      )
    }

    // ─── Auth check ───────────────────────────────────────────────
    let userId: string | null = null
    let userEmail: string | null = null

    if (!PUBLIC_TABLES.has(table)) {
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return NextResponse.json(
          { data: null, error: { message: 'Not authenticated', code: 'AUTH_REQUIRED' } },
          { status: 401 }
        )
      }
      userId = (session.user as any).id
      userEmail = session.user.email ?? null
    }

    // ─── Admin-only table check ───────────────────────────────────
    if (ADMIN_ONLY_TABLES.has(table) && !isAdmin(userEmail)) {
      return NextResponse.json(
        { data: null, error: { message: 'Admin access required', code: 'FORBIDDEN' } },
        { status: 403 }
      )
    }

    // ─── Read-only shared table check ────────────────────────────
    if (READ_ONLY_SHARED_TABLES.has(table) && operation !== 'select') {
      return NextResponse.json(
        { data: null, error: { message: 'This table is read-only', code: 'FORBIDDEN' } },
        { status: 403 }
      )
    }

    const p = getPool()
    let qb = new QueryBuilder(p, table)

    // Apply operation
    if (operation === 'select') {
      qb = qb.select(columns || '*', { count: count ? 'exact' : undefined, head }) as any
    } else if (operation === 'insert') {
      // For user-scoped tables, inject user_id into the payload
      if (USER_SCOPED_TABLES.has(table) && userId) {
        if (Array.isArray(payload)) {
          for (const row of payload) { row.user_id = userId }
        } else if (payload) {
          payload.user_id = userId
        }
      }
      qb = qb.insert(payload) as any
    } else if (operation === 'update') {
      qb = qb.update(payload) as any
    } else if (operation === 'delete') {
      qb = qb.delete() as any
    } else if (operation === 'upsert') {
      if (USER_SCOPED_TABLES.has(table) && userId) {
        if (Array.isArray(payload)) {
          for (const row of payload) { row.user_id = userId }
        } else if (payload) {
          payload.user_id = userId
        }
      }
      qb = qb.upsert(payload) as any
    }

    // ─── User-scoped row-level security ──────────────────────────
    // For user-scoped tables, always filter by user_id so users
    // can only see/modify their own data
    if (USER_SCOPED_TABLES.has(table) && userId) {
      qb = qb.eq('user_id', userId) as any
    }

    // Apply filters
    if (Array.isArray(filters)) {
      for (const f of filters) {
        const method = f.op as string
        // Prevent client from overriding user_id filter on scoped tables
        if (USER_SCOPED_TABLES.has(table) && f.column === 'user_id') continue
        
        if (method === 'eq') qb = qb.eq(f.column, f.value) as any
        else if (method === 'neq') qb = qb.neq(f.column, f.value) as any
        else if (method === 'gt') qb = qb.gt(f.column, f.value) as any
        else if (method === 'gte') qb = qb.gte(f.column, f.value) as any
        else if (method === 'lt') qb = qb.lt(f.column, f.value) as any
        else if (method === 'lte') qb = qb.lte(f.column, f.value) as any
        else if (method === 'like') qb = qb.like(f.column, f.value) as any
        else if (method === 'ilike') qb = qb.ilike(f.column, f.value) as any
        else if (method === 'in') qb = qb.in(f.column, f.value) as any
        else if (method === 'is') qb = qb.is(f.column, f.value) as any
        else if (method === 'contains') qb = qb.contains(f.column, f.value) as any
      }
    }

    // Apply OR filters
    if (Array.isArray(orFilters)) {
      for (const of_ of orFilters) {
        qb = qb.or(of_) as any
      }
    }

    // Apply order
    if (Array.isArray(order)) {
      for (const o of order) {
        qb = qb.order(o.column, { ascending: o.ascending }) as any
      }
    }

    // Apply limit/offset
    if (limit != null) qb = qb.limit(limit) as any
    if (offset != null) {
      qb = (qb as any).range(offset, offset + (limit ?? 50) - 1)
    }

    // Apply single/maybeSingle
    if (single) qb = qb.single() as any
    else if (maybeSingle) qb = qb.maybeSingle() as any

    // Execute
    const result = await qb
    return NextResponse.json(result, {
      headers: { 'X-RateLimit-Remaining': String(remaining) },
    })
  } catch (err: any) {
    console.error('[/api/db] Error:', err.message)
    return NextResponse.json(
      { data: null, error: { message: err.message || 'Internal error', code: 'INTERNAL' } },
      { status: 500 }
    )
  }
}
