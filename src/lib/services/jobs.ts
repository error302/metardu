import db from '@/lib/db'
import { auth } from '@/auth'

interface MetarduJob {
  id: string
  user_id: string
  name: string
  client?: string | null
  survey_type?: string
  location?: unknown
  scheduled_date?: string | null
  crew_size?: number | null
  status?: string
  notes?: string | null
  created_at: string
  updated_at: string
}

interface CreateJobInput {
  name: string
  client?: string | null
  survey_type?: string
  location?: unknown
  scheduled_date?: string | null
  crew_size?: number | null
  status?: string
  notes?: string | null
}

export async function getUserJobs(): Promise<MetarduJob[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const result = await db.query(`
    SELECT id, user_id, name, client, survey_type, location, 
           scheduled_date, crew_size, status, notes, 
           created_at, updated_at
    FROM jobs 
    WHERE user_id = $1 
    ORDER BY scheduled_date ASC NULLS FIRST
  `, [session.user.id])

  return result.rows.map((row: MetarduJob) => ({
    ...row,
    location: typeof row.location === 'string' ? JSON.parse(row.location) : row.location
  }))
}

export async function createJob(job: CreateJobInput): Promise<MetarduJob> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Not authenticated')

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await db.query(`
    INSERT INTO jobs (id, user_id, name, client, survey_type, location, 
                     scheduled_date, crew_size, status, notes, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `, [
    id,
    session.user.id,
    job.name,
    job.client ?? null,
    job.survey_type ?? 'other',
    job.location ? JSON.stringify(job.location) : null,
    job.scheduled_date ?? null,
    job.crew_size ?? null,
    job.status ?? 'planned',
    job.notes ?? null,
    now,
    now
  ])

  const result = await db.query('SELECT * FROM jobs WHERE id = $1', [id])
  if (result.rows.length === 0) throw new Error('Failed to create job')
  
  const row = result.rows[0] as MetarduJob
  return {
    ...row,
    location: typeof row.location === 'string' ? JSON.parse(row.location) : row.location
  }
}

export async function getJob(id: string): Promise<MetarduJob | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  const result = await db.query(`
    SELECT * FROM jobs WHERE id = $1 AND user_id = $2
  `, [id, session.user.id])

  if (result.rows.length === 0) return null
  
  const row = result.rows[0] as MetarduJob
  return {
    ...row,
    location: typeof row.location === 'string' ? JSON.parse(row.location) : row.location
  }
}

export async function updateJob(id: string, updates: Partial<MetarduJob>): Promise<MetarduJob> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Not authenticated')

  const setClauses: string[] = ['updated_at = $2']
  const values: unknown[] = [id, new Date().toISOString()]
  let paramIndex = 3

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`)
    values.push(updates.name)
  }
  if (updates.client !== undefined) {
    setClauses.push(`client = $${paramIndex++}`)
    values.push(updates.client)
  }
  if (updates.survey_type !== undefined) {
    setClauses.push(`survey_type = $${paramIndex++}`)
    values.push(updates.survey_type)
  }
  if (updates.location !== undefined) {
    setClauses.push(`location = $${paramIndex++}`)
    values.push(JSON.stringify(updates.location))
  }
  if (updates.scheduled_date !== undefined) {
    setClauses.push(`scheduled_date = $${paramIndex++}`)
    values.push(updates.scheduled_date)
  }
  if (updates.crew_size !== undefined) {
    setClauses.push(`crew_size = $${paramIndex++}`)
    values.push(updates.crew_size)
  }
  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`)
    values.push(updates.status)
  }
  if (updates.notes !== undefined) {
    setClauses.push(`notes = $${paramIndex++}`)
    values.push(updates.notes)
  }

  setClauses.push(`user_id = $${paramIndex++}`)
  values.push(session.user.id)

  await db.query(`
    UPDATE jobs SET ${setClauses.join(', ')} 
    WHERE id = $1 AND user_id = $${paramIndex - 1}
  `, values)

  const result = await db.query('SELECT * FROM jobs WHERE id = $1', [id])
  if (result.rows.length === 0) throw new Error('Job not found')
  
  const row = result.rows[0] as MetarduJob
  return {
    ...row,
    location: typeof row.location === 'string' ? JSON.parse(row.location) : row.location
  }
}

export async function deleteJob(id: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Not authenticated')

  await db.query('DELETE FROM jobs WHERE id = $1 AND user_id = $2', [id, session.user.id])
}

export async function getEquipmentByType(surveyType: string): Promise<string[]> {
  const result = await db.query(
    'SELECT equipment FROM equipment_recommendations WHERE survey_type = $1',
    [surveyType]
  )
  return result.rows[0]?.equipment ?? []
}

export async function getChecklistByType(surveyType: string): Promise<string[]> {
  const result = await db.query(
    'SELECT tasks FROM job_checklists WHERE survey_type = $1',
    [surveyType]
  )
  return result.rows[0]?.tasks ?? []
}