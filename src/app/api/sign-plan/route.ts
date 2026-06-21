/**
 * METARDU — Sign Plan API Route (Phase 3 Enhanced)
 *
 * Accepts projectId, loads survey plan data from the database,
 * generates the SVG → PDF, applies the digital signature using
 * surveyor credentials from the project, stores the signature
 * record, and returns the signed PDF bytes.
 *
 * POST /api/sign-plan
 * Body: { projectId: string }
 * Response: PDF binary (application/pdf) or JSON error
 */

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import db from '@/lib/db'
import { log } from '@/lib/logger'
import { generateSignedPdf, type SignedPdfResult } from '@/lib/reports/surveyPlan/signedPdfExport'
import type { SurveyPlanData } from '@/lib/reports/surveyPlan/types'

export const POST = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { projectId } = (ctx.body as { projectId?: string }) || {}
  if (!projectId) {
    return NextResponse.json(
      { error: 'Missing projectId', code: 'MISSING_PROJECT_ID' },
      { status: 400 },
    )
  }

  // ── Load project data ──
  const { rows: projectRows } = await db.query(
    `SELECT id, name, location, municipality, utm_zone, hemisphere, datum,
            client_name, surveyor_name, surveyor_licence, firm_name, firm_address,
            firm_phone, firm_email, drawing_no, reference, plan_title, area_sqm,
            area_ha, parcel_id, street, road_class, isk_reg_no, version,
            sheet_no, total_sheets, north_rotation_deg, lr_number, plot_parcel_number,
            folio_number, register_number, fir_number, file_reference
     FROM projects WHERE id = $1 LIMIT 1`,
    [projectId],
  )

  if (projectRows.length === 0) {
    return NextResponse.json(
      { error: 'Project not found', code: 'NOT_FOUND' },
      { status: 404 },
    )
  }

  const project = projectRows[0]

  // ── Load boundary points ──
  const { rows: boundaryRows } = await db.query(
    `SELECT name, easting, northing, elevation, monument_type, beacon_description
     FROM boundary_points WHERE project_id = $1 ORDER BY sequence`,
    [projectId],
  )

  if (boundaryRows.length < 3) {
    return NextResponse.json(
      { error: 'Project must have at least 3 boundary points', code: 'INSUFFICIENT_POINTS' },
      { status: 400 },
    )
  }

  // ── Load adjacent lots ──
  const { rows: adjacentRows } = await db.query(
    `SELECT id, boundary_points, plan_reference FROM adjacent_lots WHERE project_id = $1`,
    [projectId],
  )

  // ── Load fence offsets ──
  const { rows: fenceRows } = await db.query(
    `SELECT segment_index, type, offset_metres, callout_text FROM fence_offsets WHERE project_id = $1`,
    [projectId],
  )

  // ── Load buildings ──
  const { rows: buildingRows } = await db.query(
    `SELECT easting, northing, width_m, height_m, rotation_deg, label FROM buildings WHERE project_id = $1`,
    [projectId],
  )

  // ── Load surveyor profile ──
  const { rows: profileResult } = await db.query(
    'SELECT full_name, isk_number, firm_name FROM profiles WHERE id = $1 LIMIT 1',
    [ctx.userId],
  )
  const profile = profileResult[0]

  // ── Build SurveyPlanData ──
  const surveyPlanData: SurveyPlanData = {
    project: {
      name: project.name || 'Untitled Project',
      location: project.location || '',
      municipality: project.municipality || undefined,
      utm_zone: project.utm_zone || 37,
      hemisphere: project.hemisphere || 'S',
      datum: project.datum || 'ARC1960',
      client_name: project.client_name || undefined,
      surveyor_name: project.surveyor_name || profile?.full_name || '',
      surveyor_licence: project.surveyor_licence || '',
      firm_name: project.firm_name || profile?.firm_name || '',
      firm_address: project.firm_address || undefined,
      firm_phone: project.firm_phone || undefined,
      firm_email: project.firm_email || undefined,
      drawing_no: project.drawing_no || undefined,
      reference: project.reference || undefined,
      plan_title: project.plan_title || undefined,
      area_sqm: project.area_sqm || undefined,
      area_ha: project.area_ha || undefined,
      parcel_id: project.parcel_id || project.lr_number || '',
      street: project.street || undefined,
      road_class: project.road_class || undefined,
      iskRegNo: project.isk_reg_no || profile?.isk_number || '',
      version: project.version || undefined,
      sheetNo: project.sheet_no || undefined,
      totalSheets: project.total_sheets || undefined,
      northRotationDeg: project.north_rotation_deg || undefined,
      lrNumber: project.lr_number || undefined,
      plotParcelNumber: project.plot_parcel_number || undefined,
      folioNumber: project.folio_number || undefined,
      registerNumber: project.register_number || undefined,
      firNumber: project.fir_number || undefined,
      fileReference: project.file_reference || undefined,
    },
    parcel: {
      boundaryPoints: boundaryRows.map((row: any) => ({
        name: row.name,
        easting: parseFloat(row.easting),
        northing: parseFloat(row.northing),
      })),
      area_sqm: parseFloat(project.area_sqm) || 0,
      perimeter_m: computePerimeter(boundaryRows),
    },
    controlPoints: boundaryRows.map((row: any) => ({
      name: row.name,
      easting: parseFloat(row.easting),
      northing: parseFloat(row.northing),
      elevation: row.elevation ? parseFloat(row.elevation) : undefined,
      monumentType: row.monument_type || 'found',
      beaconDescription: row.beacon_description || undefined,
    })),
    adjacentLots: adjacentRows.map((row: any) => ({
      id: row.id,
      boundaryPoints: typeof row.boundary_points === 'string'
        ? JSON.parse(row.boundary_points)
        : row.boundary_points || [],
      planReference: row.plan_reference || undefined,
    })),
    fenceOffsets: fenceRows.map((row: any) => ({
      segmentIndex: parseInt(row.segment_index, 10),
      type: row.type || 'fence_on_boundary',
      offsetMetres: parseFloat(row.offset_metres) || 0,
      calloutText: row.callout_text || undefined,
    })),
    buildings: buildingRows.map((row: any) => ({
      easting: parseFloat(row.easting),
      northing: parseFloat(row.northing),
      width_m: parseFloat(row.width_m) || 10,
      height_m: parseFloat(row.height_m) || 8,
      rotation_deg: parseFloat(row.rotation_deg) || 0,
      label: row.label || undefined,
    })),
  }

  // ── Generate signed PDF ──
  try {
    const signerName = profile?.full_name || project.surveyor_name || ctx.session?.user?.email || 'Unknown Surveyor'
    const iskNumber = profile?.isk_number || project.isk_reg_no || 'Unknown ISK'
    const firmName = profile?.firm_name || project.firm_name || ''

    const result: SignedPdfResult = await generateSignedPdf(surveyPlanData, {
      signerName,
      iskNumber,
      firmName,
      signatureMethod: 'CERTIFICATE',
      documentId: project.drawing_no || projectId,
    })

    // ── Store signature record in database ──
    const { rows: sigRows } = await db.query(
      `INSERT INTO signatures (user_id, project_id, signature_data, signer_name, isk_number)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, signed_at`,
      [
        ctx.userId,
        projectId,
        result.documentHash,
        signerName,
        iskNumber,
      ],
    )

    if (sigRows.length === 0) {
      log({
        level: 'error',
        message: 'Failed to insert digital signature into database',
        metadata: { user_id: ctx.userId, project_id: projectId },
      })
      // Continue anyway — the PDF is still valid
    }

    log({
      level: 'info',
      message: 'Signed PDF generated successfully',
      metadata: {
        user_id: ctx.userId,
        project_id: projectId,
        document_hash: result.documentHash.substring(0, 16),
        verification_token: result.verificationToken,
      },
    })

    // ── Return the signed PDF as binary ──
    return new NextResponse(Buffer.from(result.pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${(project.name || 'survey-plan').replace(/\s+/g, '_')}_signed.pdf"`,
        'X-Document-Hash': result.documentHash.substring(0, 16),
        'X-Verification-Token': result.verificationToken,
        'X-Signed-At': result.signedAt,
      },
    })
  } catch (err) {
    log({
      level: 'error',
      message: 'Failed to generate signed PDF',
      metadata: {
        user_id: ctx.userId,
        project_id: projectId,
        error: err instanceof Error ? err.message : String(err),
      },
    })
    return NextResponse.json(
      { error: 'Failed to generate signed PDF', code: 'PDF_GENERATION_FAILED' },
      { status: 500 },
    )
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computePerimeter(points: any[]): number {
  let perimeter = 0
  for (let i = 0; i < points.length; i++) {
    const from = points[i]
    const to = points[(i + 1) % points.length]
    const dx = parseFloat(to.easting) - parseFloat(from.easting)
    const dy = parseFloat(to.northing) - parseFloat(from.northing)
    perimeter += Math.sqrt(dx * dx + dy * dy)
  }
  return perimeter
}
