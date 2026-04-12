import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  })

  const isAuthenticated = !!token?.email
  const userId = (token as { id?: string })?.id

  // ─── Protected routes ───
  const protectedPaths = [
    '/dashboard', '/project', '/fieldbook', '/deed-plan',
    '/tools/survey-report-builder', '/fieldguard', '/cadastra',
    '/minetwin', '/automator', '/hydrolive', '/usv', '/minescan',
    '/geofusion', '/equipment', '/cpd', '/jobs', '/peer-review',
    '/registry', '/analytics', '/audit-logs', '/white-label',
    '/university', '/organization', '/account', '/checkout',
    '/marketplace', '/community', '/land-law',
  ]

  const isProtected = protectedPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  )

  // ─── Admin-only routes ───
  const adminPaths = ['/audit-logs']
  const isAdminRoute = adminPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  )

  // ─── Auth routes ───
  const isAuthRoute = ['/login', '/register'].some(route =>
    request.nextUrl.pathname.startsWith(route)
  )

  // ─── API routes: let them handle auth themselves ───
  // Exception: public API endpoints (no auth needed)
  const publicApiPaths = ['/api/public/health', '/api/webhooks/']
  const isPublicApi = publicApiPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  )

  // Redirect unauthenticated users from protected pages
  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect authenticated users away from login/register
  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Add security headers to all responses
  const response = NextResponse.next()

  // Add user ID to headers for downstream API route use
  if (isAuthenticated && userId) {
    response.headers.set('x-user-id', userId)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|manifest.webmanifest|sw.js|robots.txt|sitemap.xml|api/public/.*|api/webhooks/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
}
