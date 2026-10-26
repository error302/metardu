import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { AppError } from '@/lib/api/errors'
import { readBytesBounded } from '@/lib/security/requestBody'
import {
  cancelRetainedTraverse,
  readRetainedTraverse,
  saveRetainedTraverse,
} from '@/lib/scheme/traverseCommands'
import { TRAVERSE_BODY_LIMIT } from '@/lib/scheme/traverseContract'

export const dynamic = 'force-dynamic'
const response = (data: unknown) =>
  NextResponse.json(
    { data },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
export const GET = apiHandler(
  { auth: true, rateLimit: { max: 90, windowMs: 60000 } },
  async (request, ctx) => {
    const q = new URL(request.url).searchParams
    const allowed = [
      'project_id',
      'parcel_id',
      'revision_id',
      'request_id',
      'before_ordinal',
      'expected_user_id',
    ]
    if (
      [...q.keys()].some(
        (k) => !allowed.includes(k) || q.getAll(k).length !== 1,
      ) ||
      q.getAll('project_id').length !== 1 ||
      q.getAll('parcel_id').length !== 1
    )
      throw new AppError(
        'Choose one project, parcel, revision or receipt, and history cursor.',
        400,
      )
    if (q.has('expected_user_id') && q.get('expected_user_id') !== ctx.userId)
      throw new AppError(
        'The account changed. Keep the retained request with its original account.',
        403,
      )
    if (
      q.has('request_id') &&
      (q.has('revision_id') || q.has('before_ordinal'))
    )
      throw new AppError(
        'Recover a receipt separately from browsing revisions.',
        400,
      )
    const cursor = q.get('before_ordinal')
    if (
      cursor !== null &&
      (!/^[1-9]\d{0,9}$/.test(cursor) || Number(cursor) > 2147483646)
    )
      throw new AppError('Choose a valid retained history cursor.', 400)
    return response(
      await readRetainedTraverse(
        ctx.userId,
        q.get('project_id') ?? '',
        q.get('parcel_id') ?? '',
        {
          revisionId: q.get('revision_id') ?? undefined,
          requestId: q.get('request_id') ?? undefined,
          beforeOrdinal: cursor === null ? undefined : Number(cursor),
        },
      ),
    )
  },
)
export const POST = apiHandler(
  {
    auth: true,
    rawBody: true,
    rateLimit: { max: 30, windowMs: 60000 },
    audit: 'retained_traverse_request',
  },
  async (request, ctx) => {
    const q = new URL(request.url).searchParams
    if (
      [...q.keys()].some((k) => k !== 'action') ||
      q.getAll('action').length > 1 ||
      (q.has('action') && q.get('action') !== 'cancel')
    )
      throw new AppError(
        'Choose a new retained computation or cancellation.',
        400,
      )
    if (
      !request.headers
        .get('content-type')
        ?.toLowerCase()
        .startsWith('application/json')
    )
      throw new AppError('Send the retained command as application/json.', 415)
    const bytes = await readBytesBounded(
      request.body,
      q.get('action') === 'cancel' ? 16384 : TRAVERSE_BODY_LIMIT,
    )
    if (bytes === null)
      throw new AppError(
        'The retained command exceeds its byte limit. Original observations were not replaced.',
        413,
      )
    let text: string, input: unknown
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      input = JSON.parse(text)
    } catch {
      throw new AppError('The command must contain valid UTF-8 JSON.', 400)
    }
    return response(
      q.get('action') === 'cancel'
        ? await cancelRetainedTraverse(ctx.userId, input)
        : await saveRetainedTraverse(ctx.userId, input, text),
    )
  },
)
