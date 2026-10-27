import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { CreateParcelSchema, UpdateParcelSchema } from '@/lib/validation/apiSchemas'
import { parcelCommandRowSchema } from '@/lib/validation/scheme'

const savedParcelSchema = parcelCommandRowSchema
type SavedParcel = z.infer<typeof savedParcelSchema>
interface LockedParcel extends Omit<SavedParcel, 'status' | 'area_ha'> {
  status: string | null; area_ha: string | number | null; has_geometry: boolean; version_matches: boolean
}
const columns = `p.id,p.project_id,p.block_id,p.parcel_number,p.lr_number_proposed,p.lr_number_confirmed,
  p.area_ha,p.status,p.assigned_surveyor,p.notes,p.created_at,
  to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
  COALESCE(p.revision_number,0) AS revision_number`
const fields = ['parcel_number','lr_number_proposed','lr_number_confirmed','area_ha','status','assigned_surveyor','notes'] as const
const missing = () => new AppError('Parcel or destination block not found for this account and project.', 404, 'PARCEL_SCOPE')
const acknowledgement = () => new AppError('The database did not acknowledge the exact parcel change. The complete change was rolled back.', 500, 'PARCEL_ACKNOWLEDGEMENT')
function uuid(value: string) { if (!z.string().guid().safeParse(value).success) throw new AppError('A valid parcel/account UUID is required.', 400, 'PARCEL_IDENTITY') }
function nullableText(value: string | null | undefined) { return value === undefined ? undefined : value || null }
async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
  try { return await db.transaction(work) } catch (error) {
    const code = z.object({ code: z.string() }).safeParse(error)
    if (code.success && code.data.code === '23505') throw new AppError('This parcel number already exists in the block. No change was saved.', 409, 'PARCEL_DUPLICATE')
    if (code.success && code.data.code === '23503') throw new AppError('A related record changed. Refresh the register before retrying.', 409, 'PARCEL_RELATED_CONFLICT')
    if (code.success && code.data.code === '42P01') throw new AppError('The parcel register is temporarily unavailable. No change was saved.', 503, 'PARCEL_UNAVAILABLE')
    throw error
  }
}
async function lockProject(client: PoolClient, actorId: string, projectId: string) {
  const project = await client.query('SELECT id FROM projects WHERE id=$1 AND user_id=$2 FOR UPDATE', [projectId,actorId])
  if (project.rows.length !== 1) throw missing()
}
async function lockBlock(client: PoolClient, projectId: string, blockId: string) {
  const block = await client.query('SELECT id FROM blocks WHERE id=$1 AND project_id=$2 FOR UPDATE', [blockId,projectId])
  if (block.rows.length !== 1) throw missing()
}
async function lockParcel(client: PoolClient, actorId: string, parcelId: string, scope: { project_id?: string; block_id?: string }, version: string, revision?: number) {
  const preliminary = (await client.query<{project_id:string;block_id:string|null}>('SELECT project_id,block_id FROM parcels WHERE id=$1',[parcelId])).rows[0]
  if (!preliminary || scope.project_id && scope.project_id !== preliminary.project_id || scope.block_id && scope.block_id !== preliminary.block_id) throw missing()
  await lockProject(client,actorId,preliminary.project_id)
  if (preliminary.block_id) await lockBlock(client,preliminary.project_id,preliminary.block_id)
  const current = (await client.query<LockedParcel>(`SELECT ${columns},p.geom IS NOT NULL AS has_geometry,p.updated_at=$3::timestamptz AS version_matches
    FROM parcels p WHERE p.id=$1 AND p.project_id=$2 FOR UPDATE`,[parcelId,preliminary.project_id,version])).rows[0]
  if (!current || current.block_id !== preliminary.block_id) throw missing()
  if (!current.version_matches || revision !== undefined && current.revision_number !== revision) throw new AppError('This parcel changed after it was loaded. Refresh and review the current record before retrying.',409,'PARCEL_STALE')
  return current
}
function validateSaved(row: unknown, expected: Record<string, unknown>) {
  const parsed = savedParcelSchema.safeParse(row)
  if (!parsed.success) throw acknowledgement()
  for (const [key,value] of Object.entries(expected)) {
    const actual: unknown = parsed.data[key as keyof SavedParcel]
    if (actual !== value) throw acknowledgement()
  }
  if (!/\.\d{6}Z$/.test(parsed.data.updated_at)) throw acknowledgement()
  return parsed.data
}
export async function createParcelMetadata(actorId: string, input: unknown) {
  uuid(actorId)
  const request = CreateParcelSchema.safeParse(input)
  if (!request.success) throw new AppError('The parcel fields are invalid.',400,'PARCEL_INPUT')
  const body = request.data
  return transaction(async client => {
    const projectId = body.project_id ?? (await client.query<{project_id:string}>('SELECT project_id FROM blocks WHERE id=$1',[body.block_id])).rows[0]?.project_id
    if (!projectId) throw missing()
    await lockProject(client,actorId,projectId); await lockBlock(client,projectId,body.block_id)
    if ((await client.query('SELECT id FROM parcels WHERE block_id=$1 AND parcel_number=$2',[body.block_id,body.parcel_number])).rows.length) throw new AppError('This parcel number already exists in the block.',409,'PARCEL_DUPLICATE')
    const expected = { id:randomUUID(),project_id:projectId,block_id:body.block_id,parcel_number:body.parcel_number,lr_number_proposed:nullableText(body.lr_number_proposed) ?? null,lr_number_confirmed:null,area_ha:body.area_ha ?? null,status:'pending',assigned_surveyor:null,notes:nullableText(body.notes) ?? null,revision_number:1 }
    const saved = await client.query(`INSERT INTO parcels AS p(id,project_id,block_id,parcel_number,lr_number_proposed,area_ha,notes,status,revision_number)
      VALUES($1,$2,$3,$4,$5,$6,$7,'pending',1) RETURNING ${columns}`,[expected.id,projectId,body.block_id,body.parcel_number,expected.lr_number_proposed,expected.area_ha,expected.notes])
    if (saved.rows.length !== 1) throw acknowledgement()
    return validateSaved(saved.rows[0],expected)
  })
}
export async function updateParcelMetadata(actorId: string, parcelId: string, input: unknown) {
  uuid(actorId); uuid(parcelId)
  const request = UpdateParcelSchema.extend({updated_at:z.string().datetime({offset:true})}).safeParse(input)
  if (!request.success) throw new AppError('Valid parcel fields and the loaded version token are required.',400,'PARCEL_INPUT')
  const body = request.data, version = body.updated_at
  return transaction(async client => {
    const current = await lockParcel(client,actorId,parcelId,body,version,body.base_revision)
    const changes = { parcel_number:body.parcel_number,lr_number_proposed:nullableText(body.lr_number_proposed),lr_number_confirmed:nullableText(body.lr_number_confirmed),area_ha:body.area_ha,status:body.status,assigned_surveyor:body.assigned_surveyor,notes:nullableText(body.notes) }
    const selected = fields.filter(field => changes[field] !== undefined)
    if (!selected.length) throw new AppError('No parcel fields were supplied to change.',400,'PARCEL_INPUT')
    const values: unknown[] = selected.map(field => changes[field])
    const assignments = selected.map((field,index) => `"${field}"=$${index+1}`)
    values.push(parcelId,current.project_id,version,current.revision_number)
    const offset = selected.length
    const saved = await client.query<{updated_at:string}>(`UPDATE parcels AS p SET ${assignments.join(',')},updated_at=clock_timestamp(),revision_number=COALESCE(p.revision_number,0)+1
      WHERE p.id=$${offset+1} AND p.project_id=$${offset+2} AND p.updated_at=$${offset+3}::timestamptz AND COALESCE(p.revision_number,0)=$${offset+4} RETURNING ${columns}`,values)
    if (saved.rows.length !== 1 || saved.rows[0].updated_at === current.updated_at) throw acknowledgement()
    const expected: Record<string,unknown> = {id:parcelId,project_id:current.project_id,block_id:current.block_id,revision_number:current.revision_number+1}
    for (const field of fields) expected[field] = changes[field] !== undefined ? changes[field] : field === 'area_ha' && current.area_ha !== null ? Number(current.area_ha) : current[field]
    return validateSaved(saved.rows[0],expected)
  })
}
export const deleteParcelMetadataSchema = z.object({
  project_id:z.string().guid().optional(),block_id:z.string().guid().optional(),
  updated_at:z.string().datetime({offset:true}),base_revision:z.union([z.number(),z.string().regex(/^\d+$/).transform(Number)]).pipe(z.number().int().nonnegative().max(2147483646)).optional(),
})
export async function deleteParcelMetadata(actorId: string, parcelId: string, input: unknown) {
  uuid(actorId); uuid(parcelId)
  const request = deleteParcelMetadataSchema.safeParse(input)
  if (!request.success) throw new AppError('The loaded parcel version is required before deletion.',400,'PARCEL_INPUT')
  const body = request.data
  return transaction(async client => {
    const current = await lockParcel(client,actorId,parcelId,body,body.updated_at,body.base_revision)
    const related = await client.query<{retained:boolean}>(`SELECT EXISTS(SELECT 1 FROM parcel_traverses WHERE parcel_id=$1)
      OR EXISTS(SELECT 1 FROM parcel_import_sources WHERE parcel_id=$1) AS retained`,[parcelId])
    if (related.rows.length !== 1 || typeof related.rows[0].retained !== 'boolean') throw acknowledgement()
    if (current.has_geometry || current.status !== 'pending' || current.lr_number_confirmed || related.rows[0].retained) throw new AppError('This parcel retains survey, geometry or issue evidence and cannot be deleted from the metadata register.',409,'PARCEL_RETAINED_EVIDENCE')
    const deleted = await client.query<{id:string;project_id:string;block_id:string|null}>(`DELETE FROM parcels AS p WHERE p.id=$1 AND p.project_id=$2 AND p.updated_at=$3::timestamptz AND COALESCE(p.revision_number,0)=$4
      RETURNING p.id,p.project_id,p.block_id`,[parcelId,current.project_id,body.updated_at,current.revision_number])
    if (deleted.rows.length !== 1 || deleted.rows[0].id !== parcelId || deleted.rows[0].project_id !== current.project_id || deleted.rows[0].block_id !== current.block_id) throw acknowledgement()
    return {deletedId:parcelId,projectId:current.project_id,blockId:current.block_id,revision:current.revision_number}
  })
}
