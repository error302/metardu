import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { endpointHash,subscriptionSchema } from './webPush'
import type { z } from 'zod'
export async function savePushSubscription(userId:string,subscription:z.infer<typeof subscriptionSchema>) {
  const hash=endpointHash(subscription.endpoint)
  return db.transaction(async client=>{
    await client.query<{pg_advisory_xact_lock:unknown}>('SELECT pg_advisory_xact_lock(hashtext($1))',['push:'+userId])
    const existing=await client.query<{id:string;active:boolean}>('SELECT id,active FROM public.survey_push_subscriptions WHERE user_id=$1 AND endpoint_hash=$2',[userId,hash])
    const count=await client.query<{count:number}>('SELECT COUNT(*)::int AS count FROM public.survey_push_subscriptions WHERE user_id=$1 AND active=TRUE',[userId])
    if(!existing.rows[0]?.active && count.rows[0].count>=5)throw new AppError('Five devices are already enabled. Disable an unused device first.',409,'DEVICE_LIMIT')
    const result=await client.query<{id:string}>(
      `INSERT INTO public.survey_push_subscriptions(user_id,endpoint_hash,endpoint,p256dh,auth_key)
       VALUES($1,$2,$3,$4,$5) ON CONFLICT(endpoint_hash) DO UPDATE
       SET p256dh=EXCLUDED.p256dh,auth_key=EXCLUDED.auth_key,active=TRUE,updated_at=NOW()
       WHERE survey_push_subscriptions.user_id=$1 RETURNING id`,
      [userId,hash,subscription.endpoint,subscription.keys.p256dh,subscription.keys.auth],
    )
    if(!result.rows[0])throw new AppError('This device could not be enabled. Reconnect notifications from this browser.',409,'DEVICE_CONFLICT')
    return {enabled:true}
  })
}
export async function getPushDevice(userId:string,hash:string) {
  const result=await db.query<{active:boolean;last_accepted_at:Date|null}>(
    'SELECT active,last_accepted_at FROM public.survey_push_subscriptions WHERE user_id=$1 AND endpoint_hash=$2',[userId,hash],
  )
  return {enabled:result.rows[0]?.active===true,lastAcceptedAt:result.rows[0]?.last_accepted_at?.toISOString()??null}
}
export async function disablePushDevice(userId:string,hash:string) {
  await db.query<never>('UPDATE public.survey_push_subscriptions SET active=FALSE,updated_at=NOW() WHERE user_id=$1 AND endpoint_hash=$2',[userId,hash])
  return {enabled:false}
}
