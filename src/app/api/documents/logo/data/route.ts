import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { setAuthenticatedDatabaseContext } from '@/lib/auth/requestContext'
import { resolveCompanyLogo } from '@/lib/documents/resolve-logo'
import { getSubscription } from '@/lib/subscription/subscriptionEngine'

export const dynamic = 'force-dynamic'

const privateHeaders = { 'Cache-Control': 'private, no-store' }
const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/svg+xml'])

export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user
  if (!user?.id) return new Response(null, { status: 401, headers: privateHeaders })

  setAuthenticatedDatabaseContext(user.id)
  const subscription = await getSubscription(user.id, user.email ?? undefined)
  if (!subscription || subscription.plan === 'free') return new Response(null, { status: 403, headers: privateHeaders })
  const logo = await resolveCompanyLogo(user.id, subscription.plan)
  if (!logo || !supportedTypes.has(logo.mimeType) || !logo.data.length || logo.data.length > 2 * 1024 * 1024) {
    return new Response(null, { status: 404, headers: privateHeaders })
  }

  return new Response(new Uint8Array(logo.data), {
    headers: {
      ...privateHeaders,
      'Content-Type': logo.mimeType,
      'Content-Disposition': 'attachment; filename=company-logo',
      'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
