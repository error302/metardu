import test from 'node:test'
import assert from 'node:assert/strict'
import {createECDH} from 'node:crypto'
import {assertSurveyPushEnvironment} from '../scripts/survey-push-environment.mjs'
import {assertScheduleUpgradeProof,SCHEDULE_UPGRADE_VERSION} from '../scripts/schedule-upgrade-contract.mjs'
test('push setup preserves existing auth and all unrelated settings',()=>{
 const key=createECDH('prime256v1');key.generateKeys()
 const old={AUTH_SECRET:'preserved',GOOGLE_CLIENT_ID:'preserved-google'}
 const next={...old,VAPID_PUBLIC_KEY:key.getPublicKey().toString('base64url'),VAPID_PRIVATE_KEY:key.getPrivateKey().toString('base64url'),VAPID_SUBJECT:'mailto:hello@metardu.app',METARDU_SURVEY_REMINDERS_ENABLED:'true'}
 const proof=assertSurveyPushEnvironment(old,next)
 assert.equal(proof.enabled,true);assert.equal(proof.VAPID_PRIVATE_KEY,undefined)
 assert.throws(()=>assertSurveyPushEnvironment(old,{...next,AUTH_SECRET:'changed'}))
 assert.throws(()=>assertSurveyPushEnvironment(next,{...next,VAPID_SUBJECT:'mailto:other@example.invalid'}))
 assert.throws(()=>assertSurveyPushEnvironment(old,{...next,VAPID_PRIVATE_KEY:'invalid'}))
 assert.deepEqual(assertSurveyPushEnvironment(next,next),{changed:false})
})
test('schedule admission requires exact native 128-to-129 evidence and cleanup',()=>{
 const sourceRegistry=Array.from({length:129},(_,i)=>({version:String(i),checksum:'a'.repeat(64)})),pending=[SCHEDULE_UPGRADE_VERSION]
 const proof={sourceBaseline:128,targetLedgerCount:129,pending,sourceRegistry,variants:['canonical','existing_schedule_table'],productionMutated:false,cleanup:{syntheticRoleRemoved:true},checks:Array.from({length:15},()=>({passed:true}))}
 for(const name of ['originalValuesPreserved','historicalHashesPreserved','normalRuntimeProvisioning','restrictedRoleVerified','scheduleLifecycleVerified','reminderDeliveryVerified','incompatibleDataRejected'])proof[name]=true
 assertScheduleUpgradeProof(proof,{sourceRegistry,pending})
 assert.throws(()=>assertScheduleUpgradeProof({...proof,sourceBaseline:119},{sourceRegistry,pending}))
 assert.throws(()=>assertScheduleUpgradeProof({...proof,cleanup:{}},{sourceRegistry,pending}))
 assert.throws(()=>assertScheduleUpgradeProof({...proof,sourceRegistry:sourceRegistry.slice(1)},{sourceRegistry,pending}))
})
