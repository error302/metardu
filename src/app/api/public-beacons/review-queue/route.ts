import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
export const dynamic = 'force-dynamic'
export const GET = apiHandler({ auth: true, roles: ['admin', 'super_admin'], rateLimit: { max: 60, windowMs: 60000 } }, async (_req, ctx) => {
  if (!(await db.query<{allowed:boolean}>('SELECT is_admin() AS allowed')).rows[0].allowed) return NextResponse.json({ error: 'An active database reviewer role is required' }, { status: 403 })
  const rows = (await db.query<Record<string,unknown>>("SELECT id,name,beacon_type,easting,northing,elevation,horizontal_crs,vertical_datum,source_reference,authority,country,description,status FROM public_beacons WHERE status='pending' AND submitted_by IS DISTINCT FROM $1 ORDER BY created_at,id LIMIT 100", [ctx.userId])).rows
  return NextResponse.json({ data: { beacons: rows, fieldVerified: false } }, { headers: { 'Cache-Control': 'private, no-store' } })
})
