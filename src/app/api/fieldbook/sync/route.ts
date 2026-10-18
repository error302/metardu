import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api/handler'
import { offlineObservationSchema } from '@/lib/field/observationCapture'
import { recordOfflineObservation } from '@/lib/field/observationCaptureServer'

export const dynamic='force-dynamic'
export const POST=apiHandler({
  requireAuth:true,schema:offlineObservationSchema,
  rateLimit:{max:120,windowMs:60000},
  handler:async ctx=>{
    const receipt=await recordOfflineObservation(ctx.userId,ctx.input)
    return NextResponse.json(receipt,{status:receipt.replayed?200:201,headers:{'Cache-Control':'private, no-store'}})
  },
})
