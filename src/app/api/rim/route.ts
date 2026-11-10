import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import db from '@/lib/db'
import { requireProjectOwnership } from '@/lib/auth/ownership'
import { apiSuccess, apiError } from '@/lib/api/response'
import { rimReportType, readRimRegister, rimSectionFields, rimParcelFields, rimBeaconFields, type RimRegisterRow } from '@/lib/rim/register'

export const dynamic = 'force-dynamic'

const options = { auth: true, rateLimit: { max: 60, windowMs: 60_000 } } as const
const id = z.string().uuid()
const fields = 'id, project_id, user_id, status, input_data, created_at, updated_at'
const ownsReport = 'id = $1 AND user_id = $2 AND report_type = $3 AND EXISTS (SELECT 1 FROM projects WHERE projects.id = survey_reports.project_id AND projects.user_id = $2)'
const status = z.enum(['draft', 'review', 'approved'])
const noStore = { 'Cache-Control': 'private, no-store' }
const failure = (message: string, status: number) => NextResponse.json(apiError(message), { status, headers: noStore })
const missing = () => failure('RIM register not found.', 404)

const create = rimSectionFields.extend({
  project_id: id,
  parcels: z.array(rimParcelFields).max(1000).default([]),
  beacons: z.array(rimBeaconFields).max(1000).default([]),
})
const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create_section'), data: create }),
  z.object({ action: z.literal('add_parcel'), data: rimParcelFields.extend({ rimSectionId: id }) }),
  z.object({ action: z.literal('add_beacon'), data: rimBeaconFields.extend({ rimSectionId: id }) }),
  z.object({ action: z.literal('generate_pdf'), rimSectionId: id }),
])

export const GET = apiHandler(options, async (request, ctx) => {
  const section = request.nextUrl.searchParams.get('rimSectionId')
  if (section) {
    if (!id.safeParse(section).success) return failure('Invalid RIM register ID.', 400)
    const { rows } = await db.query<RimRegisterRow>('SELECT ' + fields + ' FROM survey_reports WHERE ' + ownsReport,
      [section, ctx.userId, rimReportType])
    return rows[0] ? NextResponse.json(apiSuccess(readRimRegister(rows[0])), { headers: noStore }) : missing()
  }
  const project = id.safeParse(request.nextUrl.searchParams.get('projectId'))
  if (!project.success) return failure('Select a valid project.', 400)
  const access = await requireProjectOwnership(project.data, ctx.userId)
  if (!access.ok) return access.error ?? failure('Project unavailable.', 404)
  const { rows } = await db.query<RimRegisterRow>(
    'SELECT ' + fields + ' FROM survey_reports WHERE project_id = $1 AND user_id = $2 AND report_type = $3 ORDER BY updated_at DESC',
    [project.data, ctx.userId, rimReportType])
  return NextResponse.json(apiSuccess(rows.map(row => readRimRegister(row).section)), { headers: noStore })
})

export const POST = apiHandler(options, async (_request, ctx) => {
  const parsed = command.safeParse(ctx.body)
  if (!parsed.success) return failure(parsed.error.issues[0]?.message || 'Invalid RIM request.', 400)
  const body = parsed.data
  if (body.action === 'create_section') {
    const { project_id, parcels, beacons, ...section } = body.data
    const access = await requireProjectOwnership(project_id, ctx.userId)
    if (!access.ok) return access.error ?? failure('Project unavailable.', 404)
    const payload = { section, parcels: parcels.map(parcel => ({ ...parcel, id: randomUUID() })), beacons: beacons.map(beacon => ({ ...beacon, id: randomUUID() })) }
    const { rows } = await db.query<RimRegisterRow>(
      'INSERT INTO survey_reports (project_id,user_id,report_type,report_title,status,input_data) VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING ' + fields,
      [project_id, ctx.userId, rimReportType, section.section_name, 'draft', JSON.stringify(payload)])
    return NextResponse.json(apiSuccess(readRimRegister(rows[0]).section), { status: 201, headers: noStore })
  }
  if (body.action === 'generate_pdf') {
    const { rows } = await db.query<RimRegisterRow>('SELECT ' + fields + ' FROM survey_reports WHERE ' + ownsReport,
      [body.rimSectionId, ctx.userId, rimReportType])
    if (!rows[0]) return missing()
    const { section, parcels, beacons } = readRimRegister(rows[0])
    const { generateRimPdf } = await import('@/lib/rim/rimPdfGenerator')
    const filename = (section.section_name || 'draft').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
    return new NextResponse(Buffer.from(generateRimPdf(section, parcels, beacons)), {
      headers: { ...noStore, 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="RIM_' + filename + '.pdf"' },
    })
  }

  const { rimSectionId, ...record } = body.data
  const key = body.action === 'add_parcel' ? 'parcels' : 'beacons'
  const item = { ...record, id: randomUUID() }
  const { rows } = await db.query<{ id: string }>(
    'UPDATE survey_reports SET input_data = jsonb_set(input_data, ARRAY[$4::text], (input_data -> $4::text) || $5::jsonb) WHERE ' +
    ownsReport + ' AND jsonb_array_length(input_data -> $4::text) < 1000 RETURNING id',
    [rimSectionId, ctx.userId, rimReportType, key, JSON.stringify([item])])
  if (!rows[0]) return failure('The register is unavailable or its row limit has been reached.', 409)
  return NextResponse.json(apiSuccess({ ...item, rim_section_id: rimSectionId }), { status: 201, headers: noStore })
})

export const PUT = apiHandler(options, async (_request, ctx) => {
  const parsed = z.object({ action: z.literal('update_section'), id, data: rimSectionFields.extend({ status: status.default('draft') }) }).safeParse(ctx.body)
  if (!parsed.success) return failure(parsed.error.issues[0]?.message || 'Invalid RIM details.', 400)
  const { status: reviewStatus, ...section } = parsed.data.data
  const { rows } = await db.query<RimRegisterRow>(
    "UPDATE survey_reports SET input_data = jsonb_set(input_data, '{section}', $4::jsonb), report_title = $5, status = $6 WHERE " + ownsReport + ' RETURNING ' + fields,
    [parsed.data.id, ctx.userId, rimReportType, JSON.stringify(section), section.section_name, reviewStatus])
  return rows[0] ? NextResponse.json(apiSuccess(readRimRegister(rows[0]).section), { headers: noStore }) : missing()
})

export const DELETE = apiHandler(options, async (request, ctx) => {
  const parsed = id.safeParse(request.nextUrl.searchParams.get('rimSectionId'))
  if (!parsed.success) return failure('Invalid RIM register ID.', 400)
  const { rows } = await db.query<{ id: string }>('DELETE FROM survey_reports WHERE ' + ownsReport + ' RETURNING id', [parsed.data, ctx.userId, rimReportType])
  return rows[0] ? NextResponse.json(apiSuccess({ deleted: true, id: rows[0].id }), { headers: noStore }) : missing()
})
