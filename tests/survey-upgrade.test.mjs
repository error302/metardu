import test from 'node:test'
import assert from 'node:assert/strict'
import {surveyUpgradeTarget} from '../scripts/verify-survey-upgrade.mjs'

const address='postgresql://release_verify:synthetic@127.0.0.1:55433/metardu_runtime_verify'
test('upgrade rehearsal targets only a separate synthetic database in the owned loopback fixture',()=>{
  const result=new URL(surveyUpgradeTarget(address))
  assert.equal(result.pathname,'/metardu_survey_upgrade_verify')
  assert.equal(result.port,'55433')
  for(const url of [address.replace('127.0.0.1','example.com'),address.replace('55433','5432'),address.replace('metardu_runtime_verify','metardu'),address+'?sslmode=disable'])assert.throws(()=>surveyUpgradeTarget(url))
})
