import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,copyFileSync,mkdirSync,statSync} from 'node:fs'
import path from 'node:path'

assert.equal(process.argv.length,2)
const root='.cache/mobile-large-job',target='test-results/mobile-large-job'
const read=name=>JSON.parse(readFileSync(`${root}/${name}`,'utf8'))
const tests=read('final-tests.json'),native=read('native-storage.json'),checks=read('source-checks.json')
const red=read('red.json'),connectionRed=read('connection-red.json'),readRed=read('read-error-red.json')
assert.equal(tests.numFailedTests,0);assert.equal(tests.numPassedTests,123);assert.equal(tests.numPassedTestSuites,15)
assert.equal(native.numFailedTests,0);assert.equal(native.numPassedTests,14)
assert.equal(red.numFailedTests,6);assert.equal(connectionRed.numFailedTests,1);assert.equal(readRed.numFailedTests,2)
for(const key of ['strictAppTypes','strictTestTypes','scopedEslint','trackedWhitespace'])assert.equal(checks[key],'passed')
const files=['src/lib/mobile/offlineStorage.ts','src/lib/mobile/syncService.ts','src/lib/mobile/legacyReview.ts','src/lib/mobile/observationCapture.ts',
  'src/lib/field/observationReceipt.ts','src/lib/field/deliveryRetry.ts','src/lib/api-client/client.ts','src/app/mobile/field/page.tsx',
  'src/app/mobile/field/page.test.tsx','src/components/fieldbook/FieldBookMobile.tsx','src/lib/mobile/__tests__/largeJobStorage.test.ts']
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex')
for(const file of files)assert.ok(statSync(file).mtimeMs<=tests.startTime,`Source changed after the test run started: ${file}`)
const source=Object.fromEntries(files.map(file=>[file,hash(file)]))
assert.equal(path.dirname(path.resolve(target)),path.resolve('test-results'));mkdirSync(target,{recursive:true})
const names=['final-tests.json','native-storage.json','red.json','connection-red.json','read-error-red.json','source-checks.json']
for(const name of names)copyFileSync(`${root}/${name}`,`${target}/${name}`)
const receipt={status:'verified_source_checkpoint',capturedAt:new Date().toISOString(),sourceSnapshot:'Captured after observed checks; not a release attestation',source,
  focusedTests:{suites:15,passed:123,failed:0},emulatedIndexedDbCases:14,transactionEngine:'Existing fake-indexeddb 6.2.6 in isolated Node test factories',
  sourceChecks:checks,databaseCompatibility:{version:1,stores:['field_observations','photos','projects_offline','survey_points','sync_queue'],sqlMigrationRequired:false,deviceSchemaMigration:false},
  verifiedBounds:{resetWritesPerManualPass:20,observationReadBatch:50,collectorRecentRecords:10},
  dataFixtures:{observations:154,photos:96,queueRecords:1000},productionChanged:false,productionPromotion:false,entitlementChanged:false,
  browserProof:false,physicalDeviceProof:false,fieldProof:false,providerProof:false,
  browserObservation:'Chrome 3 navigation timed out; owned tab 41719380 was inspected and remained about:blank. No browser storage was written.',
  limits:['No whole-device latency/heap/quota acceptance','Full FieldBookMobile observation/photo listing remains unbounded','Per-record held-item review remains open',
    'Native browser multi-tab/offline/rollback reopening remains open','Physical controller/independent surveyor/provider acceptance remains open',
    'Owner-deferred signing-key rotation and pinned release/restore/rollback gates remain open','International workflow acceptance remains open'],
  evidence:Object.fromEntries(names.map(name=>[name,hash(`${target}/${name}`)]))}
writeFileSync(`${target}/receipt.json`,JSON.stringify(receipt,null,2)+'\n')
console.log(JSON.stringify({status:receipt.status,tests:receipt.focusedTests,emulatedIndexedDbCases:14,browserProof:false,productionPromotion:false}))
