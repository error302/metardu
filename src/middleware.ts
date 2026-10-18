import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { rateLimit, RATE_LIMITS, getClientIdentifier } from '@/lib/security/rateLimit'
import type { RateLimitCategory } from '@/lib/security/rateLimit'
import { generateNonce, getCspHeaders } from '@/lib/security/csp'
import { corsHeaders, mcpCorsHeaders } from '@/lib/cors'
import { safeRedirectPath } from '@/lib/auth/safeRedirect'

// Next's middleware adapter requires absolute URLs. Use the configured public
// origin in production, or the explicitly checked loopback Host in development;
// never reflect an arbitrary Host or forwarded-host header into a redirect.
function redirectWithinSite(request: NextRequest, path: string) {
  let origin = new URL(request.url)
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_APP_URL) {
    origin = new URL(process.env.NEXT_PUBLIC_APP_URL)
  } else if (process.env.NODE_ENV !== 'production') {
    const host = request.headers.get('host')
    const loopback = new Set(['localhost', '127.0.0.1', '[::1]'])
    if (host && loopback.has(origin.hostname)) {
      try {
        const incoming = new URL(`${origin.protocol}//${host}`)
        if (loopback.has(incoming.hostname) && incoming.host === host) origin = incoming
      } catch { /* Keep the server origin for malformed headers. */ }
    }
  }
  return NextResponse.redirect(new URL(path, origin), {
    status: 307, headers: { 'Cache-Control': 'private, no-store' },
  })
}

export async function middleware(request: NextRequest) {
  // AUDIT FIX (M9, 2026-07-02): Handle CORS preflight (OPTIONS) globally
  // so individual API routes don't need to. Returns 204 with CORS headers.
  if (request.method === 'OPTIONS' && request.nextUrl.pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin')
    const isMcp = request.nextUrl.pathname === '/api/mcp'
    if (isMcp && request.headers.get('access-control-request-method') !== 'POST') {
      return new NextResponse(null, { status: 403 })
    }
    const cors = isMcp ? mcpCorsHeaders(origin) : corsHeaders(origin)
    if (Object.keys(cors).length === 0) {
      return new NextResponse(null, { status: 403 })
    }
    return new NextResponse(null, { status: 204, headers: cors })
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  })

  // A session callback that detects a version mismatch persists this marker in
  // the refreshed JWT cookie. The middleware then blocks protected pages even
  // though it cannot query PostgreSQL from the edge runtime itself.
  const sessionRevoked = (token as { metarduSessionRevoked?: boolean } | null)?.metarduSessionRevoked === true
  const isAuthenticated = !!token?.email && !sessionRevoked
  const userId = (token as { id?: string })?.id

  // ─── Protected routes ───
  const protectedPaths = [
    '/dashboard', '/project', '/fieldbook', '/deed-plan',
    '/tools/survey-report-builder', '/fieldguard', '/cadastra',
    '/minetwin', '/automator', '/hydrolive', '/usv',
    '/equipment', '/cpd', '/jobs',
    '/registry', '/analytics', '/audit-logs', '/white-label',
    '/university', '/organization', '/account', '/checkout',
    '/community', '/land-law', '/admin',
    '/instruments', '/field', '/mobile/field', '/field/gnss',
    '/drone',
  ]

  const isProtected = protectedPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  )

  // ─── Admin-only routes ───
  const adminPaths = ['/audit-logs', '/admin']
  const isAdminRoute = adminPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  )

  // ─── Auth routes ───
  const isAuthRoute = ['/login', '/register'].some(route =>
    request.nextUrl.pathname.startsWith(route)
  )

  // ─── Public pages (accessible without auth) ───
  // /subscription/success must be public so returning PayPal/Stripe users can access it
  const publicPages = ['/subscription/success', '/organization/invitations/accept']
  const isPublicPage = publicPages.some(path =>
    path === '/organization/invitations/accept'
      ? request.nextUrl.pathname === path
      : request.nextUrl.pathname.startsWith(path)
  )

  // ─── API routes: let them handle auth themselves ───

  // Redirect unauthenticated users from protected pages (skip public pages)
  if (isProtected && !isAuthenticated && !isPublicPage) {
    const loginQuery = new URLSearchParams()
    // Preserve checkout plans and provider selection across sign-in so an
    // unauthenticated customer returns to the exact flow they started.
    loginQuery.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`)
    return redirectWithinSite(request, `/login?${loginQuery}`)
  }

  // Block non-admin users from admin-only routes
  if (isAdminRoute && isAuthenticated) {
    // Check role from JWT token (set during login by auth.ts callbacks)
    const userRole = (token as { role?: string })?.role
    const adminRoles = ['super_admin', 'admin', 'org_admin']

    if (!userRole || !adminRoles.includes(userRole)) {
      return redirectWithinSite(request, '/dashboard')
    }
  }

  // Redirect authenticated users away from login/register
  const isPasswordRecovery = request.nextUrl.pathname === '/login' && request.nextUrl.searchParams.get('recovery') === '1'
  if (isAuthRoute && isAuthenticated && !isPasswordRecovery) {
    const destination = safeRedirectPath(request.nextUrl.searchParams.get('next')
      || request.nextUrl.searchParams.get('redirectTo') || request.nextUrl.searchParams.get('callbackUrl'))
    return redirectWithinSite(request, /^\/(login|register)(?:[/?#]|$)/.test(destination) ? '/dashboard' : destination)
  }

  // ─── CSRF Protection for state-changing API routes ───
  const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH']
  const isStateChanging = stateChangingMethods.includes(request.method)

  // Skip CSRF for webhook routes and public API endpoints
  const csrfExemptPaths = ['/api/webhooks/', '/api/public/']
  const isCsrfExempt = csrfExemptPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  ) || request.nextUrl.pathname === '/api/mcp'

  if (isStateChanging && !isCsrfExempt) {
    const origin = request.headers.get('origin')
    const host = request.headers.get('host')

    // Allow requests with no origin (e.g., curl, server-to-server) only for non-browser requests
    // For browser requests, origin must match host
    if (origin) {
      const allowedHosts: string[] = []

      // Add the request host
      if (host) {
        allowedHosts.push(host)
      }

      // Add the configured app URL host
      const appUrl = process.env.NEXT_PUBLIC_APP_URL
      if (appUrl) {
        try {
          const appUrlObj = new URL(appUrl)
          allowedHosts.push(appUrlObj.host)
          // Also allow with/without port variations
          if (appUrlObj.port === '443' || appUrlObj.port === '80') {
            allowedHosts.push(appUrlObj.hostname)
          }
        } catch {
          // Invalid URL, skip
        }
      }

      // Parse the origin to extract the host portion
      let originHost: string | null = null
      try {
        const originUrl = new URL(origin)
        originHost = originUrl.host || originUrl.hostname
      } catch {
        // Invalid origin URL — reject
      }

      if (!originHost || !allowedHosts.some(allowed =>
        allowed === originHost || originHost.endsWith(`.${allowed}`)
      )) {
        return new NextResponse('CSRF: Origin mismatch', { status: 403 })
      }
    }
  }

  // ─── API route rate limiting with Retry-After ────────────────────────────
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const identifier = getClientIdentifier(request)

    // Determine the rate-limit category from the URL path
    let category: RateLimitCategory | null = 'api'
    const path = request.nextUrl.pathname

    if (path === '/api/mcp') {
      // The MCP handler applies its own per-IP and per-user limits.
      category = null
    }
    else if (path.startsWith('/api/auth/')) {
      // The auth budget exists to slow credential brute-force, which is
      // POST-only. NextAuth's discovery/session endpoints (session, csrf,
      // providers, signout, error, verify-request) are GETs the client fires
      // on every page load — applying the tight 20/min budget to them trips
      // false 429s for shared IPs (and E2E suites). App-level brute-force
      // limits (loginLimiter) still apply inside the route handlers.
      category = request.method === 'POST' ? 'auth' : null
    }
    else if (path.startsWith('/api/submissions')) category = 'submission'
    else if (path.startsWith('/api/upload'))     category = 'upload'
    else if (path.startsWith('/api/mpesa'))      category = 'mpesa'
    else if (path.startsWith('/api/export'))     category = 'export'

    if (category) {
      const limits = RATE_LIMITS[category]
      // Keep category budgets distinct: loading project data must not consume
      // the much smaller credential allowance for the same surveyor/IP.
      const result = await rateLimit(`middleware:${category}:${identifier}`, limits.max, limits.windowMs)

      if (!result.allowed) {
        // Compute seconds until the window resets.
        // The in-memory store tracks resetTime; for Upstash we approximate from windowMs.
        const retryAfterSeconds = Math.ceil(limits.windowMs / 1000)
        return new NextResponse('Too Many Requests', {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSeconds),
            'X-RateLimit-Remaining': '0',
          },
        })
      }
    }
  }

  // Add security headers to all responses
  const response = NextResponse.next()
  // NOTE: Do NOT set `Cache-Control: no-transform` here. Next's bundled
  // compression middleware and Cloudflare's edge both treat it as a prohibition
  // on ANY content change, including gzip Content-Encoding, which silently
  // served every HTML page uncompressed (~171 KB raw instead of ~30 KB gzip).
  // Protection from Cloudflare HTML rewrites is handled by keeping Rocket
  // Loader / Email Obfuscation disabled in the CF dashboard instead.

  // ─── API Versioning ──────────────────────────────────────────────────────
  // ByteByteGo audit fix: support /api/v1/* paths by rewriting to /api/*
  // This allows clients to use /api/v1/projects while existing clients
  // continue using /api/projects. Future v2 routes can be added selectively.
  const apiVersionMatch = request.nextUrl.pathname.match(/^\/api\/v(\d+)\//)
  if (apiVersionMatch) {
    const version = apiVersionMatch[1]
    const newPath = request.nextUrl.pathname.replace(/^\/api\/v\d+\//, '/api/')
    const newUrl = new URL(newPath, request.url)
    newUrl.search = request.nextUrl.search
    // Rewrite (not redirect) so the route handler sees /api/projects
    response.headers.set('X-API-Version', version)
    // Use NextResponse.rewrite for internal routing
    return NextResponse.rewrite(newUrl)
  }

  // Generate per-request nonce and set CSP headers
  const nonce = generateNonce()
  const cspHeaders = getCspHeaders(nonce)

  // Override Permissions-Policy to allow camera (for BeaconPhotoCapture)
  // and microphone (for VoiceDictationButton) from our own origin
  // ByteByteGo audit fix: hardened Permissions-Policy (restrict USB, serial, bluetooth)
  response.headers.set(
    'Permissions-Policy',
    'camera=(self), microphone=(self), geolocation=(self), bluetooth=(self), usb=(), serial=(), magnetometer=(), gyroscope=(), accelerometer=()',
  )
  for (const [key, value] of Object.entries(cspHeaders)) {
    response.headers.set(key, value)
  }

  // ByteByteGo audit fix: HSTS — force HTTPS for 1 year (production only)
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    )
  }

  // Pass nonce to downstream pages / layouts via a response header
  response.headers.set('x-nonce', nonce)

  // AUDIT FIX (M9, 2026-07-02): Apply CORS headers globally in middleware
  // instead of requiring each API route to call corsHeaders() manually.
  // Only applies to /api/ routes (where CORS is relevant). The corsHeaders()
  // function checks the Origin against the allow-list internally.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin')
    const cors = request.nextUrl.pathname === '/api/mcp' ? mcpCorsHeaders(origin) : corsHeaders(origin)
    for (const [key, value] of Object.entries(cors)) {
      response.headers.set(key, value)
    }
  }

  // Add user ID to headers for downstream API route use
  if (isAuthenticated && userId) {
    response.headers.set('x-user-id', userId)
  }

  return response
}

export const config = {
  // SECURITY (audit M-01, 2026-08-30): only webhooks (external provider
  // callbacks with their own signature verification) and the container
  // health probe are exempt from middleware. api/public/* as a whole was
  // previously carved out, which meant the most exposed endpoints (e.g.
  // /api/public/metrics — the H-13 metrics leak) received the LEAST header
  // protection. They now run through the normal middleware pipeline.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|manifest.webmanifest|sw.js|robots.txt|sitemap.xml|api/webhooks/.*|api/public/health.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
}
