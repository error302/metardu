/**
 * CORS helper for API routes.
 */
const ALLOWED_ORIGINS = [
  'https://metardu.duckdns.org',
  'capacitor://localhost',
  'http://localhost:3000',
]

export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return {}
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true',
  }
}

/**
 * Handle OPTIONS preflight requests — call from any API route that needs CORS.
 */
import { NextResponse } from 'next/server'

export function handlePreflight(request: Request) {
  const origin = request.headers.get('origin')
  const headers = corsHeaders(origin)
  if (Object.keys(headers).length === 0) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 })
  }
  return new NextResponse(null, {
    status: 204,
    headers,
  })
}
