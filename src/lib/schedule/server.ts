import { createHash } from 'node:crypto'
import type { PoolClient } from 'pg'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import type { ScheduleCreate, ScheduleUpdate, SurveySchedule } from './contracts'

interface ScheduleRow {
  id: string; user_id: string; project_id: string | null; organization_id: string | null; project_name: string | null
  title: string; notes: string; location: string; starts_at: Date; time_zone: string
  duration_minutes: number; reminder_minutes: number[]; status: SurveySchedule['status']
  version: number; create_request_hash: string; created_at: Date; updated_at: Date; can_collect: boolean
}
interface ProjectRow { organization_id: string | null; id: string; name: string; location: string | null; survey_type: string | null; can_collect: boolean }
const columns = `j.*,p.name AS project_name,
  COALESCE(p.id IS NOT NULL AND public.survey_schedule_project_access(p.id,TRUE),FALSE) AS can_collect`
const joined = `FROM public.job_schedule j LEFT JOIN public.projects p ON p.id=j.project_id AND public.survey_schedule_project_access(p.id,FALSE)`
const dto = (row: ScheduleRow): SurveySchedule => ({
  id:row.id,project_id:row.project_id,project_name:row.project_name,title:row.title,notes:row.notes,
  location:row.location,starts_at:row.starts_at.toISOString(),time_zone:row.time_zone,
  duration_minutes:row.duration_minutes,reminder_minutes:row.reminder_minutes,status:row.status,
  version:row.version,created_at:row.created_at.toISOString(),updated_at:row.updated_at.toISOString(),can_collect:row.can_collect,
})
async function project(client: PoolClient, projectId: string) {
  const result = await client.query<ProjectRow>(
    `SELECT id,name,location,survey_type,organization_id,public.survey_schedule_project_access(id,TRUE) AS can_collect
     FROM public.projects WHERE id=$1 AND user_id IS NOT NULL AND public.survey_schedule_project_access(id,FALSE)`, [projectId],
  )
  if (!result.rows[0]) throw new AppError('The selected project is not available to your account.',404,'PROJECT_NOT_FOUND')
  return result.rows[0]
}
function validateStart(value: string) {
  const time = Date.parse(value)
  if (time < Date.now()-5*60_000 || time > Date.now()+5*366*86_400_000)
    throw new AppError('Choose a start time between now and five years ahead.',400,'INVALID_START_TIME')
}
async function queue(client: PoolClient, row: ScheduleRow) {
  const now = Date.now(), start = row.starts_at.getTime(), end = start+row.duration_minutes*60_000
  if (end <= now) return
  const insert = async (kind: string, lead: number, due: number, expires: number) => {
    await client.query<{ id: string }>(
      `INSERT INTO public.survey_reminder_outbox(user_id,schedule_id,schedule_version,kind,lead_minutes,due_at,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(schedule_id,schedule_version,kind,lead_minutes) DO NOTHING RETURNING id`,
      [row.user_id,row.id,row.version,kind,lead,new Date(due),new Date(expires)],
    )
  }
  await insert('confirmation',0,now,Math.min(end,now+86_400_000))
  for (const lead of row.reminder_minutes) {
    const due = start-lead*60_000
    if (due >= now) await insert('reminder',lead,due,end)
  }
}
async function activity(client:PoolClient,row:ScheduleRow,created:boolean) {
  if(!row.project_id||!row.can_collect)return
  await client.query<never>(
    "INSERT INTO public.user_activity(user_id,project_id,activity_type,entity_type,entity_id,description) VALUES($1,$2,$3,'schedule',$4,$5)",
    [row.user_id,row.project_id,created?'survey_scheduled':'survey_schedule_updated',row.id,(created?'Survey scheduled: ':'Survey schedule updated: ')+row.title],
  )
}
export async function getScheduledJob(userId:string,id:string) {
  const result=await db.query<ScheduleRow>(`SELECT ${columns} ${joined} WHERE j.id=$1 AND j.user_id=$2`,[id,userId])
  if(!result.rows[0])throw new AppError('This scheduled survey is not available to your account.',404,'NOT_FOUND')
  return dto(result.rows[0])
}
export async function listSchedules(userId: string, status: string | null, offset: number, limit: number) {
  const result = await db.query<ScheduleRow>(
    `SELECT ${columns} ${joined} WHERE j.user_id=$1 AND ($2::text IS NULL OR j.status=$2)
     ORDER BY j.starts_at,j.id LIMIT $3 OFFSET $4`, [userId,status,limit+1,offset],
  )
  return { schedules:result.rows.slice(0,limit).map(dto),hasMore:result.rows.length>limit }
}
export async function listScheduleProjects(query: string, id: string | null) {
  const result = await db.query<ProjectRow>(
    `SELECT id,name,location,survey_type,organization_id,public.survey_schedule_project_access(id,TRUE) AS can_collect
     FROM public.projects WHERE user_id IS NOT NULL AND public.survey_schedule_project_access(id,FALSE)
       AND ($1::uuid IS NULL OR id=$1) AND ($2='' OR name ILIKE '%'||$2||'%')
     ORDER BY name,id LIMIT 51`, [id,query],
  )
  return { projects:result.rows.slice(0,50),hasMore:result.rows.length>50 }
}
export async function createScheduledJob(userId: string, input: ScheduleCreate) {
  validateStart(input.starts_at)
  const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
  return db.transaction(async client => {
    const selected=await project(client,input.project_id)
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO public.job_schedule(id,user_id,project_id,title,notes,location,starts_at,time_zone,duration_minutes,reminder_minutes,create_request_hash,organization_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO NOTHING RETURNING id`,
      [input.request_id,userId,input.project_id,input.title,input.notes,input.location,input.starts_at,input.time_zone,input.duration_minutes,input.reminder_minutes,requestHash,selected.organization_id],
    )
    const found = await client.query<ScheduleRow>(`SELECT ${columns} ${joined} WHERE j.id=$1 AND j.user_id=$2`,[input.request_id,userId])
    const row = found.rows[0]
    if (!row || row.create_request_hash !== requestHash) throw new AppError('This save request cannot be reused with different details.',409,'REQUEST_CONFLICT')
    if (inserted.rowCount === 1) { await queue(client,row);await activity(client,row,true) }
    return dto(row)
  })
}
export async function updateScheduledJob(userId: string, id: string, input: ScheduleUpdate) {
  return db.transaction(async client => {
    const result = await client.query<ScheduleRow>(`SELECT ${columns} ${joined} WHERE j.id=$1 AND j.user_id=$2 FOR UPDATE OF j`,[id,userId])
    const old = result.rows[0]
    if (!old) throw new AppError('Scheduled job not found.',404,'NOT_FOUND')
    if (old.version !== input.version) throw new AppError('This job changed in another tab. Refresh it before saving.',409,'VERSION_CONFLICT')
    const nextProject = input.project_id ?? old.project_id
    let organizationId=old.organization_id
    if (input.project_id || input.status === 'in_progress') {
      if (!nextProject) throw new AppError('Choose an available project before collecting.',400,'PROJECT_REQUIRED')
      const access = await project(client,nextProject)
      organizationId=access.organization_id
      if (input.status === 'in_progress' && !access.can_collect) throw new AppError('Your project role permits viewing, not field collection.',403,'READ_ONLY_PROJECT')
    }
    if (input.starts_at && Date.parse(input.starts_at) !== old.starts_at.getTime()) validateStart(input.starts_at)
    if (input.status === 'upcoming' && old.status !== 'upcoming') validateStart(input.starts_at ?? old.starts_at.toISOString())
    const updated = await client.query<{ id: string }>(
      `UPDATE public.job_schedule SET project_id=$3,title=$4,notes=$5,location=$6,starts_at=$7,time_zone=$8,
       duration_minutes=$9,reminder_minutes=$10,status=$11,organization_id=$12,version=version+1,updated_at=NOW()
       WHERE id=$1 AND user_id=$2 RETURNING id`,
      [id,userId,nextProject,input.title??old.title,input.notes??old.notes,input.location??old.location,
       input.starts_at??old.starts_at,input.time_zone??old.time_zone,input.duration_minutes??old.duration_minutes,
       input.reminder_minutes??old.reminder_minutes,input.status??old.status,organizationId],
    )
    if (updated.rowCount !== 1) throw new AppError('The update was not confirmed.',409,'VERSION_CONFLICT')
    // Service access is local to this owned transaction; never an ALS/global identity.
    await client.query<never>("SELECT set_config('request.access_role','survey_reminders',true)")
    await client.query<never>(
      "UPDATE public.survey_reminder_outbox SET status='cancelled',lease_token=NULL WHERE schedule_id=$1 AND user_id=$2 AND status IN ('pending','sending')",
      [id,userId],
    )
    await client.query<never>(
      "UPDATE public.notifications SET expires_at=NOW() WHERE user_id=$1 AND id IN (SELECT notification_id FROM public.survey_reminder_outbox WHERE schedule_id=$2 AND user_id=$1)",
      [userId,id],
    )
    await client.query<never>("SELECT set_config('request.access_role','',true)")
    const found = await client.query<ScheduleRow>(`SELECT ${columns} ${joined} WHERE j.id=$1 AND j.user_id=$2`,[id,userId])
    const row=found.rows[0]
    if (row.status === 'upcoming') await queue(client,row)
    await activity(client,row,false)
    return dto(row)
  })
}
