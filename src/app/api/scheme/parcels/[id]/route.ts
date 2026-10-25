import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { AppError } from '@/lib/api/errors'
import { UpdateParcelSchema } from '@/lib/validation/apiSchemas'
import { deleteParcelMetadata, updateParcelMetadata } from '@/lib/scheme/parcelMetadataCommands'

export const dynamic = 'force-dynamic'
export const PATCH = apiHandler({
  auth: true, schema: UpdateParcelSchema, optimisticLock: true, audit: 'parcel_updated',
  auditChain: { entityType: 'parcel', action: 'update', entityIdParam: 'id' },
  rateLimit: { max: 60, windowMs: 60000 },
}, async (_request, ctx) => {
  const data = await updateParcelMetadata(ctx.userId, ctx.params.id, ctx.body)
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } })
})

export const DELETE = apiHandler({ auth: true, audit: 'parcel_deleted', rateLimit: { max: 60, windowMs: 60000 } }, async (request, ctx) => {
  const query = new URL(request.url).searchParams
  if (['project_id','block_id','updated_at','base_revision'].some(key => query.getAll(key).length > 1)) throw new AppError('One destination and loaded version are required.',400,'PARCEL_INPUT')
  const data = await deleteParcelMetadata(ctx.userId,ctx.params.id,{
    project_id:query.get('project_id') ?? undefined,block_id:query.get('block_id') ?? undefined,
    updated_at:query.get('updated_at') ?? undefined,base_revision:query.get('base_revision') ?? undefined,
  })
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } })
})
