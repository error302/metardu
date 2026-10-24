// Capture a source checkpoint after observed checks; never a release attestation.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs'
import path from 'node:path'

assert.equal(process.argv.length,2)
const root='.cache/terrain-domain',target='test-results/terrain-domain'
const read=name=>JSON.parse(readFileSync(`${root}/${name}`,'utf8'))
const native=read('green.json'),http=read('http.json'),independent=read('independent-artifact.json'),tests=read('tests.json'),observed=read('source-checks.json')
assert.equal(native.status,'passed');assert.equal(native.checks.length,52);assert.ok(native.checks.every(check=>check.passed))
for(const flag of ['fixtureSchemaRemoved','appliedLedgerUnchanged','sourceUnchangedDuringRun','instantiatedSourcesUnchangedDuringRun','ownedStorageRemoved'])assert.equal(native[flag],true,flag)
assert.equal(http.status,'passed');assert.equal(http.checks.length,20);assert.equal(http.originalsRoleEntitlementFilesAndRegisterUnchanged,true)
assert.equal(independent.status,'passed');assert.equal(independent.coverageM2,240);assert.equal(independent.planeIntegralM3,480)
assert.equal(independent.sha256,native.maskedArtifact.sha256)
assert.equal(tests.numFailedTests,0);assert.equal(tests.numPassedTests,118);assert.equal(tests.numPassedTestSuites,9)
for(const key of ['strictAppTypes','strictTestTypes','scopedEslint','trackedWhitespace'])assert.equal(observed[key],'passed')
const files=[...new Set([...Object.keys(native.instantiatedSourceHashes),...Object.keys(http.source),
  'src/app/project/[id]/topo/page.tsx','src/components/topo/TerrainDefinitionEditor.tsx','src/components/drawing/TopoEntityCanvas.tsx',
  'src/lib/topo/terrainDefinitionDraft.ts','src/lib/topo/terrainDomainTypes.ts','scripts/verify-surface-revisions.mjs','scripts/verify-surface-http.mjs','scripts/verify-terrain-domain-artifact.py',
  'scripts/record-terrain-domain-evidence.mjs','tests/terrain-definition-draft.test.ts','src/lib/topo/__tests__/terrainDomain.test.ts','tests/surface-revision-binding.test.ts',
  'tests/surface-source-integrity.test.ts','tests/surface-pending-recovery.test.ts','tests/saved-surface-workspace.test.tsx','tests/storage-ownership-regression.test.ts',
  'src/lib/surveyMapEngine/__tests__/topoSurfacePersistence.test.ts','src/lib/drawing/__tests__/topoEntities.test.ts'])]
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex')
const source=Object.fromEntries(files.map(file=>[file,hash(file)]))
for(const [file,value] of Object.entries(native.instantiatedSourceHashes))assert.equal(source[file],value,`Native source drift: ${file}`)
for(const [file,value] of Object.entries(http.source))assert.equal(source[file],value,`HTTP source drift: ${file}`)
assert.equal(hash(`${root}/masked-r1.dxf`),independent.sha256)
assert.equal(path.dirname(path.resolve(target)),path.resolve('test-results'));mkdirSync(target,{recursive:true})
const names=['green.json','http.json','http-retained.json','independent-artifact.json','masked-model.json','masked-r1.dxf','tests.json','source-checks.json']
for(const name of names)copyFileSync(`${root}/${name}`,`${target}/${name}`)
const receipt={status:'verified_source_checkpoint',capturedAt:new Date().toISOString(),sourceSnapshot:'Captured after observed checks; not a release-attested artifact',source,
  focusedTests:{suites:9,passed:118,failed:0},nativeSqlAndStorageCases:52,ordinaryHttpChecks:20,independentArtifact:independent,sourceChecks:observed,
  retainedHttpRevision:{projectId:http.projectId,revisionId:http.revisionId,requestId:http.requestId},
  productionPromotion:false,productionChanged:false,entitlementChanged:false,fieldProof:false,browserProof:false,
  browserLimitation:'Chrome 3 repeatedly timed out navigating to the loopback workspace and remained blank, including one fresh owned tab. Actual editor layout/interaction remains unverified.',
  remainingGates:['Actual Chrome/mobile terrain editor acceptance','Real paid server DXF through normal HTTP/browser','Receiving CAD and printed-sheet review','Physical field instruments and independent surveyor/control','Device/offline recovery and provider restore','Migration 116 rollout review','Owner-deferred signing-key rotation','Pinned reviewed promotion and rollback','Separately accepted international workflow'],
  evidence:Object.fromEntries(names.map(name=>[name,hash(`${target}/${name}`)]))}
writeFileSync(`${target}/receipt.json`,JSON.stringify(receipt,null,2)+'\n')
console.log(JSON.stringify({status:receipt.status,tests:receipt.focusedTests,nativeSqlAndStorageCases:52,ordinaryHttpChecks:20,revision:receipt.retainedHttpRevision,artifactSha256:independent.sha256}))
