import { surveyReminderRuntimeStatus } from '@/lib/notifications/surveyReminderRunner'
import { apiHandler } from '@/lib/apiHandler'
import { privateApiSuccess as apiSuccess } from '@/lib/api/privateResponse'
import { pushConfiguration } from '@/lib/notifications/webPush'
export const dynamic='force-dynamic'
export const GET=apiHandler({auth:true,rateLimit:{max:60,windowMs:60000}},async()=>{
  const config=pushConfiguration()
  return apiSuccess({available:process.env.METARDU_SURVEY_REMINDERS_ENABLED==='true'&&Boolean(config),publicKey:config?.publicKey??null,runner:surveyReminderRuntimeStatus()})
})
