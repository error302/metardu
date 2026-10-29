import { redirect } from 'next/navigation'
import { getAuthUser, isPlatformAdmin as checkIsAdmin } from '@/lib/auth/session'
import { requireProjectReadAccess } from '@/lib/auth/ownership'
import { setAuthenticatedDatabaseContext, resolveAuthenticatedOrganization } from '@/lib/auth/requestContext'
import { createClient } from '@/lib/api-client/server'
import { db } from '@/lib/db'
import { resolveStageReference } from '@/lib/workspaces/stageReference'
import type { StageId } from '@/lib/workspaces/stageRegistry'
import StageShell, { type StageBoundaryData, type StageSummary } from './StageShell'
import SchemeExportReview from '@/components/scheme/SchemeExportReview'

interface SummaryRow {
  point_count: number
  batch_count: number
  parcel_count: number
  event_count: number
  last_evidence_date: string | null
}

interface Props {
  params: Promise<{ id: string }>
  stageId: StageId
}

export default async function StagePage({ params, stageId }: Props) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const userIsAdmin = await checkIsAdmin()
  setAuthenticatedDatabaseContext(user.id)
  const organizationId = await resolveAuthenticatedOrganization(user.id)
  setAuthenticatedDatabaseContext(user.id, organizationId)
  if (!userIsAdmin && !(await requireProjectReadAccess(id, user.id)).ok) redirect('/dashboard')
  const dbClient = await createClient()

  const query = dbClient
    .from('projects')
    .select('id, user_id, name, project_type, datum, utm_zone, hemisphere, boundary_data')
    .eq('id', id)

  const { data: project, error } = await query.single()
  if (error || !project || !project.user_id) redirect('/dashboard')
  if (project.project_type === 'scheme') {
    if(stageId==='deliver')return <SchemeExportReview key={id} projectId={id} parcelIds={[]}/>
    redirect(`/project/${id}/scheme`)
  }

  const { data: referenceRows } = await dbClient
    .from('project_reference_systems')
    .select('*')
    .eq('project_id', id)
    .limit(1)
  const reference = resolveStageReference(
    (referenceRows?.[0] as Record<string, unknown> | undefined) ?? null,
    {
      datum: (project.datum as string | null) ?? null,
      utm_zone: (project.utm_zone as number | null) ?? null,
      hemisphere: (project.hemisphere as string | null) ?? null,
    },
  )

  let summary: StageSummary | null = null
  if (stageId === 'overview') {
    try {
      setAuthenticatedDatabaseContext(user.id, organizationId)
      const { rows } = await db.query<SummaryRow>(
        `SELECT
           (SELECT COUNT(*)::int FROM survey_points WHERE project_id = $1) AS point_count,
           (SELECT COUNT(*)::int FROM observation_batches WHERE project_id = $1) AS batch_count,
           (SELECT COUNT(*)::int FROM parcels WHERE project_id = $1) AS parcel_count,
           (SELECT COUNT(*)::int FROM evidence_events WHERE project_id = $1) AS event_count,
           (SELECT TO_CHAR(MAX(created_at), 'YYYY-MM-DD') FROM evidence_events WHERE project_id = $1) AS last_evidence_date`,
        [id],
      )
      const row = rows[0]
      if (row) {
        summary = {
          pointCount: row.point_count,
          observationBatchCount: row.batch_count,
          parcelCount: row.parcel_count,
          evidenceEventCount: row.event_count,
          lastEvidenceDate: row.last_evidence_date,
        }
      }
    } catch {
      // Missing/unavailable record tables must not be displayed as zero.
    }
  }

  return (
    <StageShell
      projectId={project.id as string}
      projectName={project.name as string}
      stageId={stageId}
      boundaryData={(project.boundary_data as StageBoundaryData | null) ?? null}
      reference={reference}
      summary={summary}
    />
  )
}

