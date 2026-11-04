import { NextResponse } from 'next/server'
import {executeSurfaceExport} from './surfaceExport'
import type {SurfaceExportRequest} from './surfaceRequest'
import {requireProjectOwnership} from '@/lib/auth/ownership'

const response = (result: Awaited<ReturnType<typeof executeSurfaceExport>>, body: SurfaceExportRequest) => new NextResponse(new Uint8Array(result.bytes), { headers: {
  'Content-Type': body.format==='pdf'?'application/pdf':'application/dxf', 'Content-Disposition': `attachment; filename="${result.filename}"`, 'Cache-Control': 'private, no-store',
  'X-Metardu-Deliverable': result.deliverableId, 'X-Metardu-Deliverable-Revision': String(result.revision),
  'X-Metardu-Surface-Revision': body.surfaceRevisionId, 'X-Metardu-Content-SHA256': result.contentHash,
  'X-Metardu-Request': body.requestId, 'X-Metardu-Request-Hash': result.requestHash, 'X-Metardu-Replayed': String(result.replayed),
  'X-Metardu-Download': `/api/storage?path=${encodeURIComponent(result.storagePath)}`,
} })
export async function authorizedSurfaceExport(body: SurfaceExportRequest, userId: string, recoverOnly: boolean, authenticatedEmail?: string) {
  const access = await requireProjectOwnership(body.projectId, userId)
  if (!access.ok) {
    if (!access.error) throw new Error('Project ownership check failed without a response.')
    return access.error
  }
  return response(await executeSurfaceExport(body, userId, recoverOnly, authenticatedEmail), body)
}
