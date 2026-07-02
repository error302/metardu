/**
 * /api/marketplace/inquiries
 *
 * GET  — Get inquiries for a listing (owner only)
 * POST — Send an inquiry to a listing (any authenticated user)
 *
 * AUDIT FIX (2026-07-03): This route previously queried
 * `instrument_inquiries` (which doesn't exist) with columns
 * `buyer_name`, `buyer_contact` (also don't exist). The actual table
 * is `listing_inquiries` (created in migration 033) with columns
 * `user_id`, `message`, `contact_email`, `contact_phone`, `status`.
 *
 * We now:
 *   - Read from `listing_inquiries`
 *   - JOIN with users + profiles so the listing owner can see the
 *     buyer's name + email without the buyer self-attesting
 *   - Look up the listing owner from `instrument_listings.user_id`
 *     (not `seller_contact`) for the auth check
 */

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { apiSuccess, apiError } from '@/lib/api/response'
import db from '@/lib/db'

export const dynamic = 'force-dynamic'

// ── GET ────────────────────────────────────────────────────────────────────

export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { searchParams } = new URL(req.url)
  const listingId = searchParams.get('listingId')

  if (!listingId) {
    return NextResponse.json(apiError('listingId query parameter is required'), { status: 400 })
  }

  // Verify the requesting user owns the listing
  const { rows: listingRows } = await db.query(
    'SELECT user_id FROM instrument_listings WHERE id = $1',
    [listingId]
  )
  if (listingRows.length === 0) {
    return NextResponse.json(apiError('Listing not found'), { status: 404 })
  }
  if (listingRows[0].user_id !== ctx.userId) {
    return NextResponse.json(apiError('Only the listing owner can view inquiries'), { status: 403 })
  }

  const { rows } = await db.query(
    `SELECT
       li.id,
       li.listing_id,
       li.user_id,
       li.message,
       li.contact_email,
       li.contact_phone,
       li.status,
       li.created_at,
       u.email       AS buyer_email,
       u.full_name   AS buyer_name,
       p.phone       AS buyer_phone
     FROM listing_inquiries li
     LEFT JOIN users    u ON u.id  = li.user_id
     LEFT JOIN profiles p ON p.id  = li.user_id
     WHERE li.listing_id = $1
     ORDER BY li.created_at DESC`,
    [listingId]
  )

  const inquiries = rows.map((row: Record<string, unknown>) => ({
    id: row.id,
    listingId: row.listing_id,
    userId: row.user_id,
    buyerName: row.buyer_name || row.contact_email || 'Anonymous',
    buyerContact: row.contact_phone || row.buyer_phone || row.contact_email || row.buyer_email || '',
    message: row.message,
    status: row.status,
    sentAt: row.created_at,
  }))

  return NextResponse.json(apiSuccess(inquiries))
})

// ── POST ───────────────────────────────────────────────────────────────────

export const POST = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const body = ctx.body as Record<string, unknown>

  const listingId = String(body.listingId ?? '')
  const message = String(body.message ?? '').trim()
  // Optional — buyer may provide a contact phone/email different from account
  const contactEmail = String(body.contactEmail ?? body.buyerEmail ?? '').trim() || null
  const contactPhone = String(body.contactPhone ?? body.buyerPhone ?? '').trim() || null

  if (!listingId) return NextResponse.json(apiError('Listing ID is required'), { status: 400 })
  if (!message) return NextResponse.json(apiError('Message is required'), { status: 400 })

  // Verify listing exists and is not sold
  const { rows: listingRows } = await db.query(
    'SELECT id FROM instrument_listings WHERE id = $1 AND NOT sold',
    [listingId]
  )
  if (listingRows.length === 0) {
    return NextResponse.json(apiError('Listing not found or already sold'), { status: 404 })
  }

  const { rows } = await db.query(
    `INSERT INTO listing_inquiries (listing_id, user_id, message, contact_email, contact_phone)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [listingId, ctx.userId, message, contactEmail, contactPhone]
  )

  const row = rows[0] as Record<string, unknown>
  return NextResponse.json(apiSuccess({
    id: row.id,
    listingId: row.listing_id,
    userId: row.user_id,
    message: row.message,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    status: row.status,
    sentAt: row.created_at,
  }), { status: 201 })
})
