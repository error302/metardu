import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiHandler } from '@/lib/apiHandler'
import { CreateParcelSchema } from '@/lib/validation/apiSchemas'
import { createParcelMetadata } from '@/lib/scheme/parcelMetadataCommands'
import {
  parcelWithBlockListResponseSchema,
  type ParcelWithBlock,
} from '@/lib/validation/scheme'

export const dynamic = 'force-dynamic'

export const POST = apiHandler(
  { auth: true, schema: CreateParcelSchema, audit: 'parcel_created' , rateLimit: { max: 60, windowMs: 60000 } },
  async (req, ctx) => {
    const data = await createParcelMetadata(ctx.userId, ctx.body)
    return NextResponse.json({ data }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
  }
)

export const GET = apiHandler(
  { auth: true, rateLimit: { max: 60, windowMs: 60000 } },
  async (req, ctx) => {
    const { searchParams } = new URL(req.url)
    const blockId = searchParams.get('block_id')
    const projectId = searchParams.get('project_id')

    if (!blockId && !projectId) {
      return NextResponse.json(
        { error: 'block_id or project_id query parameter is required' },
        { status: 400 }
      )
    }

    if (blockId) {
      const check = await db.query<{ id: string }>(
        `SELECT b.id FROM blocks b
        JOIN projects p ON p.id = b.project_id
        WHERE b.id = $1 AND p.user_id = $2`,
        [blockId, ctx.userId]
      )
      if (check.rows.length === 0) {
        return NextResponse.json({ error: 'Block not found' }, { status: 404 })
      }

      const result = await db.query<ParcelWithBlock>(
        `SELECT p.*, b.block_number, b.block_name
        FROM parcels p
        JOIN blocks b ON b.id = p.block_id
        WHERE p.block_id = $1
        ORDER BY p.parcel_number ASC`,
        [blockId]
      )

      const parsed = parcelWithBlockListResponseSchema.safeParse({ data: result.rows })
      if (!parsed.success) {
        // eslint-disable-next-line no-console -- internal response drift log, not user-facing
        console.error('[scheme/parcels] response validation failed:', parsed.error.issues)
        return NextResponse.json({ error: 'Internal response validation failed' }, { status: 500 })
      }
      return NextResponse.json(parsed.data)
    }

    if (projectId) {
      const check = await db.query<{ id: string }>(
        'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
        [projectId, ctx.userId]
      )
      if (check.rows.length === 0) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }

      const result = await db.query<ParcelWithBlock>(
        `SELECT p.*, b.block_number, b.block_name
        FROM parcels p
        JOIN blocks b ON b.id = p.block_id
        WHERE p.project_id = $1
        ORDER BY b.block_number ASC, p.parcel_number ASC`,
        [projectId]
      )

      const parsed = parcelWithBlockListResponseSchema.safeParse({ data: result.rows })
      if (!parsed.success) {
        // eslint-disable-next-line no-console -- internal response drift log, not user-facing
        console.error('[scheme/parcels] response validation failed:', parsed.error.issues)
        return NextResponse.json({ error: 'Internal response validation failed' }, { status: 500 })
      }
      return NextResponse.json(parsed.data)
    }

    return NextResponse.json({ data: [] })
  }
)
