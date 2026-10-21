import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { fieldbookSaveRequestSchema } from '@/lib/fieldbook/delivery'
import { readFieldbookRevision, saveFieldbookRevision } from '@/lib/fieldbook/deliveryServer'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const scope = z.object({ projectId: z.string().uuid(), bookId: z.string().uuid() }).strict()
export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (request, context) => {
  if (request.headers.get('X-Metardu-Expected-User') !== context.userId) return NextResponse.json({ error: 'Sign in as this book’s retained owner.' }, { status: 403, headers })
  const input = scope.parse(Object.fromEntries(request.nextUrl.searchParams))
  return NextResponse.json({ book: await readFieldbookRevision(context.userId, input.projectId, input.bookId) }, { headers })
})
export const POST = apiHandler({ auth: true, schema: fieldbookSaveRequestSchema, rateLimit: { max: 60, windowMs: 60000 } }, async (request, context) => {
  if (request.headers.get('X-Metardu-Expected-User') !== context.userId) return NextResponse.json({ error: 'Sign in as this book’s retained owner.' }, { status: 403, headers })
  return NextResponse.json(await saveFieldbookRevision(context.userId, context.body), { headers })
})
