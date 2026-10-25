import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { AppError } from '@/lib/api/errors'
import { readBytesBounded } from '@/lib/security/requestBody'
import { MAX_SCHEME_IMPORT_BYTES } from '@/lib/parcel/schemeMetadataImport'
import { commitSchemeMetadataImport } from '@/lib/parcel/schemeMetadataImportServer'

export const dynamic = 'force-dynamic'
const MAX_REQUEST_BYTES = MAX_SCHEME_IMPORT_BYTES + 64 * 1024
const fieldsSchema = z.object({ project_id: z.string().uuid(), block_id: z.string().uuid(), request_id: z.string().uuid() })

export const POST = apiHandler({
  auth: true, rawBody: true, audit: 'csv_import', rateLimit: { max: 20, windowMs: 60000 },
  auditChain: { entityType: 'parcel', action: 'import', reason: 'Retained parcel metadata CSV import' },
}, async (req, ctx) => {
  const contentType = req.headers.get('content-type') ?? ''
  if (!/^multipart\/form-data\s*;/i.test(contentType)) throw new AppError('Choose a CSV file using the import form.', 400, 'SCHEME_IMPORT_FORM')
  const declaredLength = req.headers.get('content-length')
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_REQUEST_BYTES)) throw new AppError('The import request exceeds 4 MiB plus form metadata.', 413, 'SCHEME_IMPORT_SIZE')
  const body = await readBytesBounded(req.body, MAX_REQUEST_BYTES)
  if (body === null) throw new AppError('The import request exceeds 4 MiB plus form metadata.', 413, 'SCHEME_IMPORT_SIZE')
  let form: FormData
  try { form = await new Response(Uint8Array.from(body), { headers: { 'content-type': contentType } }).formData() }
  catch { throw new AppError('The import form could not be read. Choose the CSV again.', 400, 'SCHEME_IMPORT_FORM') }
  if (['project_id','block_id','request_id','file'].some(key => form.getAll(key).length !== 1)) throw new AppError('A single project, block, request and CSV file are required.', 400, 'SCHEME_IMPORT_FORM')
  const fields = fieldsSchema.safeParse({ project_id: form.get('project_id'), block_id: form.get('block_id'), request_id: form.get('request_id') })
  if (!fields.success) throw new AppError('Valid project, block and request UUIDs are required.', 400, 'SCHEME_IMPORT_IDENTITY')
  const file = form.get('file')
  if (!file || typeof file === 'string') throw new AppError('A CSV file is required.', 400, 'SCHEME_IMPORT_FILE')
  if (!file.size || file.size > MAX_SCHEME_IMPORT_BYTES) throw new AppError('Choose a nonempty CSV of at most 4 MiB.', 413, 'SCHEME_IMPORT_SIZE')
  try {
    const receipt = await commitSchemeMetadataImport({ actorId: ctx.userId, requestId: fields.data.request_id, projectId: fields.data.project_id, blockId: fields.data.block_id, fileName: file.name }, new Uint8Array(await file.arrayBuffer()))
    return NextResponse.json({ data: receipt }, { status: receipt.replayed ? 200 : 201, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const databaseError = z.object({ code: z.string() }).safeParse(error)
    if (databaseError.success && databaseError.data.code === '42P01') throw new AppError('Parcel intake is temporarily unavailable. No parcels were imported.', 503, 'SCHEME_IMPORT_UNAVAILABLE')
    if (databaseError.success && databaseError.data.code === '23505') throw new AppError('Another write already uses this parcel number or request. No parcels were imported; retry to recover a committed receipt.', 409, 'SCHEME_IMPORT_CONFLICT')
    throw error
  }
})
