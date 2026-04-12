/**
 * Feedback collection system for beta testing.
 *
 * Collects user feedback, errors, and usage data into sessionStorage
 * so the FeedbackWidget can package and submit them together.
 */

export type FeedbackCategory = 'bug' | 'feature' | 'general' | 'performance'

export interface FeedbackEntry {
  id: string
  type: FeedbackCategory
  message: string
  email?: string
  pageUrl: string
  timestamp: string
  metadata?: {
    userAgent: string
    screenWidth: number
    screenHeight: number
    language: string
    connectionType?: string
  }
  screenshotDataUrl?: string
  errorEntries?: CollectedError[]
}

export interface CollectedError {
  message: string
  stack?: string
  componentStack?: string
  url: string
  timestamp: string
}

const STORAGE_KEY_ERRORS = 'metardu_feedback_errors'
const STORAGE_KEY_FEEDBACK = 'metardu_feedback_submitted'
const MAX_STORED_ERRORS = 20

/** Generate a short unique ID */
function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** Collect device metadata */
function collectMetadata() {
  if (typeof window === 'undefined') return undefined
  const nav = navigator as Navigator & { connection?: { effectiveType?: string } }
  return {
    userAgent: navigator.userAgent,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    language: navigator.language,
    connectionType: nav.connection?.effectiveType,
  }
}

/** Store a caught error for later reporting */
export function captureError(error: Error) {
  try {
    const entries: CollectedError[] = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY_ERRORS) || '[]'
    )
    entries.push({
      message: error.message,
      stack: error.stack?.slice(0, 500),
      url: typeof window !== 'undefined' ? window.location.href : '',
      timestamp: new Date().toISOString(),
    })
    sessionStorage.setItem(
      STORAGE_KEY_ERRORS,
      JSON.stringify(entries.slice(-MAX_STORED_ERRORS))
    )
  } catch {
    // sessionStorage may be unavailable
  }
}

/** Retrieve all stored errors and clear them */
export function drainStoredErrors(): CollectedError[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_ERRORS)
    sessionStorage.removeItem(STORAGE_KEY_ERRORS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/** Record that feedback was submitted (for rate-limiting) */
export function markFeedbackSubmitted() {
  try {
    sessionStorage.setItem(STORAGE_KEY_FEEDBACK, new Date().toISOString())
  } catch {
    // ignore
  }
}

/** Check if user submitted feedback recently (within 30s) */
export function canSubmitFeedback(): boolean {
  try {
    const last = sessionStorage.getItem(STORAGE_KEY_FEEDBACK)
    if (!last) return true
    return Date.now() - new Date(last).getTime() > 30_000
  } catch {
    return true
  }
}

/** Build a complete feedback payload */
export function buildFeedbackPayload(
  type: FeedbackCategory,
  message: string,
  email?: string,
  screenshotDataUrl?: string
): FeedbackEntry {
  return {
    id: uid(),
    type,
    message,
    email,
    pageUrl: typeof window !== 'undefined' ? window.location.href : '',
    timestamp: new Date().toISOString(),
    metadata: collectMetadata(),
    screenshotDataUrl,
    errorEntries: drainStoredErrors(),
  }
}

/**
 * Attempt to capture a screenshot of the current page using native browser APIs.
 * Falls back to null if unavailable.
 */
export async function captureScreenshot(): Promise<string | null> {
  if (typeof window === 'undefined') return null

  // Try html2canvas if available (may be loaded dynamically)
  try {
    const mod = await import('html2canvas' as string).catch(() => null)
    if (mod) {
      const canvas = await mod.default(document.body, {
        backgroundColor: '#0a0a0a',
        scale: 0.5,
        logging: false,
        useCORS: true,
      })
      return canvas.toDataURL('image/jpeg', 0.6)
    }
  } catch {
    // html2canvas not available
  }

  return null
}

/** Log feedback to console (fallback when no backend is available) */
export function logFeedbackToConsole(entry: FeedbackEntry) {
  console.group(`📋 METARDU Feedback [${entry.type.toUpperCase()}]`)
  console.log('ID:', entry.id)
  console.log('Message:', entry.message)
  console.log('Email:', entry.email || '(none)')
  console.log('URL:', entry.pageUrl)
  console.log('Time:', entry.timestamp)
  if (entry.metadata) {
    console.log('Device:', entry.metadata.userAgent.slice(0, 80))
    console.log('Screen:', `${entry.metadata.screenWidth}x${entry.metadata.screenHeight}`)
  }
  if (entry.errorEntries?.length) {
    console.log('Errors:', entry.errorEntries.length)
    entry.errorEntries.forEach((e, i) => console.log(`  [${i}]`, e.message))
  }
  if (entry.screenshotDataUrl) {
    console.log('Screenshot: captured (base64 JPEG)')
  }
  console.groupEnd()
}
