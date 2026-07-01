/**
 * GET /api/project/[id]/validate
 *
 * Runs the statutory validation gate against a project and returns the
 * full result. Used by the SubmissionClient UI to show surveyors
 * whether their project is ready for export BEFORE they hit Generate.
 *
 * SECURITY: Verifies the requesting user owns the project before
 * running validation. The gate result exposes surveyor profile info,
 * traverse accuracy, and parcel geometry — sensitive data.
 *
 * Response shape (200):
 *   {
 *     gate: StatutoryGateResult,
 *     formatted: string  // human-readable summary
 *   }
 *
 * Response shape (403): project belongs to another user (IDOR protection)
 * Response shape (404): project not found
 *
 * The route never throws on validation failure — that's the gate's job.
 * It only throws on infrastructure errors (DB unavailable, etc).
 */

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler, apiSuccess } from '@/lib/apiHandler'
import db from '@/lib/db'
import { runStatutoryGate, formatGateResult } from '@/lib/validation/statutoryGate'
import { loadGateInputForProject, mergeGateInput } from '@/lib/validation/statutoryGateLoader'
import { fetchSurveyorProfile } from '@/lib/survey/fetchSurveyorProfile'

export const GET = apiHandler(
  { auth: true, rateLimit: { max: 30, windowMs: 60000 } },
  async (_req, ctx) => {
    const { id } = ctx.params
    const userId = ctx.userId

    // IDOR protection — verify the project belongs to the requesting user
    const ownershipResult = await db.query(
      'SELECT user_id FROM projects WHERE id = $1',
      [id]
    )
    if (ownershipResult.rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    const projectUserId = ownershipResult.rows[0].user_id
    if (projectUserId && projectUserId !== userId) {
      return NextResponse.json(
        { error: 'Forbidden: project belongs to another user', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    // Load gate input from DB
    const loadedInput = await loadGateInputForProject(id)
    if (!loadedInput) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Merge in surveyor profile (loaded from project + surveyor_profiles)
    const profile = await fetchSurveyorProfile(id)
    const gateInput = mergeGateInput(loadedInput, {
      surveyor: {
        name: profile.surveyorName || loadedInput.surveyor.name,
        licenseNumber: profile.iskNumber || loadedInput.surveyor.licenseNumber,
      },
    })

    // Run the gate (pure function — no side effects)
    const gateResult = runStatutoryGate(gateInput)

    return apiSuccess({
      gate: gateResult,
      formatted: formatGateResult(gateResult),
    })
  }
)
