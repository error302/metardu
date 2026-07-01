export const dynamic = 'force-dynamic'

/**
 * Deed Plan Generation API Route
 *
 * SECURITY (fixed 2026-07):
 *   - Requires authentication (previously unauthenticated — CRITICAL)
 *   - Sanitizes lrNumber for filename (prevents path traversal via
 *     lrNumber like "../../etc/cron.d/evil")
 */

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { generateDeedPlan, type DeedPlanInput } from '@/lib/documents/deed-plan/generator'
import { DeedPlanInputSchema } from '@/lib/validation/apiSchemas'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

export const POST = apiHandler(
  { auth: true, schema: DeedPlanInputSchema, rateLimit: { max: 20, windowMs: 60000 } },
  async (req, ctx) => {
    const input = ctx.body as unknown as DeedPlanInput

    // Generate the deed plan PDF
    const pdfBuffer = await generateDeedPlan(input)

    // Sanitize lrNumber for filename — only allow alphanumeric, dash, underscore, slash
    // Prevents path traversal (../../etc/cron.d/evil) and other filename attacks
    const rawLr = input.titleData?.lrNumber || 'unknown'
    const safeLr = rawLr.replace(/[^A-Za-z0-9/_-]/g, '_').replace(/\.\.+/g, '_').slice(0, 50)

    const uploadDir = path.join(process.cwd(), 'download', 'deed-plans')
    await mkdir(uploadDir, { recursive: true })

    // Use path.basename as defense-in-depth — even if safeLr somehow
    // contains a path separator, basename strips the directory portion
    const filename = `deed-plan-${safeLr}-${Date.now()}.pdf`
    const filePath = path.join(uploadDir, path.basename(filename))

    await writeFile(filePath, pdfBuffer)

    return NextResponse.json({
      success: true,
      filename: path.basename(filename),
      size: pdfBuffer.length,
      message: 'Deed plan generated successfully',
    })
  }
)
