/**
 * apiHandler — Standardized API route wrapper for METARDU.
 *
 * Solves G1 (auth enforcement), G2 (Zod validation), G7 (error handling)
 * in a single composable function that every API route uses.
 *
 * When auth:true, automatically sets RLS context via setCurrentUserId()
 * so that PostgreSQL row-level security policies work correctly.
 *
 * Usage:
 * export const GET = apiHandler({ auth: true }, async (req, ctx) => { ... })
 * export const POST = apiHandler({ auth: true, schema: CreateProjectSchema }, async (req, ctx) => { ... })
 * export const POST = apiHandler({ auth: false, rateLimit: { max: 3, windowMs: 60000 } }, async (req, ctx) => { ... })
 * export const POST = apiHandler({ auth: true, rawBody: true }, async (req, ctx) => { ... })  // no JSON parse
 *
 * Method-level overrides (different auth/validation per HTTP method):
 * export const GET = apiHandler({ auth: false }, async (req, ctx) => { ... })
 * export const POST = apiHandler({ auth: true, schema }, async (req, ctx) => { ... })
 * export const PATCH = apiHandler({ auth: true, schema, optimisticLock: true }, async (req, ctx) => { ... })
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { rateLimit, getClientIdentifier } from '@/lib/security/rateLimit'
import { auditLog } from '@/lib/logger'
import { setCurrentUserId } from '@/lib/db'
import { captureError } from '@/lib/monitoring/sentry'
import type { ZodSchema } from 'zod'
import type { Session } from 'next-auth'

export interface ApiHandlerContext {
  session: Session | null
  userId: string
  body: unknown
  params: Record<string, string>
}

export interface ApiHandlerOptions {
  auth?: boolean
  schema?: ZodSchema
  rateLimit?: { max: number; windowMs: number }
  audit?: string
  roles?: string[]
  rawBody?: boolean
  /**
   * Enable optimistic locking for PATCH/PUT requests.
   * Requires the request body to include an `updated_at` field.
   * The handler should check that the DB's updated_at matches the submitted value.
   * If there's a mismatch, returns 409 Conflict.
   */
  optimisticLock?: boolean
}

type HandlerFn = (
  req: NextRequest,
  ctx: ApiHandlerContext
) => Promise<NextResponse>

export function apiHandler(
  options: ApiHandlerOptions,
  handler: HandlerFn
): (req: NextRequest, context?: { params?: Record<string, string | string[]> }) => Promise<NextResponse> {
  const { auth = true, schema, rateLimit: rlConfig, audit: auditAction, roles, rawBody } = options

  return async (req, context) => {
    let userId = 'anonymous'
    try {
      if (rlConfig) {
        const identifier = getClientIdentifier(req)
        const { allowed, remaining } = await rateLimit(identifier, rlConfig.max, rlConfig.windowMs)
        if (!allowed) {
          return NextResponse.json(
            { error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' },
            { status: 429, headers: { 'X-RateLimit-Remaining': String(remaining) } }
          )
        }
      }

      let session: Session | null = null
      if (auth) {
        const s = await getServerSession(authOptions)
        if (!s?.user) {
          return NextResponse.json(
            { error: 'Authentication required', code: 'UNAUTHORIZED' },
            { status: 401 }
          )
        }
        session = s

        // Set RLS context so PostgreSQL current_user_id() works
        const uid = (s.user as { id?: string }).id
        if (uid) {
          setCurrentUserId(String(uid))
        }

        if (roles && roles.length > 0) {
          const userRole = (session.user as { role?: string }).role ?? 'surveyor'
          if (!roles.includes(userRole)) {
            return NextResponse.json(
              { error: 'Insufficient permissions', code: 'FORBIDDEN' },
              { status: 403 }
            )
          }
        }
      }

      userId = (session?.user as { id?: string })?.id ?? 'anonymous'

      let body: unknown = undefined
      if (req.method !== 'GET' && req.method !== 'HEAD' && !rawBody) {
        try {
          body = await req.json()
        } catch {
          return NextResponse.json(
            { error: 'Invalid JSON body', code: 'INVALID_BODY' },
            { status: 400 }
          )
        }

        if (schema) {
          const parsed = schema.safeParse(body)
          if (!parsed.success) {
            return NextResponse.json(
              { error: 'Validation failed', code: 'VALIDATION_ERROR', issues: parsed.error.issues },
              { status: 400 }
            )
          }
          body = parsed.data
        }

        // Optimistic locking check for PATCH/PUT
        if (options.optimisticLock && (req.method === 'PATCH' || req.method === 'PUT')) {
          const bodyObj = body as Record<string, unknown>
          if (!bodyObj.updated_at) {
            return NextResponse.json(
              { error: 'Optimistic locking requires updated_at field', code: 'CONFLICT_CHECK_REQUIRED' },
              { status: 400 }
            )
          }
        }
      }

      const rawParams = context?.params || {}
      const params: Record<string, string> = {}
      for (const [key, val] of Object.entries(rawParams)) {
        params[key] = Array.isArray(val) ? val[0] : val
      }

      const ctx: ApiHandlerContext = {
        // When auth: false, session is null — callers must handle this
        session: session as Session,
        userId,
        body,
        params,
      }

      const result = await handler(req, ctx)

      if (auditAction && auth) {
        auditLog(userId, auditAction, `${req.method} ${req.nextUrl.pathname}`)
      }

      return result
    } catch (err: unknown) {
      console.error('[apiHandler] Unhandled error:', err)

      // Send to Sentry (only in production, key scrubbed by beforeSend)
      captureError(err instanceof Error ? err : new Error(String(err)), {
        path: req.nextUrl.pathname,
        method: req.method,
        userId,
      })

      const pgCode = (err as { code?: string })?.code
      if (pgCode === '23505') {
        return NextResponse.json(
          { error: 'This record already exists', code: 'DUPLICATE' },
          { status: 409 }
        )
      }
      if (pgCode === '23503') {
        return NextResponse.json(
          { error: 'Referenced record not found', code: 'FOREIGN_KEY_VIOLATION' },
          { status: 400 }
        )
      }
      if (pgCode === '42501') {
        return NextResponse.json(
          { error: 'Permission denied', code: 'PERMISSION_DENIED' },
          { status: 403 }
        )
      }

      return NextResponse.json(
        { error: 'Internal server error', code: 'INTERNAL_ERROR' },
        { status: 500 }
      )
    }
  }
}

/**
 * Check optimistic locking conflict inside a handler.
 * Call this after fetching the current DB row but before applying updates.
 *
 * @returns NextResponse (409) if conflict detected, null if no conflict
 *
 * @example
 * const conflict = checkOptimisticLock(ctx.body, dbRow)
 * if (conflict) return conflict
 */
export function checkOptimisticLock(
  requestBody: Record<string, unknown>,
  dbRow: { updated_at: string | Date | null }
): NextResponse | null {
  const clientUpdatedAt = requestBody.updated_at as string | undefined
  if (!clientUpdatedAt || !dbRow.updated_at) return null

  const clientTime = new Date(clientUpdatedAt).getTime()
  const dbTime = new Date(dbRow.updated_at).getTime()

  // Allow 1-second tolerance for clock drift / rounding
  if (Math.abs(clientTime - dbTime) > 1000) {
    return NextResponse.json(
      {
        error: 'This record was modified by another user. Please refresh and try again.',
        code: 'CONFLICT',
        db_updated_at: dbRow.updated_at,
      },
      { status: 409 }
    )
  }
  return null
}

/**
 * Standardized success response helpers
 */
export function apiSuccess(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

export function apiCreated(data: unknown) {
  return NextResponse.json(data, { status: 201 })
}

export function apiNoContent() {
  return new NextResponse(null, { status: 204 })
}