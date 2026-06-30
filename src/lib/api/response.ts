/**
 * API Response Envelope — v0.3 redesign
 *
 * Two coexisting envelope shapes:
 *
 * 1. Legacy:  { data, error: string, meta }         — used by existing routes
 * 2. v0.3:     { data, error: { code, message, details }, meta }
 *              — recommended for new routes, per api-design-principles skill
 *
 * The v0.3 shape is structured so clients can switch on `error.code`
 * (e.g. TRAVERSE_MISCLOSE_EXCEEDED) rather than parsing error.message.
 *
 * Migration: new routes should use apiSuccessV3() / apiErrorV3().
 * Existing routes keep working with apiSuccess() / apiError().
 */

// ─── Legacy envelope (string error) ─────────────────────────────────────────

export interface ApiResponse<T> {
  data: T | null
  error: string | null
  meta?: Record<string, unknown>
}

export function apiSuccess<T>(data: T, meta?: Record<string, unknown>): ApiResponse<T> {
  return { data, error: null, meta }
}

export function apiError(error: string, meta?: Record<string, unknown>): ApiResponse<null> {
  return { data: null, error, meta }
}

// ─── v0.3 envelope (structured error with code) ──────────────────────────────

/**
 * Structured error object. `code` is a SCREAMING_SNAKE_CASE machine-readable
 * string that clients switch on. `message` is human-readable. `details` is
 * optional extra context (field errors, validation failures, etc.).
 *
 * Examples:
 *   { code: 'VALIDATION_ERROR', message: 'Invalid bearing format', details: { field: 'bearing' } }
 *   { code: 'TRAVERSE_MISCLOSE_EXCEEDED', message: 'Misclose 1:2,300 exceeds RDM 1.1 minimum 1:10,000' }
 *   { code: 'PROJECT_NOT_FOUND', message: 'Project 1234 not found' }
 *   { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests', details: { retryAfter: 60 } }
 */
export interface ApiErrorV3 {
  code: string
  message: string
  details?: unknown
}

export interface ApiResponseV3<T> {
  data: T | null
  error: ApiErrorV3 | null
  meta?: Record<string, unknown>
}

export function apiSuccessV3<T>(data: T, meta?: Record<string, unknown>): ApiResponseV3<T> {
  return { data, error: null, meta }
}

export function apiErrorV3(
  code: string,
  message: string,
  details?: unknown,
  meta?: Record<string, unknown>
): ApiResponseV3<null> {
  return { data: null, error: { code, message, details }, meta }
}

// ─── Pagination meta helper ─────────────────────────────────────────────────

/**
 * Cursor-based pagination meta (per api-design-principles skill).
 * Prefer over offset/limit for list endpoints.
 *
 * Usage:
 *   return NextResponse.json(apiSuccessV3(projects, paginateMeta(items, limit, cursor)))
 */
export interface PaginationMeta {
  nextCursor: string | null
  hasMore: boolean
  limit: number
}

export function paginateMeta<T extends { id: string | number }>(
  items: T[],
  limit: number
): PaginationMeta {
  const hasMore = items.length === limit
  const nextCursor = hasMore && items.length > 0
    ? String(items[items.length - 1].id)
    : null
  return { nextCursor, hasMore, limit }
}
