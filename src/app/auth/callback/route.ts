import { createClient } from '@/lib/api-client/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const type = requestUrl.searchParams.get('type')

  if (code) {
    const dbClient = await createClient()
    await dbClient.auth.exchangeCodeForSession(code)
  }

  // Password recovery → redirect to reset page with code
  if (type === 'recovery') {
    return NextResponse.redirect(
      requestUrl.origin + '/auth/reset-password?code=' + code
    )
  }

  // Signup confirmation → redirect to dashboard
  return NextResponse.redirect(requestUrl.origin + '/dashboard')
}
