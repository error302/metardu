import { z } from 'zod'
import { readBytesBounded, readTextBounded } from '@/lib/security/requestBody'
import {
  SCHEME_EXPORT_BYTES,
  schemeExportCancellationSchema,
  schemeExportSourceRevision,
} from './exportContract'
import { schemePendingHash, type PendingSchemeExport } from './exportPending'
const hash = z.string().regex(/^[a-f0-9]{64}$/),
  uuid = z.string().guid()
export async function readSchemeExportJson(
  response: Response,
): Promise<unknown> {
  let value: unknown
  if (response.body) {
    const text = await readTextBounded(response.body, SCHEME_EXPORT_BYTES)
    if (text === null)
      throw new Error('The export response is invalid or exceeds 4 MiB.')
    try {
      value = JSON.parse(text) as unknown
    } catch {
      throw new Error('The server did not return a valid export response.')
    }
  } else {
    value = (await response.json()) as unknown
    if (
      new TextEncoder().encode(JSON.stringify(value)).length >
      SCHEME_EXPORT_BYTES
    )
      throw new Error('The export response exceeds 4 MiB.')
  }
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(value)
    throw new Error(
      error.success
        ? error.data.error
        : `Export request failed (HTTP ${response.status}).`,
    )
  }
  return value
}
export async function readSchemeExportReply(
  response: Response,
  pending: PendingSchemeExport,
) {
  if (!response.ok) {
    await readSchemeExportJson(response)
    throw new Error('The export request failed.')
  }
  const requestHash = await schemePendingHash(pending),
    headers = response.headers
  if (
    headers.get('X-Metardu-Request') !== pending.body.requestId ||
    headers.get('X-Metardu-Request-Hash') !== requestHash
  )
    throw new Error(
      'The reply does not acknowledge this exact retained request.',
    )
  const type = headers.get('content-type')?.split(';')[0].trim()
  if (type === 'application/json') {
    const result = z
      .object({ data: schemeExportCancellationSchema })
      .strict()
      .parse(await readSchemeExportJson(response)).data
    if (
      result.actorId !== pending.body.expectedUserId ||
      result.projectId !== pending.body.projectId ||
      result.requestId !== pending.body.requestId ||
      result.requestHash !== requestHash ||
      result.sourceHash !== pending.body.sourceHash ||
      result.format !== pending.format
    )
      throw new Error('The cancellation does not match the retained request.')
    return result
  }
  const expectedType =
      pending.format === 'dxf' ? 'application/dxf' : 'application/geo+json',
    filename = `boundary-drafts-${pending.body.requestId}.${pending.format}`
  const contentHash = hash.parse(headers.get('X-Metardu-Content-SHA256')),
    deliverableId = uuid.parse(headers.get('X-Metardu-Deliverable')),
    revisionId = uuid.parse(headers.get('X-Metardu-Deliverable-Revision-ID')),
    revisionText = headers.get('X-Metardu-Deliverable-Revision') ?? ''
  const sourceCrs = headers.get('X-Metardu-Source-CRS') ?? '',
    outputCrs = headers.get('X-Metardu-Output-CRS') ?? ''
  if (
    type !== expectedType ||
    headers.get('content-disposition') !==
      `attachment; filename="${filename}"` ||
    headers.get('X-Metardu-Source-Hash') !== pending.body.sourceHash ||
    headers.get('X-Metardu-Source-Revision') !==
      schemeExportSourceRevision(pending.body.sourceHash) ||
    !/^[1-9][0-9]{0,8}$/.test(revisionText) ||
    !/^EPSG:[0-9]{1,6}$/.test(sourceCrs) ||
    ['EPSG:3857', 'EPSG:4326'].includes(sourceCrs) ||
    outputCrs !== (pending.format === 'dxf' ? sourceCrs : 'EPSG:4326')
  )
    throw new Error(
      'The artifact metadata does not match this request and output format.',
    )
  if (!response.body)
    throw new Error('The artifact response has no readable byte stream.')
  const bytes = await readBytesBounded(response.body, SCHEME_EXPORT_BYTES)
  if (!bytes || bytes.length === 0)
    throw new Error('The artifact is empty or exceeds 4 MiB.')
  const actual = [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)),
    ),
  ]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
  if (actual !== contentHash)
    throw new Error(
      'The downloaded bytes do not match the registered content hash.',
    )
  return {
    outcome: 'committed' as const,
    bytes,
    filename,
    contentHash,
    deliverableId,
    revisionId,
    revision: Number(revisionText),
    sourceCrs,
    outputCrs,
  }
}
