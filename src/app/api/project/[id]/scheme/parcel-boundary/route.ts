import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { AppError } from '@/lib/api/errors'
import {
  readBoundaryDirectory,
  readBoundaryReceipt,
  readBoundarySource,
  saveReviewedBoundary,
} from '@/lib/scheme/reviewedBoundaryCommands'
export const dynamic = 'force-dynamic'
export const GET = apiHandler(
  { auth: true, rateLimit: { max: 90, windowMs: 60000 } },
  async (request, ctx) => {
    const query = new URL(request.url).searchParams
    if (
      ['parcel_id', 'traverse_id', 'page', 'request_id'].some(
        (key) => query.getAll(key).length > 1,
      )
    )
      throw new AppError('Choose one parcel, traverse, request and page.', 400)
    const parcel = query.get('parcel_id') ?? '',
      traverse = query.get('traverse_id')
    const page = query.get('page') ?? '1'
    if (!/^[1-9]\d{0,5}$/.test(page))
      throw new AppError('Choose a valid source page.', 400)
    const requestId = query.get('request_id')
    if (requestId && traverse)
      throw new AppError(
        'Recover a receipt or choose a source traverse separately.',
        400,
      )
    const data = requestId
      ? await readBoundaryReceipt(ctx.userId, ctx.params.id, parcel, requestId)
      : traverse
        ? await readBoundarySource(ctx.userId, ctx.params.id, parcel, traverse)
        : await readBoundaryDirectory(
            ctx.userId,
            ctx.params.id,
            parcel,
            Number(page),
          )
    return NextResponse.json(
      { data },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  },
)
export const POST = apiHandler(
  {
    auth: true,
    rateLimit: { max: 30, windowMs: 60000 },
    audit: 'reviewed_boundary_draft',
  },
  async (request, ctx) => {
    // Stream limit precedes JSON parsing; the bounded ID command contains no raw geometry.
    const reader = request.body?.getReader()
    if (!reader)
      throw new AppError('A reviewed boundary command is required.', 400)
    const chunks: Uint8Array[] = []
    let bytes = 0
    try {
      while (true) {
        const part = await reader.read()
        if (part.done) break
        bytes += part.value.byteLength
        if (bytes > 65536) {
          await reader.cancel()
          throw new AppError('The boundary command exceeds 64 KiB.', 413)
        }
        chunks.push(part.value)
      }
    } finally {
      reader.releaseLock()
    }
    let input: unknown
    try {
      input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      throw new AppError('The boundary command must be valid JSON.', 400)
    }
    const data = await saveReviewedBoundary(ctx.userId, ctx.params.id, input)
    return NextResponse.json(
      { data },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  },
)
