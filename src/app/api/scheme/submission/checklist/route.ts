import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * Returns the document checklist for a scheme submission.
 * Defines what documents are required and tracks which are generated.
 */
const REQUIRED_DOCUMENTS = [
  { key: 'form_4', label: 'Form No. 4 (Survey Plan)', description: 'Statutory survey plan per Regulation 13(1)' },
  { key: 'rim', label: 'Registry Index Map (RIM)', description: 'Index showing all parcels in the scheme' },
  { key: 'deed_plans', label: 'Deed Plans (per parcel)', description: 'Boundary plans for each parcel' },
  { key: 'ppa2', label: 'PPA2 Forms (per parcel)', description: 'Preparation Plans Approval forms' },
  { key: 'computation_workbook', label: 'Computation Workbook', description: 'Full traverse computations and adjustments' },
  { key: 'coordinate_schedule', label: 'Coordinate Schedule', description: 'Table of all computed coordinates' },
  { key: 'bearing_schedule', label: 'Bearing Schedule', description: 'Table of all computed bearings and distances' },
]

const OPTIONAL_DOCUMENTS = [
  { key: 'mutation', label: 'Mutation Forms', description: 'Land mutation/transfer forms where applicable' },
  { key: 'lcb_consent', label: 'Land Control Board Consent', description: 'LCB consent letter' },
  { key: 'cla_form_3', label: 'CLA Form 3', description: 'Consent letter from interested parties' },
  { key: 'cla_form_5', label: 'CLA Form 5', description: 'Affidavit of service' },
  { key: 'cla_form_6', label: 'CLA Form 6', description: 'Statutory declaration' },
  { key: 'cla_form_7', label: 'CLA Form 7', description: 'Confirmation of mutation' },
]

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    // Check which documents have been generated
    const { rows: parcels } = await db.query(
      `SELECT p.id, p.parcel_number, p.status,
        pt.id as traverse_id, pt.status as traverse_status
       FROM parcels p
       JOIN blocks b ON b.id = p.block_id
       LEFT JOIN parcel_traverses pt ON pt.parcel_id = p.id
       WHERE b.project_id = $1`,
      [projectId]
    )

    const computedParcels = parcels.filter((p: any) => 
      p.traverse_status === 'computed' || p.traverse_status === 'approved'
    )

    // Build document status
    const documents = REQUIRED_DOCUMENTS.map(doc => {
      let status: 'ready' | 'partial' | 'missing' = 'missing'
      let detail = ''

      switch (doc.key) {
        case 'deed_plans':
          status = computedParcels.length > 0 ? (computedParcels.length === parcels.length ? 'ready' : 'partial') : 'missing'
          detail = `${computedParcels.length}/${parcels.length} parcels have deed plans`
          break
        case 'ppa2':
          status = computedParcels.length > 0 ? 'ready' : 'missing'
          detail = `Available for ${computedParcels.length} computed parcels`
          break
        case 'form_4':
          status = parcels.length > 0 ? 'ready' : 'missing'
          detail = parcels.length > 0 ? 'Can generate from project data' : 'No parcels defined'
          break
        case 'rim':
          status = parcels.length > 0 ? 'ready' : 'missing'
          detail = parcels.length > 0 ? `RIM covers ${parcels.length} parcels` : 'No parcels to map'
          break
        case 'computation_workbook':
          status = computedParcels.length > 0 ? 'ready' : 'missing'
          detail = computedParcels.length > 0 ? `${computedParcels.length} traverse computations` : 'No computations available'
          break
        case 'coordinate_schedule':
          status = computedParcels.length > 0 ? 'ready' : 'missing'
          detail = computedParcels.length > 0 ? 'From computed traverse coordinates' : 'No coordinates computed'
          break
        case 'bearing_schedule':
          status = computedParcels.length > 0 ? 'ready' : 'missing'
          detail = computedParcels.length > 0 ? 'From computed traverse observations' : 'No bearings computed'
          break
      }

      return { ...doc, status, detail, required: true }
    })

    const optionalDocs = OPTIONAL_DOCUMENTS.map(doc => ({
      ...doc,
      status: 'available' as const,
      detail: 'Optional — include if applicable',
      required: false,
    }))

    const requiredReady = documents.filter(d => d.status === 'ready').length
    const requiredTotal = documents.length

    return NextResponse.json({
      data: {
        project_id: projectId,
        documents: [...documents, ...optionalDocs],
        progress: {
          required_ready: requiredReady,
          required_total: requiredTotal,
          percentage: Math.round((requiredReady / requiredTotal) * 100),
          can_submit: requiredReady === requiredTotal,
        },
      }
    })
  } catch (err: any) {
    console.error('[GET submission checklist] Error:', err.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
