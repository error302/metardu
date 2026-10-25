import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import {
  CreateBlockSchema,
  DeleteBlockSchema,
  UpdateBlockSchema,
} from '@/lib/validation/blockInputs'
import { blockCommandRowSchema } from './blockDirectory'

const columns = `b.id,b.project_id,b.block_number,b.block_name,b.description,b.created_at,
  to_char(b.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,b.xmin::text AS row_version`
type Block = z.infer<typeof blockCommandRowSchema>
const missing = () =>
  new AppError(
    'Block or project not found for this account.',
    404,
    'BLOCK_SCOPE',
  )
const ack = () =>
  new AppError(
    'The exact block change was not acknowledged. The complete change was rolled back.',
    500,
    'BLOCK_ACKNOWLEDGEMENT',
  )
function uuid(value: string) {
  if (!z.string().uuid().safeParse(value).success)
    throw new AppError(
      'A valid account/block UUID is required.',
      400,
      'BLOCK_INPUT',
    )
}
const text = (value: string | null | undefined) =>
  value === undefined ? undefined : value || null
async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
  try {
    return await db.transaction(work)
  } catch (error) {
    const parsed = z.object({ code: z.string() }).safeParse(error)
    if (parsed.success && parsed.data.code === '23505')
      throw new AppError(
        'This block number already exists in the project. No change was saved.',
        409,
        'BLOCK_DUPLICATE',
      )
    if (parsed.success && parsed.data.code === '23503')
      throw new AppError(
        'The block has related records or changed during this operation. No change was saved.',
        409,
        'BLOCK_RETAINED',
      )
    if (parsed.success && parsed.data.code === '42P01')
      throw new AppError(
        'Block retention storage is unavailable. No change was saved.',
        503,
        'BLOCK_UNAVAILABLE',
      )
    throw error
  }
}
async function lockProject(client: PoolClient, actor: string, id: string) {
  const project = (
    await client.query<{ id: string; project_type: string | null }>(
      'SELECT id,project_type FROM projects WHERE id=$1 AND user_id=$2 FOR UPDATE',
      [id, actor],
    )
  ).rows[0]
  if (!project) throw missing()
  return project
}
async function lockBlock(
  client: PoolClient,
  actor: string,
  id: string,
  input: { project_id?: string; updated_at: string; row_version?: string },
) {
  const initial = (
    await client.query<{ project_id: string }>(
      'SELECT project_id FROM blocks WHERE id=$1',
      [id],
    )
  ).rows[0]
  if (!initial || (input.project_id && input.project_id !== initial.project_id))
    throw missing()
  await lockProject(client, actor, initial.project_id)
  const row = (
    await client.query<
      Block & { version_matches: boolean; has_geometry: boolean }
    >(
      `SELECT ${columns},b.geom IS NOT NULL has_geometry,
    b.updated_at=$3::timestamptz AND ($4::text IS NULL OR b.xmin::text=$4) version_matches
    FROM blocks b WHERE b.id=$1 AND b.project_id=$2 FOR UPDATE`,
      [id, initial.project_id, input.updated_at, input.row_version ?? null],
    )
  ).rows[0]
  if (!row) throw missing()
  if (!row.version_matches)
    throw new AppError(
      'This block changed after it was loaded. Refresh and review the current record.',
      409,
      'BLOCK_STALE',
    )
  return row
}
function validate(row: unknown, expected: Record<string, unknown>) {
  const parsed = blockCommandRowSchema.safeParse(row)
  if (!parsed.success) throw ack()
  for (const [field, value] of Object.entries(expected))
    if ((parsed.data as Record<string, unknown>)[field] !== value) throw ack()
  return parsed.data
}
export async function createBlockMetadata(actor: string, input: unknown) {
  uuid(actor)
  const parsed = CreateBlockSchema.safeParse(input)
  if (!parsed.success)
    throw new AppError('The block fields are invalid.', 400, 'BLOCK_INPUT')
  const body = parsed.data
  return transaction(async (client) => {
    const project = await lockProject(client, actor, body.project_id)
    if (project.project_type !== 'scheme')
      throw new AppError(
        'Create blocks in a project configured as a scheme.',
        400,
        'BLOCK_PROJECT_TYPE',
      )
    if (
      (
        await client.query(
          'SELECT id FROM blocks WHERE project_id=$1 AND block_number=$2',
          [body.project_id, body.block_number],
        )
      ).rows.length
    )
      throw new AppError(
        'This block number already exists in the project.',
        409,
        'BLOCK_DUPLICATE',
      )
    const expected = {
      id: randomUUID(),
      project_id: body.project_id,
      block_number: body.block_number,
      block_name: text(body.block_name) ?? null,
      description: text(body.description) ?? null,
    }
    const result = await client.query(
      `INSERT INTO blocks AS b(id,project_id,block_number,block_name,description) VALUES($1,$2,$3,$4,$5) RETURNING ${columns}`,
      [
        expected.id,
        expected.project_id,
        expected.block_number,
        expected.block_name,
        expected.description,
      ],
    )
    if (result.rows.length !== 1) throw ack()
    return validate(result.rows[0], expected)
  })
}
export async function updateBlockMetadata(
  actor: string,
  id: string,
  input: unknown,
) {
  uuid(actor)
  uuid(id)
  const parsed = UpdateBlockSchema.extend({
    updated_at: z.string().datetime({ offset: true }),
  }).safeParse(input)
  if (!parsed.success)
    throw new AppError(
      'Valid block fields and the loaded version are required.',
      400,
      'BLOCK_INPUT',
    )
  const body = parsed.data
  return transaction(async (client) => {
    const current = await lockBlock(client, actor, id, body)
    const changed = {
      block_number: body.block_number,
      block_name: text(body.block_name),
      description: text(body.description),
    }
    const selected = (
      Object.keys(changed) as Array<keyof typeof changed>
    ).filter((field) => changed[field] !== undefined)
    if (!selected.length)
      throw new AppError(
        'No block fields were supplied to change.',
        400,
        'BLOCK_INPUT',
      )
    const values: unknown[] = selected.map((field) => changed[field]),
      offset = values.length
    values.push(id, current.project_id, body.updated_at, current.row_version)
    const result = await client.query<{
      updated_at: string
      row_version: string
    }>(
      `UPDATE blocks AS b SET ${selected.map((field, index) => `"${field}"=$${index + 1}`).join(',')},updated_at=clock_timestamp()
      WHERE b.id=$${offset + 1} AND b.project_id=$${offset + 2} AND b.updated_at=$${offset + 3}::timestamptz AND b.xmin::text=$${offset + 4} RETURNING ${columns}`,
      values,
    )
    if (
      result.rows.length !== 1 ||
      result.rows[0].updated_at === current.updated_at ||
      result.rows[0].row_version === current.row_version
    )
      throw ack()
    return validate(result.rows[0], {
      id,
      project_id: current.project_id,
      block_number: changed.block_number ?? current.block_number,
      block_name:
        changed.block_name === undefined
          ? current.block_name
          : changed.block_name,
      description:
        changed.description === undefined
          ? current.description
          : changed.description,
    })
  })
}
export async function deleteBlockMetadata(
  actor: string,
  id: string,
  input: unknown,
) {
  uuid(actor)
  uuid(id)
  const parsed = DeleteBlockSchema.safeParse(input)
  if (!parsed.success)
    throw new AppError(
      'The loaded block version is required before deletion.',
      400,
      'BLOCK_INPUT',
    )
  const body = parsed.data
  return transaction(async (client) => {
    const current = await lockBlock(client, actor, id, body)
    const related = (
      await client.query<{ retained: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM parcels WHERE block_id=$1)
      OR EXISTS(SELECT 1 FROM block_assignments WHERE block_id=$1)
      OR EXISTS(SELECT 1 FROM scheme_import_receipts WHERE block_id=$1) retained`,
        [id],
      )
    ).rows[0]
    if (!related || typeof related.retained !== 'boolean') throw ack()
    if (current.has_geometry || related.retained)
      throw new AppError(
        'This block retains parcels, assignments, import receipts or geometry. It cannot be deleted from block management.',
        409,
        'BLOCK_RETAINED',
      )
    const result = await client.query<{
      id: string
      project_id: string
      row_version: string
    }>(
      `DELETE FROM blocks AS b WHERE b.id=$1 AND b.project_id=$2 AND b.updated_at=$3::timestamptz AND b.xmin::text=$4
      RETURNING b.id,b.project_id,b.xmin::text row_version`,
      [id, current.project_id, body.updated_at, current.row_version],
    )
    if (
      result.rows.length !== 1 ||
      result.rows[0].id !== id ||
      result.rows[0].project_id !== current.project_id ||
      result.rows[0].row_version !== current.row_version
    )
      throw ack()
    return {
      deletedId: id,
      projectId: current.project_id,
      rowVersion: current.row_version,
    }
  })
}
