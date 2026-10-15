import test from 'node:test'
import assert from 'node:assert/strict'
import {assertLiveSurveyRelease} from '../scripts/verify-live-survey-release.mjs'

test('live probes require the exact promoted image and a production receipt',()=>{
  const sha='eac2835e377f59dd0d1b1ff98cb3fbc311401f22'
  const receipt={revision:sha,status:'promoted',candidateImage:'sha256:test'}
  const app={Name:'/metardu-app',Image:receipt.candidateImage,Config:{Env:[`METARDU_BUILD_SHA=${sha}`]}}
  assertLiveSurveyRelease(receipt,app,sha)
  for(const change of [{revision:'HEAD'},{status:'built'},{candidateImage:'sha256:other'}])assert.throws(()=>assertLiveSurveyRelease({...receipt,...change},app,sha))
  for(const change of [{Name:'/another-app'},{Config:{Env:[]}}])assert.throws(()=>assertLiveSurveyRelease(receipt,{...app,...change},sha))
})
