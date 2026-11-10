import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { requireProjectOwnership } from '@/lib/auth/ownership'
import { StatutoryWorkbookSchema } from '@/lib/validation/apiSchemas'

export const dynamic = 'force-dynamic'

export const POST = apiHandler({ auth: true, schema: StatutoryWorkbookSchema, rateLimit: { max: 25, windowMs: 60_000 } }, async (_request, ctx) => {
  const body = StatutoryWorkbookSchema.parse(ctx.body)
  const surveyDate = body.surveyDate || new Date().toISOString().slice(0, 10)
  let workbook: Buffer
  if (body.projectId) {
    const access = await requireProjectOwnership(body.projectId, ctx.userId)
    if (!access.ok) return access.error ?? NextResponse.json({ error: 'Project unavailable.' }, { status: 404 })
    try {
      const { buildProjectReviewWorkbook } = await import('@/lib/submission/assembleDocument')
      workbook = await buildProjectReviewWorkbook(body.projectId)
    } catch {
      return NextResponse.json({ error: 'A project workbook needs saved boundary and computation evidence. Review the project before exporting.' }, { status: 422 })
    }
  } else {
    const { generateStatutoryWorkbook } = await import('@/lib/submission/workbook/statutoryWorkbook')
    workbook = await generateStatutoryWorkbook({
      project: { name: body.projectName || 'Survey review workbook', lrNumber: body.lrNumber || '', parcelNumber: body.parcelNumber || '',
        county: body.county || '', division: '', district: '', locality: body.locality || '', surveyType: body.surveyType || 'cadastral',
        surveyDate, scaleDenominator: NaN },
      surveyor: { name: body.surveyorName || '', iskNumber: body.iskNumber || '', firmName: body.firmName || '' },
      submission: { referenceNumber: body.referenceNumber || '', revision: 0, status: 'DRAFT TEMPLATE' },
      fieldObservations: [], adjustedStations: [], levelling: null, legs: [], cogoResults: null,
      traverse: { method: 'bowditch', stations: [], angularMisclosureSec: NaN, angularToleranceSec: NaN, angularPassesQA: null,
        linearMisclosureM: NaN, perimeterM: NaN, precisionRatio: NaN, precisionMinimum: 5000, linearPassesQA: null },
      areaComputation: { stations: [], areaM2: NaN, areaHa: NaN, perimeterM: NaN },
    })
  }
  return new NextResponse(new Uint8Array(workbook), { headers: {
    'Cache-Control': 'private, no-store',
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="metardu-survey-review.xlsx"',
  } })
})
