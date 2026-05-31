/**
 * /api/marketplace/listings/[id]
 *
 * GET    — Get a single listing by ID
 * PATCH  — Mark sold or update fields (owner only)
 * DELETE — Delete a listing (owner only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { apiSuccess, apiError } from '@/lib/api/response'
import db from '@/lib/db'

export const dynamic = 'force-dynamic'

function rowToListing(row: Record<string, unknown>) {
  return {
    id: row.id,
    type: row.type,
    category: row.category,
    title: row.title,
    brand: row.brand,
    model: row.model,
    condition: row.condition,
    year: row.year ?? undefined,
    description: row.description,
    price: Number(row.price),
    currency: row.currency,
    rentPeriod: row.rent_period ?? undefined,
    location: row.location,
    country: row.country,
    sellerName: row.seller_name,
    sellerContact: row.seller_contact,
    images: row.images || [],
    verified: row.verified ?? false,
    sold: row.sold ?? false,
    userId: row.user_id,
    postedAt: row.created_at,
  }
}

// ── GET ────────────────────────────────────────────────────────────────────

export const GET = apiHandler({ auth: false }, async (req, ctx) => {
  const { id } = ctx.params

  const { rows } = await db.query(
    'SELECT * FROM instrument_listings WHERE id = $1',
    [id]
  )

  if (rows.length === 0) {
    return NextResponse.json(apiError('Listing not found'), { status: 404 })
  }

  return NextResponse.json(apiSuccess(rowToListing(rows[0])))
})

// ── PATCH ──────────────────────────────────────────────────────────────────

export const PATCH = apiHandler({ auth: true }, async (req, ctx) => {
  const { id } = ctx.params
  const body = ctx.body as Record<string, unknown>

  // Verify ownership
  const { rows: existing } = await db.query(
    'SELECT user_id FROM instrument_listings WHERE id = $1',
    [id]
  )
  if (existing.length === 0) {
    return NextResponse.json(apiError('Listing not found'), { status: 404 })
  }
  if (existing[0].user_id !== ctx.userId) {
    return NextResponse.json(apiError('You can only edit your own listings'), { status: 403 })
  }

  // Build dynamic SET clause for allowed fields
  const allowedFields: Record<string, unknown> = {}
  if ('sold' in body) allowedFields.sold = Boolean(body.sold)
  if ('title' in body) allowedFields.title = String(body.title).slice(0, 200)
  if ('description' in body) allowedFields.description = String(body.description).slice(0, 2000)
  if ('price' in body) allowedFields.price = parseFloat(String(body.price))
  if ('sold' in body) allowedFields.sold = Boolean(body.sold)

  const setClauses: string[] = ['updated_at = NOW()']
  const params: unknown[] = []
  let idx = 1

  for (const [key, value] of Object.entries(allowedFields)) {
    setClauses.push(`${key} = $${idx++}`)
    params.push(value)
  }

  params.push(id)

  const { rows } = await db.query(
    `UPDATE instrument_listings SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  )

  return NextResponse.json(apiSuccess(rowToListing(rows[0])))
})

// ── DELETE ─────────────────────────────────────────────────────────────────

export const DELETE = apiHandler({ auth: true }, async (req, ctx) => {
  const { id } = ctx.params

  // Verify ownership
  const { rows: existing } = await db.query(
    'SELECT user_id FROM instrument_listings WHERE id = $1',
    [id]
  )
  if (existing.length === 0) {
    return NextResponse.json(apiError('Listing not found'), { status: 404 })
  }
  if (existing[0].user_id !== ctx.userId) {
    return NextResponse.json(apiError('You can only delete your own listings'), { status: 403 })
  }

  await db.query('DELETE FROM instrument_listings WHERE id = $1', [id])

  return NextResponse.json(apiSuccess({ deleted: true }))
})
