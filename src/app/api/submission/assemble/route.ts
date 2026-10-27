export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { z } from 'zod'
import { assembleSubmissionPackage } from '@/lib/submission/assembleSubmission'
import { db } from '@/lib/db'

const AssembleRequestSchema = z.object({
  projectId: z.string().guid('Valid project ID is required'),
})

export const POST = apiHandler(
  { auth: true, schema: AssembleRequestSchema, audit: 'submission_assembled' , rateLimit: { max: 60, windowMs: 60000 } },
  async (req, ctx) => {
    const { projectId } = ctx.body as z.infer<typeof AssembleRequestSchema>
    const { rows } = await db.query<{ id: string }>(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2 LIMIT 1', [projectId, ctx.userId]
    )
    if (rows.length === 0) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const { zipBuffer, ref, qa } = await assembleSubmissionPackage(projectId)

    if (!qa.passed) {
      return NextResponse.json(
        {
          error: 'QA gate failed',
          blockers: qa.blockers.map(b => b.message),
          warnings: qa.warnings.map(w => w.message)
        },
        { status: 422 }
      )
    }

    return new NextResponse(zipBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${ref}.zip"`,
        'X-Submission-Ref': ref
      }
    })
  }
)
