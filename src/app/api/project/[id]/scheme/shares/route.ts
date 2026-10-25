import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { AppError } from '@/lib/api/errors'
import { readTextBounded } from '@/lib/security/requestBody'
import {
  createParcelShare,
  listParcelShares,
  previewParcelShare,
  revokeParcelShare,
} from '@/lib/scheme/parcelSharing'
const reply = (data: unknown) =>
  NextResponse.json(
    { data },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    },
  )
export const dynamic = 'force-dynamic'
export const GET = apiHandler(
  { auth: true, rateLimit: { max: 30, windowMs: 60000 } },
  async (request, ctx) => {
    const query = new URL(request.url).searchParams
    if (
      query.get('mode') === 'preview' &&
      query.getAll('mode').length === 1 &&
      query.getAll('export_request_id').length === 1 &&
      [...query.keys()].every((key) =>
        ['mode', 'export_request_id'].includes(key),
      )
    )
      return reply(
        await previewParcelShare(
          ctx.userId,
          ctx.params.id,
          query.get('export_request_id') ?? '',
        ),
      )
    if (
      [...query.keys()].some((key) => key !== 'page') ||
      query.getAll('page').length > 1 ||
      !/^[1-9][0-9]{0,5}$/.test(query.get('page') ?? '1')
    )
      throw new AppError(
        'Choose a valid sharing history page or exact export preview.',
        400,
      )
    return reply(
      await listParcelShares(
        ctx.userId,
        ctx.params.id,
        Number(query.get('page') ?? '1'),
      ),
    )
  },
)
export const POST = apiHandler(
  { auth: true, rawBody: true, rateLimit: { max: 10, windowMs: 60000 } },
  async (request, ctx) => {
    const query = new URL(request.url).searchParams
    if (
      [...query.keys()].some((key) => key !== 'action') ||
      query.getAll('action').length > 1 ||
      (query.has('action') && query.get('action') !== 'revoke')
    )
      throw new AppError('Choose a valid sharing command.', 400)
    if (!request.body)
      throw new AppError('A reviewed sharing command is required.', 400)
    const text = await readTextBounded(request.body, 8192)
    if (text === null)
      throw new AppError('The sharing command exceeds 8 KiB.', 413)
    let input: unknown
    try {
      input = JSON.parse(text)
    } catch {
      throw new AppError('A valid JSON sharing command is required.', 400)
    }
    if (query.has('action')) {
      const parsed = z
        .object({ shareId: z.string().uuid() })
        .strict()
        .safeParse(input)
      if (!parsed.success)
        throw new AppError('Choose the exact sharing record to revoke.', 400)
      return reply(
        await revokeParcelShare(ctx.userId, ctx.params.id, parsed.data.shareId),
      )
    }
    return reply(await createParcelShare(ctx.userId, ctx.params.id, input))
  },
)
