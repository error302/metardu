import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getAuthUser } from '@/lib/auth/session'

/**
 * DELETE /api/projects/[id]
 *
 * Deletes a project and ALL associated data from every table that references
 * project_id, in reverse dependency order, wrapped in a transaction.
 *
 * Tables WITH CASCADE FK (already handled by DB but we delete explicitly
 * for safety in case some child tables have their own children without CASCADE):
 *   alignments, beacons, chainage_points, engineering_compute_results,
 *   mining_surveys, network_adjustments, parcels, scheme_details,
 *   submissions, supporting_documents, survey_points
 *
 * Tables WITHOUT FK (must be deleted manually to avoid orphans):
 *   bathymetric_surveys, benchmarks, cadastra_validations, cleaned_datasets,
 *   deed_plans, documents, field_books, gnss_sessions, history,
 *   leveling_runs, mine_twins, presence, project_attachments,
 *   project_beacons, project_fieldbook_entries, project_members,
 *   project_notes, project_submissions, rim_sections, safety_incidents,
 *   submission_documents, survey_epochs, survey_photos, survey_reports,
 *   usv_missions
 */

// Deduplicated list of all tables to delete from (child-first order)
const UNIQUE_TABLES = [
  'survey_photos', 'submission_documents', 'project_attachments',
  'project_beacons', 'project_fieldbook_entries', 'project_notes',
  'project_members', 'project_submissions', 'presence',
  'safety_incidents', 'history', 'documents', 'survey_epochs',
  'rim_sections', 'cleaned_datasets', 'cadastra_validations',
  'survey_points', 'chainage_points', 'alignments', 'beacons',
  'network_adjustments', 'engineering_compute_results', 'mining_surveys',
  'parcels', 'submissions', 'supporting_documents', 'scheme_details',
  'bathymetric_surveys', 'benchmarks', 'deed_plans', 'field_books',
  'gnss_sessions', 'leveling_runs', 'mine_twins', 'survey_reports',
]

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
    }

    // Verify project exists and belongs to the current user
    const ownership = await db.query(
      'SELECT id, user_id FROM projects WHERE id = $1',
      [id]
    )

    if (ownership.rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const project = ownership.rows[0]
    if (project.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden — you do not own this project' }, { status: 403 })
    }

    // Delete from all related tables in a single transaction
    const deletedTables: string[] = []
    const skippedTables: string[] = []
    const errors: string[] = []

    await db.transaction(async (client) => {
      for (const table of UNIQUE_TABLES) {
        try {
          await client.query(
            `DELETE FROM ${table} WHERE project_id = $1`,
            [id]
          )
          deletedTables.push(table)
        } catch (err: unknown) {
          // Table might not exist — skip it gracefully
          const msg = (((err as Error)?.message) || '').toLowerCase()
          if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('not exist')) {
            skippedTables.push(table)
          } else {
            // Log but continue — don't abort the entire transaction for one table
            console.warn(`[DELETE /api/projects/${id}] Failed to delete from ${table}:`, (err as Error).message)
            errors.push(`${table}: ${(err as Error).message}`)
          }
        }
      }

      // Finally delete the project itself
      const result = await client.query(
        'DELETE FROM projects WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, user.id]
      )

      if (result.rows.length === 0) {
        throw new Error('Project was deleted by another request or ownership changed')
      }
    })

    return NextResponse.json({
      success: true,
      deletedFrom: deletedTables,
      skipped: skippedTables,
      ...(errors.length > 0 && { warnings: errors }),
    })
  } catch (error: unknown) {
    console.error('[DELETE /api/projects] Error:', error)
    return NextResponse.json(
      {
        error: (error as Error).message || 'Failed to delete project',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}
