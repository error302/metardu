import { apiHandler } from '@/lib/apiHandler'
import { surfaceExportRequestSchema, type SurfaceExportRequest } from '@/lib/topo/surfaceRequest'
import {authorizedSurfaceExport} from '@/lib/topo/surfaceExportHttp'

export const dynamic = 'force-dynamic'
export const POST = apiHandler({ auth: true, schema: surfaceExportRequestSchema.refine(body=>!body.format,'Use the PDF export route for PDF requests.'), rateLimit: { max: 10, windowMs: 60000 } }, async (_req, ctx) => authorizedSurfaceExport(ctx.body as SurfaceExportRequest, ctx.userId, false, ctx.session?.user?.email ?? undefined))
export const GET = apiHandler({ auth: true, rateLimit: { max: 30, windowMs: 60000 } }, async (req, ctx) => {
  const body = surfaceExportRequestSchema.refine(body=>!body.format).parse(Object.fromEntries(req.nextUrl.searchParams))
  return authorizedSurfaceExport(body, ctx.userId, true, ctx.session?.user?.email ?? undefined)
})
