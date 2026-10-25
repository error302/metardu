import { schemeExportHandlers } from '@/lib/scheme/exportRoute'
export const dynamic = 'force-dynamic'
const handlers = schemeExportHandlers('geojson')
export const GET = handlers.GET
export const POST = handlers.POST
