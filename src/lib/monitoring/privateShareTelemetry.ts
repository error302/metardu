export function isPrivateSharePath(value: string): boolean {
  try {
    const path = new URL(value, 'https://metardu.invalid').pathname.replace(
      /^\/api\/v[0-9]+\//,
      '/api/',
    )
    return (
      /^\/p\/[^/]+(?:\/|$)/.test(path) ||
      /^\/(?:api\/)?project\/[^/]+\/scheme\/shares(?:\/|$)/.test(path) ||
      /^\/api\/public\/parcel\//.test(path)
    )
  } catch {
    return false
  }
}
export function telemetryPageUrl(value: string): string {
  try {
    const url = new URL(value, 'https://metardu.invalid')
    return `${url.origin}${url.pathname}`
  } catch {
    return '[unavailable]'
  }
}
type EventShape = {
  request?: { url?: string; headers?: Record<string, unknown> }
  transaction?: string
  breadcrumbs?: Array<{
    data?: Record<string, unknown>
    [key: string]: unknown
  }>
}
export function sanitizeShareTelemetry<T>(event: T): T | null {
  if (!event || typeof event !== 'object') return event
  const shape = event as EventShape
  if (
    (typeof window !== 'undefined' &&
      isPrivateSharePath(window.location.pathname)) ||
    (shape.request?.url && isPrivateSharePath(shape.request.url)) ||
    (shape.transaction && isPrivateSharePath(shape.transaction))
  )
    return null
  const clean = { ...shape }
  if (shape.request) {
    clean.request = { ...shape.request }
    if (shape.request.url)
      clean.request.url = telemetryPageUrl(shape.request.url)
    if (shape.request.headers)
      clean.request.headers = Object.fromEntries(
        Object.entries(shape.request.headers).filter(
          ([key]) =>
            !/^(authorization|proxy-authorization|cookie|set-cookie)$/i.test(
              key,
            ),
        ),
      )
  }
  if (shape.breadcrumbs)
    clean.breadcrumbs = shape.breadcrumbs.flatMap((crumb) => {
      if (!crumb.data) return [crumb]
      const data = { ...crumb.data }
      for (const name of ['url', 'from', 'to'])
        if (typeof data[name] === 'string') {
          if (isPrivateSharePath(data[name])) return []
          data[name] = telemetryPageUrl(data[name])
        }
      return [{ ...crumb, data }]
    })
  return clean as T
}
