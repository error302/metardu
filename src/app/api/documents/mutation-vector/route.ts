import { NextResponse } from 'next/server'
import { apiHandler, apiSuccess } from '@/lib/apiHandler'
import { generateMutationVectorLayout, type MutationLayoutData } from '@/lib/documents/templates/mutation-vector-layout'
import { resolveCompanyLogo } from '@/lib/documents/resolve-logo'
import type { PlanId } from '@/lib/subscription/catalog'
import { getAuthUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

/**
 * POST /api/documents/mutation-vector
 *
 * Generate a print-ready Mutation Form PDF with vector parcel drawing.
 */
export const POST = apiHandler(
  { auth: true, rateLimit: { max: 20, windowMs: 60000 } },
  async (req, ctx) => {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = ctx.body as unknown as MutationLayoutData
    const plan = ((user as { plan?: string }).plan || 'free') as PlanId

    // Resolve company logo based on user's plan
    const logo = await resolveCompanyLogo(user.id, plan)

    const pdfBuffer = await generateMutationVectorLayout({
      ...data,
      plan,
      companyLogo: logo?.data || null,
    })

    const pdfBase64 = pdfBuffer.toString('base64')

    return apiSuccess({
      pdfBase64,
      filename: `mutation-${data.parentParcelNumber || 'form'}.pdf`,
      mimeType: 'application/pdf',
    })
  },
)
