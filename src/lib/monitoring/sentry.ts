/**
 * Sentry monitoring integration for Metardu.
 *
 * In production (NEXT_PUBLIC_SENTRY_DSN set), errors are sent to Sentry.
 * In development, all capture functions log to console instead.
 *
 * Special tags:
 * - ai_error: NVIDIA API errors
 * - db_error: PostgreSQL errors
 * - payment_error: Payment processing errors
 */

import { logger, NO_FORWARD } from '@/lib/loggingCore'
import { sanitizeShareTelemetry } from './privateShareTelemetry'

// @sentry/nextjs (~180 KB minified across chunks) is loaded lazily: it only
// downloads when a capture/setUser call actually fires, and only when a DSN
// is configured. It previously sat in the static graph of every route via
// layout → WebVitals → webVitals.ts → this module.
type SeverityLevel = 'info' | 'warning' | 'error' | 'debug' | 'fatal' | 'log'
type SentryLike = {
  init: (opts: Record<string, unknown>) => void
  captureException: (e: unknown, hint?: Record<string, unknown>) => void
  captureMessage: (m: string, level?: SeverityLevel) => void
  setUser: (u: Record<string, unknown> | null) => void
  addBreadcrumb: (b: Record<string, unknown>) => void
  withScope: (cb: (scope: {
    setTag: (k: string, v: string) => void
    setExtra: (k: string, v: unknown) => void
    setUser: (u: Record<string, unknown>) => void
  }) => void) => void
}

let sentryPromise: Promise<SentryLike | null> | null = null

function loadSentry(): Promise<SentryLike | null> {
  if (!sentryPromise) {
    sentryPromise = import('@sentry/nextjs')
      .then((m) => m as unknown as SentryLike)
      .catch(() => null)
  }
  return sentryPromise
}

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN
const SENTRY_ENVIRONMENT = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'production'

const isProduction = () => !!SENTRY_DSN && !SENTRY_DSN.includes('mockup')

export function initSentry() {
  if (isProduction() && process.env.NODE_ENV === 'production') {
    void loadSentry().then((Sentry) => {
      if (!Sentry) return
      Sentry.init({
      dsn: SENTRY_DSN,
      environment: SENTRY_ENVIRONMENT,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      beforeSendTransaction: sanitizeShareTelemetry,
      beforeBreadcrumb: (breadcrumb: Record<string, unknown>) => sanitizeShareTelemetry({ breadcrumbs: [breadcrumb] })?.breadcrumbs[0] ?? null,
      beforeSend(event: {
        digest?: string
        exception?: { values?: Array<{ value?: string; digest?: string }> }
        request?: { headers?: Record<string, string> }
      }) {
        if (!sanitizeShareTelemetry(event)) return null
        // Silence known non-actionable build noise: DYNAMIC_SERVER_USAGE is
        // Next.js's normal control-flow signal for "this route reads
        // request.headers → render dynamically" — not an error. During
        // `next build` it fires for every such route (observed: /api/portfolio,
        // /api/osm/features, /api/osm/status — ~660 mentions each in one log).
        const digest = (event as unknown as { digest?: string })?.digest || (event.exception?.values?.[0] as unknown as { digest?: string })?.digest
        const msg = event.exception?.values?.[0]?.value || ''
        if (digest === 'DYNAMIC_SERVER_USAGE') return null
        if (msg.includes("couldn't be rendered statically")) return null
        // Scrub any API keys that might leak into error messages
        if (event.request?.headers) {
          delete event.request.headers['Authorization']
          delete event.request.headers['authorization']
        }
        // Scrub from exception messages
        if (event.exception?.values) {
          for (const exc of event.exception.values) {
            if (exc.value) {
              exc.value = exc.value
                .replace(/nvapi-[A-Za-z0-9_-]+/g, 'nvapi-[REDACTED]')
                .replace(/Bearer [A-Za-z0-9_-]+/g, 'Bearer [REDACTED]')
            }
          }
        }
          return sanitizeShareTelemetry(event)
        },
      })
    })
  }
}

export function captureError(error: Error, context?: Record<string, unknown>) {
  if (isProduction()) {
    void loadSentry().then((Sentry) => {
      Sentry?.captureException(error, { extra: context })
    })
  } else {
    // Dev/CI (no DSN): log it — but mark NO_FORWARD so logger.error doesn't
    // bounce it straight back into captureError (infinite loop, exponential
    // log growth; see NO_FORWARD in logger.ts).
    logger.error('[sentry] Error captured:', {
      error,
      context,
      [NO_FORWARD]: true,
    } as Record<string, unknown> & Record<symbol, boolean>)
  }
}

export function captureMessage(message: string, level: SeverityLevel = 'info') {
  if (isProduction()) {
    void loadSentry().then((Sentry) => {
      Sentry?.captureMessage(message, level)
    })
  } else {
    // Dev/staging: Sentry is disabled — nothing to capture.
  }
}

export function setUser(user: { id: string; email?: string; username?: string } | null) {
  if (isProduction()) {
    void loadSentry().then((Sentry) => {
      Sentry?.setUser(user)
    })
  }
}

export function addBreadcrumb(breadcrumb: {
  category?: string
  message: string
  level?: SeverityLevel
  data?: Record<string, unknown>
}) {
  if (isProduction()) {
    void loadSentry().then((Sentry) => {
      Sentry?.addBreadcrumb(breadcrumb)
    })
  }
}

/** Capture AI-specific errors with structured context */
export function captureAiError(error: Error, context: {
  action: string
  model?: string
  userId?: string
  latencyMs?: number
  httpStatus?: number
}) {
  if (isProduction()) {
    void loadSentry().then((Sentry) => {
      if (!Sentry) return
      Sentry.withScope((scope) => {
        scope.setTag('ai_error', 'true')
        scope.setTag('ai_action', context.action)
        if (context.model) scope.setTag('ai_model', context.model)
        if (context.httpStatus) scope.setTag('http_status', String(context.httpStatus))
        scope.setExtra('latencyMs', context.latencyMs)
        if (context.userId) scope.setUser({ id: context.userId })
        Sentry.captureException(error)
      })
    })
  } else {
    logger.error(`[sentry] AI error (${context.action}):`, { error: error.message, context })
  }
}

/** Access the lazily-loaded Sentry namespace (await; null if unavailable). */
export async function getSentry(): Promise<SentryLike | null> {
  return loadSentry()
}
