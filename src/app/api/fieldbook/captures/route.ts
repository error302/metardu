import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { captureBookRequestSchema } from '@/lib/fieldbook/captureDraft'
import { createBookFromCaptures, inspectBookCapture, listBookCaptures } from '@/lib/fieldbook/captureBookServer'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const scope = z.object({ projectId: z.string().uuid(), batchId: z.string().uuid().optional(), cursor: z.string().max(500).optional() })
export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (request, ctx) => {
  if (request.headers.get('X-Metardu-Expected-User') !== ctx.userId) return NextResponse.json({ error: 'Sign in as the account reviewing these captures.' }, { status: 403, headers })
  const input = scope.parse(Object.fromEntries(request.nextUrl.searchParams))
  const result = input.batchId ? { source: await inspectBookCapture(ctx.userId, input.projectId, input.batchId) }
    : await listBookCaptures(ctx.userId, input.projectId, input.cursor)
  return NextResponse.json(result, { headers })
})
export const POST = apiHandler({ auth: true, schema: captureBookRequestSchema, rateLimit: { max: 60, windowMs: 60000 } }, async (request, ctx) => {
  if (request.headers.get('X-Metardu-Expected-User') !== ctx.userId) return NextResponse.json({ error: 'Sign in as the account reviewing these captures.' }, { status: 403, headers })
  const result = await createBookFromCaptures(ctx.userId, captureBookRequestSchema.parse(ctx.body))
  return NextResponse.json(result, { status: result.replayed ? 200 : 201, headers })
})
