/**
 * apiHandler — Standardized API route wrapper for METARDU.
 *
 * Solves G1 (auth enforcement), G2 (Zod validation), G7 (error handling)
 * in a single composable function that every API route uses.
 *
 * Usage:
 * export const GET = apiHandler({ auth: true }, async (req, ctx) => { ... })
 * export const POST = apiHandler({ auth: true, schema: CreateProjectSchema }, async (req, ctx) => { ... })
 * export const POST = apiHandler({ auth: false, rateLimit: { max: 3, windowMs: 60000 } }, async (req, ctx) => { ... })
 * export const POST = apiHandler({ auth: true, rawBody: true }, async (req, ctx) => { ... })  // no JSON parse
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { rateLimit, getClientIdentifier } from '@/lib/security/rateLimit'
import { auditLog } from '@/lib/logger'
import type { ZodSchema } from 'zod'
import type { Session } from 'next-auth'

export interface ApiHandlerContext {
  session: Session
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

      const userId = session?.user?.id ?? 'anonymous'

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