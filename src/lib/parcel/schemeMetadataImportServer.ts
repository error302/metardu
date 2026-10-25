import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
import { MAX_SCHEME_IMPORT_BYTES, prepareSchemeMetadataCsv, schemeImportReceiptSchema, SCHEME_IMPORT_PROTOCOL, SchemeCsvError, type SchemeMetadataRow } from './schemeMetadataImport'

const identitySchema = z.object({ actorId: z.string().uuid(), requestId: z.string().uuid(), projectId: z.string().uuid(), blockId: z.string().uuid(), fileName: z.string().min(1).max(255) })
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
interface ExistingParcel extends Omit<SchemeMetadataRow, 'area_ha'> { id: string; project_id: string; area_ha: number | string | null }
interface StoredReceipt { input_hash: string; source_hash: string; receipt: unknown; source_bytes: Buffer }
interface ReceiptAcknowledgement extends StoredReceipt { actor_id: string; request_id: string; project_id: string; block_id: string; protocol: string; source_name: string }

export async function commitSchemeMetadataImport(input: z.infer<typeof identitySchema>, bytes: Uint8Array) {
  const parsed = identitySchema.safeParse(input)
  if (!parsed.success) throw new AppError('Valid project, block and request UUIDs and a file name are required.', 400, 'SCHEME_IMPORT_IDENTITY')
  const identity = parsed.data
  if (!bytes.byteLength || bytes.byteLength > MAX_SCHEME_IMPORT_BYTES) throw new AppError('Choose a nonempty CSV of at most 4 MiB.', 413, 'SCHEME_IMPORT_SIZE')
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { throw new AppError('The CSV must be valid UTF-8.', 400, 'SCHEME_IMPORT_ENCODING') }
  const sourceHash = hash(bytes), inputHash = hash(JSON.stringify({ protocol: SCHEME_IMPORT_PROTOCOL, ...identity, sourceHash }))
  return db.transaction(async client => {
    const project = (await client.query<{ user_id: string | null }>('SELECT user_id FROM projects WHERE id=$1 FOR UPDATE', [identity.projectId])).rows[0]
    if (project?.user_id !== identity.actorId) throw new AppError('Project or block not found for this account.', 404, 'SCHEME_IMPORT_PROJECT')
    const block = (await client.query<{ id: string }>('SELECT id FROM blocks WHERE id=$1 AND project_id=$2 FOR UPDATE', [identity.blockId, identity.projectId])).rows[0]
    if (!block) throw new AppError('Project or block not found for this account.', 404, 'SCHEME_IMPORT_BLOCK')
    const previous = (await client.query<StoredReceipt>('SELECT input_hash,source_hash,source_bytes,receipt FROM scheme_import_receipts WHERE actor_id=$1 AND request_id=$2', [identity.actorId, identity.requestId])).rows[0]
    if (previous) {
      if (previous.input_hash !== inputHash || previous.source_hash !== sourceHash || !Buffer.from(bytes).equals(previous.source_bytes)) throw new AppError('This request belongs to a different import. Select and review a new file.', 409, 'SCHEME_IMPORT_CONFLICT')
      const receipt = schemeImportReceiptSchema.safeParse(previous.receipt)
      if (!receipt.success || receipt.data.requestId !== identity.requestId || receipt.data.projectId !== identity.projectId || receipt.data.blockId !== identity.blockId || receipt.data.sourceFileHash !== sourceHash || receipt.data.sourceFileName !== identity.fileName) throw new AppError('The retained import receipt is inconsistent. No parcel was changed.', 409, 'SCHEME_IMPORT_RECEIPT')
      // A historical acknowledgement, not an assertion that later edits match the imported metadata.
      return { ...receipt.data, replayed: true }
    }
    let rows: SchemeMetadataRow[]
    try { rows = prepareSchemeMetadataCsv(text) } catch (error) {
      if (error instanceof SchemeCsvError) throw new AppError(error.message, error.statusCode, 'SCHEME_IMPORT_CSV')
      throw error
    }
    const existing = (await client.query<ExistingParcel>('SELECT id,project_id,parcel_number,lr_number_proposed,area_ha,notes FROM parcels WHERE block_id=$1 AND parcel_number=ANY($2::text[]) FOR UPDATE', [identity.blockId, rows.map(row => row.parcel_number)])).rows
    const byName = new Map<string, ExistingParcel>()
    for (const parcel of existing) {
      if (byName.has(parcel.parcel_number) || parcel.project_id !== identity.projectId) throw new AppError('The block register has inconsistent parcel identities. No parcel was imported.', 409, 'SCHEME_IMPORT_REGISTER')
      byName.set(parcel.parcel_number, parcel)
    }
    const created: Array<SchemeMetadataRow & { id: string }> = [], retained: Array<{ id: string; parcel_number: string }> = []
    for (const row of rows) {
      const found = byName.get(row.parcel_number)
      if (!found) { created.push({ ...row, id: randomUUID() }); continue }
      if (found.lr_number_proposed !== row.lr_number_proposed || (found.area_ha === null ? null : Number(found.area_ha)) !== row.area_ha || found.notes !== row.notes) throw new AppError(`Parcel ${row.parcel_number} already has different metadata. No parcels were imported; review the existing record.`, 409, 'SCHEME_IMPORT_DUPLICATE')
      retained.push({ id: found.id, parcel_number: found.parcel_number })
    }
    for (let offset = 0; offset < created.length; offset += 500) {
      const chunk = created.slice(offset, offset + 500)
      const saved = await client.query<ExistingParcel & { block_id: string; status: string }>(`INSERT INTO parcels(id,project_id,block_id,parcel_number,lr_number_proposed,area_ha,status,notes)
        SELECT row.id,$1,$2,row.parcel_number,row.lr_number_proposed,row.area_ha,'pending',row.notes
        FROM jsonb_to_recordset($3::jsonb) AS row(id uuid,parcel_number text,lr_number_proposed text,area_ha numeric,notes text)
        RETURNING id,project_id,block_id,parcel_number,lr_number_proposed,area_ha,status,notes`, [identity.projectId, identity.blockId, JSON.stringify(chunk)])
      const expected = new Map(chunk.map(row => [row.id, row]))
      if (saved.rows.length !== chunk.length || new Set(saved.rows.map(row => row.id)).size !== chunk.length || saved.rows.some(row => {
        const wanted = expected.get(row.id)
        return !wanted || row.project_id !== identity.projectId || row.block_id !== identity.blockId || row.status !== 'pending' || row.parcel_number !== wanted.parcel_number || row.lr_number_proposed !== wanted.lr_number_proposed || row.notes !== wanted.notes || (row.area_ha === null ? null : Number(row.area_ha)) !== wanted.area_ha
      })) throw new AppError('The database did not acknowledge every parcel exactly. The complete import was rolled back.', 500, 'SCHEME_IMPORT_ACKNOWLEDGEMENT')
    }
    const receipt = schemeImportReceiptSchema.parse({ protocol: SCHEME_IMPORT_PROTOCOL, requestId: identity.requestId, projectId: identity.projectId, blockId: identity.blockId, sourceFileHash: sourceHash, sourceFileName: identity.fileName, total_rows: rows.length, created: created.length, unchanged: retained.length, skipped: retained.length, errors: [], fieldVerified: false, replayed: false })
    const retainedReceipt = { ...receipt, parcels: [...created.map(row => ({ id: row.id, parcel_number: row.parcel_number })), ...retained] }
    const record = await client.query<ReceiptAcknowledgement>(`INSERT INTO scheme_import_receipts(actor_id,request_id,project_id,block_id,protocol,input_hash,source_hash,source_name,source_bytes,receipt)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING *`, [identity.actorId,identity.requestId,identity.projectId,identity.blockId,SCHEME_IMPORT_PROTOCOL,inputHash,sourceHash,identity.fileName,Buffer.from(bytes),JSON.stringify(retainedReceipt)])
    const acknowledged = record.rows[0]
    if (record.rows.length !== 1 || !acknowledged || acknowledged.actor_id !== identity.actorId || acknowledged.request_id !== identity.requestId || acknowledged.project_id !== identity.projectId || acknowledged.block_id !== identity.blockId || acknowledged.protocol !== SCHEME_IMPORT_PROTOCOL || acknowledged.input_hash !== inputHash || acknowledged.source_hash !== sourceHash || acknowledged.source_name !== identity.fileName || !Buffer.from(bytes).equals(acknowledged.source_bytes) || canonicalJson(acknowledged.receipt) !== canonicalJson(retainedReceipt)) throw new AppError('The exact import receipt was not acknowledged. The complete import was rolled back.', 500, 'SCHEME_IMPORT_ACKNOWLEDGEMENT')
    return receipt
  })
}
