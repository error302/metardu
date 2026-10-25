import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { AppError } from '@/lib/api/errors'
import { readTextBounded } from '@/lib/security/requestBody'
import {
  schemeExportRequestSchema,
  type SchemeExportFormat,
} from './exportContract'
import { executeSchemeExport } from './exportCommands'
function response(
  packet: Awaited<ReturnType<typeof executeSchemeExport>>,
  format: SchemeExportFormat,
) {
  if (!('bytes' in packet))
    return NextResponse.json(
      { data: packet },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          'X-Metardu-Request': packet.requestId,
          'X-Metardu-Request-Hash': packet.requestHash,
        },
      },
    )
  return new NextResponse(new Uint8Array(packet.bytes), {
    headers: {
      'Content-Type':
        format === 'dxf' ? 'application/dxf' : 'application/geo+json',
      'Content-Disposition': `attachment; filename="${packet.filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Metardu-Deliverable': packet.deliverableId,
      'X-Metardu-Deliverable-Revision': String(packet.revision),
      'X-Metardu-Deliverable-Revision-ID': packet.revisionId,
      'X-Metardu-Request': packet.requestId,
      'X-Metardu-Request-Hash': packet.requestHash,
      'X-Metardu-Source-Hash': packet.sourceHash,
      'X-Metardu-Source-Revision': packet.sourceRevision,
      'X-Metardu-Source-CRS': packet.sourceCrs,
      'X-Metardu-Output-CRS': packet.outputCrs,
      'X-Metardu-Content-SHA256': packet.contentHash,
      'X-Metardu-Replayed': String(packet.replayed),
      'X-Metardu-Download': `/api/storage?path=${encodeURIComponent(packet.storagePath)}`,
    },
  })
}
export function schemeExportHandlers(format: SchemeExportFormat) {
  const GET = apiHandler(
    { auth: true, rateLimit: { max: 30, windowMs: 60000 } },
    async (request, ctx) => {
      const params = new URL(request.url).searchParams
      if (
        params.getAll('project_id').length !== 1 ||
        params.getAll('request_id').length !== 1 ||
        [...params.keys()].some(
          (key) => !['project_id', 'request_id'].includes(key),
        )
      )
        return NextResponse.json(
          {
            error:
              'Recover a registered export with its project_id and request_id. New exports require explicit reviewed selection through POST.',
          },
          { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
        )
      return response(
        await executeSchemeExport(
          ctx.userId,
          params.get('project_id') ?? '',
          params.get('request_id') ?? '',
          format,
        ),
        format,
      )
    },
  )
  const POST = apiHandler(
    { auth: true, rawBody: true, rateLimit: { max: 10, windowMs: 60000 } },
    async (request, ctx) => {
      const query = new URL(request.url).searchParams
      if (
        query.getAll('action').length > 1 ||
        [...query.keys()].some((key) => key !== 'action') ||
        (query.has('action') && query.get('action') !== 'cancel')
      )
        throw new AppError(
          'Choose a new export or action=cancel for the exact retained command.',
          400,
        )
      const text = await readTextBounded(request.body, 8192)
      if (text === null)
        throw new AppError(
          'The export command must be valid UTF-8 and at most 8 KiB.',
          413,
        )
      let value: unknown
      try {
        value = JSON.parse(text) as unknown
      } catch {
        throw new AppError('A JSON export command is required.', 400)
      }
      const parsed = schemeExportRequestSchema.safeParse(value)
      if (!parsed.success)
        throw new AppError(
          'Choose an exact reviewed parcel selection, account, source hash and request UUID.',
          400,
        )
      const body = parsed.data
      return response(
        await executeSchemeExport(
          ctx.userId,
          body.projectId,
          body.requestId,
          format,
          body,
          query.get('action') === 'cancel',
        ),
        format,
      )
    },
  )
  return { GET, POST }
}
