import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { offlineObservationSchema } from '@/lib/field/observationCapture'
import { recordOfflineObservation } from '@/lib/field/observationCaptureServer'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const recoveryInput = z.object({ capture: offlineObservationSchema,
  acknowledgement: z.literal('unknown-author-v1'), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()

export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (request, ctx) => {
  const expected = request.headers.get('X-Metardu-Expected-User')
  if (expected && expected !== ctx.userId) return NextResponse.json({ error: 'The signed-in account changed.' }, { status: 403, headers })
  const project = z.string().guid().safeParse(request.nextUrl.searchParams.get('projectId'))
  if (!project.success) return NextResponse.json({ error: 'Select a valid project before reviewing device work.' }, { status: 400, headers })
  const result = await db.query<{ allowed: boolean }>('SELECT public.field_observation_project_access($1,true) AS allowed', [project.data])
  if (result.rows[0]?.allowed !== true) return NextResponse.json({ error: 'This account requires current field-recording access to review this project’s device work.' }, { status: 403, headers })
  return NextResponse.json({ actorId: ctx.userId, projectId: project.data, canReview: true }, { headers })
})

export const POST = apiHandler({ auth: true, schema: recoveryInput, rateLimit: { max: 60, windowMs: 60000 } }, async (request, ctx) => {
  const expected = request.headers.get('X-Metardu-Expected-User')
  if (!expected || expected !== ctx.userId) return NextResponse.json({ error: 'Sign in as the account that reviewed this device record.' }, { status: 403, headers })
  const input = recoveryInput.parse(ctx.body)
  const receipt = await recordOfflineObservation(ctx.userId, input.capture, { legacyReview: {
    acknowledgement: input.acknowledgement, sourceHash: input.sourceHash,
  } })
  return NextResponse.json(receipt, { status: receipt.replayed ? 200 : 201, headers })
})
