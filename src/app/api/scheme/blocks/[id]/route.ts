import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { AppError } from '@/lib/api/errors'
import { UpdateBlockSchema } from '@/lib/validation/blockInputs'
import {
  deleteBlockMetadata,
  updateBlockMetadata,
} from '@/lib/scheme/blockMetadataCommands'

export const dynamic = 'force-dynamic'
export const PATCH = apiHandler(
  {
    auth: true,
    schema: UpdateBlockSchema,
    optimisticLock: true,
    audit: 'block_updated',
    rateLimit: { max: 60, windowMs: 60000 },
    auditChain: {
      entityType: 'parcel',
      action: 'update',
      entityIdParam: 'id',
      reason: 'Block metadata update',
    },
  },
  async (_request, ctx) => {
    const data = await updateBlockMetadata(ctx.userId, ctx.params.id, ctx.body)
    return NextResponse.json(
      { data },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  },
)
export const DELETE = apiHandler(
  {
    auth: true,
    audit: 'block_deleted',
    rateLimit: { max: 60, windowMs: 60000 },
    auditChain: {
      entityType: 'parcel',
      action: 'delete',
      entityIdParam: 'id',
      reason: 'Empty block metadata deletion',
    },
  },
  async (request, ctx) => {
    const query = new URL(request.url).searchParams
    if (
      ['project_id', 'updated_at', 'row_version'].some(
        (key) => query.getAll(key).length > 1,
      )
    )
      throw new AppError(
        'One project and one loaded block version are required.',
        400,
        'BLOCK_INPUT',
      )
    const data = await deleteBlockMetadata(ctx.userId, ctx.params.id, {
      project_id: query.get('project_id') ?? undefined,
      updated_at: query.get('updated_at') ?? undefined,
      row_version: query.get('row_version') ?? undefined,
    })
    return NextResponse.json(
      { data },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  },
)
