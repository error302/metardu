export const dynamic = 'force-dynamic'

/**
 * GET    /api/admin/licenses/[licenseId]       — Get license details
 * PUT    /api/admin/licenses/[licenseId]       — Update license
 * DELETE /api/admin/licenses/[licenseId]       — Deactivate license
 */

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import {
  getGovernmentLicense,
  updateGovernmentLicense,
  deactivateLicense,
} from '@/lib/enterprise/governmentLicensing'
import { z } from 'zod'

const updateLicenseSchema = z.object({
  departmentName: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
  maxSeats: z.number().int().positive().optional(),
  active: z.boolean().optional(),
  expiresAt: z.string().transform((v) => new Date(v)).optional(),
  features: z.array(z.string()).optional(),
  contactEmail: z.string().email().optional(),
  contactName: z.string().optional(),
  tier: z.enum(['basic', 'professional', 'enterprise']).optional(),
})

export const GET = apiHandler(
  { auth: true, roles: ['super_admin', 'admin'] , rateLimit: { max: 60, windowMs: 60000 } },
  async (_req, ctx) => {
    const { licenseId } = ctx.params

    const license = await getGovernmentLicense(licenseId)
    if (!license) {
      return NextResponse.json(
        { error: 'License not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: license })
  }
)

export const PUT = apiHandler(
  { auth: true, roles: ['super_admin'], schema: updateLicenseSchema , rateLimit: { max: 60, windowMs: 60000 } },
  async (_req, ctx) => {
    const { licenseId } = ctx.params
    const body = ctx.body as z.infer<typeof updateLicenseSchema>
    try {
      const updated = await updateGovernmentLicense(licenseId, body)
      if (!updated) {
        return NextResponse.json(
          { error: 'License not found', code: 'NOT_FOUND' },
          { status: 404 },
        )
      }
      return NextResponse.json({ data: updated })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update license'
      return NextResponse.json({ error: message, code: 'LICENSE_UPDATE_FAILED' }, { status: 400 })
    }
  }
)

export const DELETE = apiHandler(
  { auth: true, roles: ['super_admin'] , rateLimit: { max: 60, windowMs: 60000 } },
  async (_req, ctx) => {
    const { licenseId } = ctx.params

    try {
      await deactivateLicense(licenseId)
      return NextResponse.json({ success: true })
    } catch {
      return NextResponse.json(
        { error: 'License not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }
  }
)
