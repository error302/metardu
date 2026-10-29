import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { privateApiSuccess as apiSuccess } from '@/lib/api/privateResponse'
import { disablePushDevice } from '@/lib/notifications/pushSubscriptions'
const input=z.object({endpoint_hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict()
export const dynamic='force-dynamic'
export const POST=apiHandler({auth:true,schema:input,rateLimit:{max:30,windowMs:60000}},async(_req,ctx)=>{
  return apiSuccess(await disablePushDevice(ctx.userId,input.parse(ctx.body).endpoint_hash))
})
