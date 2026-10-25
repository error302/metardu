import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { AppError } from '@/lib/api/errors'
import { CreateBlockSchema } from '@/lib/validation/blockInputs'
import { createBlockMetadata } from '@/lib/scheme/blockMetadataCommands'
import { readBlockDirectory } from '@/lib/scheme/readBlockDirectory'

export const dynamic = 'force-dynamic'
export const POST = apiHandler(
  {
    auth: true,
    schema: CreateBlockSchema,
    audit: 'block_created',
    rateLimit: { max: 60, windowMs: 60000 },
    auditChain: {
      entityType: 'parcel',
      action: 'create',
      projectIdFromBody: 'project_id',
      reason: 'Block metadata creation',
    },
  },
  async (_request, ctx) => {
    const data = await createBlockMetadata(ctx.userId, ctx.body)
    return NextResponse.json(
      { data },
      { status: 201, headers: { 'Cache-Control': 'private, no-store' } },
    )
  },
)
export const GET = apiHandler(
  { auth: true, rateLimit: { max: 60, windowMs: 60000 } },
  async (request, ctx) => {
    const query = new URL(request.url).searchParams
    if (['project_id', 'page', 'q'].some((key) => query.getAll(key).length > 1))
      throw new AppError(
        'Choose one project and one value for each block filter.',
        400,
        'BLOCK_DIRECTORY_INPUT',
      )
    const data = await readBlockDirectory(
      ctx.userId,
      query.get('project_id') ?? '',
      { page: query.get('page') ?? undefined, q: query.get('q') ?? undefined },
    )
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  },
)
