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
import { registerDeliverable } from '@/lib/deliverables/deliverableRegister'
import { logger } from '@/lib/logger'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

/** Project identity for the register; the request may carry it on the body or metadata. */
function resolveProjectId(input: DeedPlanInput): string | null {
  const candidate =
    (input as unknown as { projectId?: string }).projectId ??
    (input as unknown as { metadata?: { projectId?: string } }).metadata?.projectId;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

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

    /**
     * Register the issued plan (blueprint §15, §28).
     *
     * This route used to write an orphan PDF with no database record: every
     * regeneration silently superseded the last with no retrievable history,
     * no revision, no hash and no reviewer. A deed plan is a statutory
     * document, so it now lands in the deliverable register with its source
     * revision, content hash and generator identity.
     */
    let registerWarning: string | null = null
    let deliverable: { id: string; revision: number } | null = null
    const projectId = resolveProjectId(input)
    try {
      if (!projectId) throw new Error('No project id on the deed-plan request')
      const registered = await registerDeliverable({
        projectId,
        documentType: 'deed_plan',
        content: pdfBuffer,
        title: input.titleData?.lrNumber
          ? `Deed plan ${input.titleData.lrNumber}`
          : `Deed plan ${safeLr}`,
        sourceRevision: input.titleData?.revision ?? null,
        projectCrs:
          input.titleData?.datum && input.titleData?.projection
            ? `${input.titleData.datum} ${input.titleData.projection}`
            : null,
        generator: 'lib/documents/deed-plan/generator',
        manifest: {
          lr_number: input.titleData?.lrNumber ?? null,
          file: path.basename(filename),
        },
        storagePath: path.join('download', 'deed-plans', path.basename(filename)),
        userId: ctx.userId,
      })
      deliverable = { id: registered.deliverable.id, revision: registered.revision.revision }
    } catch (error) {
      // A surveyor must still receive a correct plan if the register is
      // unavailable — but the gap must be visible, not silent.
      registerWarning =
        error instanceof Error ? error.message : 'Deliverable register unavailable'
      logger.error('[documents/deed-plan] deliverable not registered', { error })
    }

    return NextResponse.json({
      success: true,
      filename: path.basename(filename),
      size: pdfBuffer.length,
      message: 'Deed plan generated successfully',
      ...(deliverable ? { deliverable } : {}),
      ...(registerWarning ? { register_warning: registerWarning } : {}),
    })
  }
)
