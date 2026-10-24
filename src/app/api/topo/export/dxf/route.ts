import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { surfaceExportRequestSchema, type SurfaceExportRequest } from '@/lib/topo/surfaceRequest'
import { executeSurfaceExport } from '@/lib/topo/surfaceExport'
import { requireProjectOwnership } from '@/lib/auth/ownership'

export const dynamic = 'force-dynamic'
const response = (result: Awaited<ReturnType<typeof executeSurfaceExport>>, body: SurfaceExportRequest) => new NextResponse(new Uint8Array(result.bytes), { headers: {
  'Content-Type': 'application/dxf', 'Content-Disposition': `attachment; filename="${result.filename}"`, 'Cache-Control': 'private, no-store',
  'X-Metardu-Deliverable': result.deliverableId, 'X-Metardu-Deliverable-Revision': String(result.revision),
  'X-Metardu-Surface-Revision': body.surfaceRevisionId, 'X-Metardu-Content-SHA256': result.contentHash,
  'X-Metardu-Request': body.requestId, 'X-Metardu-Request-Hash': result.requestHash, 'X-Metardu-Replayed': String(result.replayed),
  'X-Metardu-Download': `/api/storage?path=${encodeURIComponent(result.storagePath)}`,
} })
async function authorized(body: SurfaceExportRequest, userId: string, recoverOnly: boolean) {
  const access = await requireProjectOwnership(body.projectId, userId)
  if (!access.ok) {
    if (!access.error) throw new Error('Project ownership check failed without a response.')
    return access.error
  }
  return response(await executeSurfaceExport(body, userId, recoverOnly), body)
}
export const POST = apiHandler({ auth: true, schema: surfaceExportRequestSchema, rateLimit: { max: 10, windowMs: 60000 } }, async (_req, ctx) => authorized(ctx.body as SurfaceExportRequest, ctx.userId, false))
export const GET = apiHandler({ auth: true, rateLimit: { max: 30, windowMs: 60000 } }, async (req, ctx) => {
  const body = surfaceExportRequestSchema.parse(Object.fromEntries(req.nextUrl.searchParams))
  return authorized(body, ctx.userId, true)
})
