import assert from 'node:assert/strict'
import { createECDH,createHash } from 'node:crypto'
const pushKeys=new Set(['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT','METARDU_SURVEY_REMINDERS_ENABLED'])
/** The reviewed first-time push setup is the sole exception to preserved runtime settings. */
export function assertSurveyPushEnvironment(old,next){
 for(const key of new Set([...Object.keys(old),...Object.keys(next)])){
  if(key==='METARDU_BUILD_SHA'||!Object.hasOwn(next,key))continue
  if(!pushKeys.has(key))assert.equal(String(next[key]??''),String(old[key]??''),'Review runtime setting before changing it: '+key)
 }
 const changed=[...pushKeys].filter(key=>String(old[key]??'')!==String(next[key]??''))
 if(!changed.length)return {changed:false}
 for(const key of pushKeys)assert.ok(!old[key]||(key==='METARDU_SURVEY_REMINDERS_ENABLED'&&old[key]==='false'),'Existing push configuration requires a separate rotation review')
 assert.equal(next.METARDU_SURVEY_REMINDERS_ENABLED,'true')
 assert.match(next.VAPID_PUBLIC_KEY??'',/^[A-Za-z0-9_-]+$/)
 assert.match(next.VAPID_PRIVATE_KEY??'',/^[A-Za-z0-9_-]+$/)
 assert.match(next.VAPID_SUBJECT??'',/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/)
 const key=createECDH('prime256v1');key.setPrivateKey(Buffer.from(next.VAPID_PRIVATE_KEY,'base64url'))
 assert.ok(key.getPublicKey().equals(Buffer.from(next.VAPID_PUBLIC_KEY,'base64url')),'Push key pair does not match')
 return {changed:true,enabled:true,publicKeySha256:createHash('sha256').update(next.VAPID_PUBLIC_KEY).digest('hex'),subject:next.VAPID_SUBJECT}
}
