import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// POST /api/scheme/import — Bulk import parcels from CSV into a block
// Expected CSV columns (case-insensitive header matching):
//   parcel_number, lr_number_proposed, area_ha, notes
//   Optional: assigned_surveyor
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const projectId = formData.get('project_id')
    const blockId = formData.get('block_id')
    const csvFile = formData.get('file') as File | null

    if (!projectId || !blockId) {
      return NextResponse.json({ error: 'project_id and block_id are required' }, { status: 400 })
    }

    if (!csvFile) {
      return NextResponse.json({ error: 'No CSV file provided' }, { status: 400 })
    }

    // Verify block belongs to user's project
    const check = await db.query(
      `SELECT b.id, b.project_id FROM blocks b
       JOIN projects p ON p.id = b.project_id
       WHERE b.id = $1 AND p.user_id = $2`,
      [blockId, session.user.id]
    )
    if (check.rows.length === 0) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404 })
    }

    // Parse CSV
    const csvText = await csvFile.text()
    const lines = csvText.trim().split(/\r?\n/)
    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV file is empty or has no data rows' }, { status: 400 })
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))

    // Find column indices
    const findCol = (names: string[]): number => {
      for (const name of names) {
        const idx = headers.indexOf(name)
        if (idx >= 0) return idx
      }
      return -1
    }

    const parcelNumCol = findCol(['parcel_number', 'parcel', 'parcel_no', 'plot_number', 'plot_no', 'number'])
    const lrCol = findCol(['lr_number_proposed', 'lr_number', 'lr_no', 'lr_proposed', 'lr', 'proposed_lr'])
    const areaCol = findCol(['area_ha', 'area', 'size_ha', 'hectares'])
    const notesCol = findCol(['notes', 'description', 'remarks', 'comment'])

    if (parcelNumCol === -1) {
      return NextResponse.json({
        error: 'Missing required column "parcel_number". Expected headers: parcel_number, lr_number_proposed, area_ha, notes',
      }, { status: 400 })
    }

    const results = { created: 0, skipped: 0, errors: [] as string[] }
    const maxParcels = 500 // Safety limit

    for (let i = 1; i < lines.length && results.created < maxParcels; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
      if (values.length <= 1) continue

      const parcelNumber = values[parcelNumCol]?.trim()
      if (!parcelNumber) {
        results.skipped++
        results.errors.push(`Row ${i + 1}: empty parcel number`)
        continue
      }

      const lrNumber = lrCol >= 0 ? (values[lrCol]?.trim() || null) : null
      const areaHa = areaCol >= 0 ? (parseFloat(values[areaCol]) || null) : null
      const notes = notesCol >= 0 ? (values[notesCol]?.trim() || null) : null

      // Check for duplicate
      const dupCheck = await db.query(
        'SELECT id FROM parcels WHERE block_id = $1 AND parcel_number = $2',
        [blockId, parcelNumber]
      )

      if (dupCheck.rows.length > 0) {
        // Update existing parcel instead
        await db.query(
          `UPDATE parcels SET
            lr_number_proposed = $3,
            area_ha = $4,
            notes = $5,
            updated_at = NOW()
          WHERE block_id = $1 AND parcel_number = $2`,
          [blockId, parcelNumber, lrNumber, areaHa, notes]
        )
        results.skipped++
      } else {
        await db.query(
          `INSERT INTO parcels (project_id, block_id, parcel_number, lr_number_proposed, area_ha, status, notes)
           VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
          [parseInt(projectId as string), parseInt(blockId as string), parcelNumber, lrNumber, areaHa, notes]
        )
        results.created++
      }
    }

    return NextResponse.json({
      data: {
        total_rows: lines.length - 1,
        created: results.created,
        skipped: results.skipped,
        errors: results.errors.slice(0, 20), // Limit error display
      },
    })
  } catch (error) {
    console.error('CSV import error:', error)
    return NextResponse.json({ error: 'Import failed', details: String(error) }, { status: 500 })
  }
}
