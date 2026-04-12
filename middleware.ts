import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const sessionToken = request.cookies.get('next-auth.session-token')?.value 
    || request.cookies.get('__Secure-next-auth.session-token')?.value
  
  const hasSession = !!sessionToken
  
  const protectedPaths = [
    '/dashboard', '/project', '/fieldbook', '/deed-plan',
    '/tools/survey-report-builder', '/fieldguard', '/cadastra',
    '/minetwin', '/automator', '/hydrolive', '/usv', '/minescan',
    '/geofusion', '/equipment', '/cpd', '/jobs', '/peer-review',
    '/registry', '/analytics', '/audit-logs', '/white-label',
    '/university', '/organization', '/account', '/checkout',
    '/marketplace', '/community', '/land-law'
  ]

  const isProtected = protectedPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  )

  const isAuthRoute = ['/login', '/register'].some(route =>
    request.nextUrl.pathname.startsWith(route)
  )

  if (isProtected && !hasSession) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthRoute && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|manifest.webmanifest|sw.js|robots.txt|sitemap.xml|api/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
}