const DEFAULT_REDIRECT = '/dashboard'
const INTERNAL_ORIGIN = 'https://metardu.invalid'

/** Accept only an internal relative URL; query-string values are already decoded once by URLSearchParams. */
export function safeRedirectPath(candidate: string | null | undefined): string {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\') || /[\u0000-\u001f\u007f]/.test(candidate)) {
    return DEFAULT_REDIRECT
  }

  try {
    const destination = new URL(candidate, INTERNAL_ORIGIN)
    if (destination.origin !== INTERNAL_ORIGIN) return DEFAULT_REDIRECT
    return `${destination.pathname}${destination.search}${destination.hash}`
  } catch {
    return DEFAULT_REDIRECT
  }
}
