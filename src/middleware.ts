/**
 * METARDU Authentication Middleware
 * Protects routes that require authentication
 * Redirects unauthenticated users to /login
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// List of protected routes that require authentication
const PROTECTED_ROUTES = [
  '/dashboard',
  '/projects',
  '/project/',
  '/settings',
  '/account',
  '/billing',
]

// Routes that are always public
const PUBLIC_ROUTES = [
  '/login',
  '/register',
  '/verify',
  '/api/auth',
  '/_next',
  '/static',
  '/favicon',
  '/manifest',
  '/robots.txt',
  '/sitemap',
  '/opengraph-image',
  '/api/public',
  '/docs',
  '/guide',
  '/about',
  '/pricing',
  '/community',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Check if route is public (exact match or starts with)
  const isPublic = PUBLIC_ROUTES.some(route => 
    pathname === route || 
    pathname.startsWith(route + '/') ||
    pathname.startsWith('/tools/') // Tools are public
  )
  
  if (isPublic) {
    return NextResponse.next()
  }
  
  // Check if route is protected
  const isProtected = PROTECTED_ROUTES.some(route =>
    pathname === route ||
    pathname.startsWith(route + '/')
  )
  
  if (!isProtected) {
    return NextResponse.next()
  }
  
  // Check for session token
  const sessionToken = request.cookies.get('next-auth.session-token')?.value ||
                      request.cookies.get('__Secure-next-auth.session-token')?.value
  
  if (!sessionToken) {
    // Redirect to login with return URL
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }
  
  return NextResponse.next()
}

// Match all routes except static files and API
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|robots.txt|sitemap.xml).*)',
  ],
}