import test from 'node:test'
import assert from 'node:assert/strict'
import {availabilityVerdict} from '../scripts/availability-contract.mjs'
const revision='b'.repeat(40),good={status:200,healthStatus:'healthy',releaseId:revision}
const baseline=()=>({revision,origin:good,publicHealth:good,routes:['/','/login','/dashboard','/equipment','/admin'].map(path=>({path,status:['/','/login'].includes(path)?200:307,location:'https://metardu.space/login?next='+encodeURIComponent(path)})),power:{required:true,lineStatus:1,activeSleepSeconds:0}})
test('healthy origin and exact public identity plus awake host pass observation, never prove continuous uptime',()=>assert.deepEqual(availabilityVerdict(baseline()),{passed:true,reasons:[],observationOnly:true,continuousUptimeProven:false}))
test('a sleeping battery host fails even when public and origin return healthy',()=>{const input=baseline();input.power={required:true,lineStatus:0,activeSleepSeconds:180};assert.ok(availabilityVerdict(input).reasons.includes('host-idle-sleep-enabled'))})
test('unknown power fails closed rather than treating unknown as mains',()=>{const input=baseline();input.power={required:true,lineStatus:255,activeSleepSeconds:0};assert.ok(availabilityVerdict(input).reasons.includes('host-power-unverified'))})
test('origin success cannot mask a public timeout or HTML gateway response',()=>{for(const status of [null,502,530]){const input=baseline();input.publicHealth={status};assert.ok(availabilityVerdict(input).reasons.includes('public-health-unverified'))}})
test('a healthy wrong or unknown deployed identity fails',()=>{const input=baseline();input.publicHealth={...good,releaseId:'unknown'};assert.ok(availabilityVerdict(input).reasons.includes('public-release-mismatch'))})
test('missing routes and a redirect to a foreign sign-in site fail',()=>{const input=baseline();input.routes=input.routes.slice(1);input.routes.at(-1).location='https://example.invalid/login?next=%2Fadmin';const result=availabilityVerdict(input);assert.ok(result.reasons.includes('entry-route-unverified:/'));assert.ok(result.reasons.includes('entry-redirect-mismatch:/admin'))})
