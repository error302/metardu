import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { readImageryCatalogue } from '@/lib/online/imageryCatalogue'
export const dynamic = 'force-dynamic'
export const GET = apiHandler({ auth: false, rateLimit: { max: 60, windowMs: 60000 } }, async () => {
  const catalogue = await readImageryCatalogue()
  return NextResponse.json(catalogue, { headers: {
    // Preserve the platform-wide API policy; the server shares public metadata internally.
    'Cache-Control': 'private, no-store',
  } })
})
