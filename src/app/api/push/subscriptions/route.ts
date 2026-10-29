import { apiHandler,apiSuccess } from '@/lib/apiHandler'
import { subscriptionSchema,pushConfiguration } from '@/lib/notifications/webPush'
import { savePushSubscription } from '@/lib/notifications/pushSubscriptions'
import { AppError } from '@/lib/api/errors'
export const dynamic='force-dynamic'
export const POST=apiHandler({auth:true,schema:subscriptionSchema,rateLimit:{max:20,windowMs:60000}},async(_req,ctx)=>{
  if(process.env.METARDU_SURVEY_REMINDERS_ENABLED!=='true'||!pushConfiguration())throw new AppError('Phone reminders are not configured on this installation.',503,'PUSH_UNAVAILABLE')
  return apiSuccess(await savePushSubscription(ctx.userId,subscriptionSchema.parse(ctx.body)))
})
