import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
const root='test-results/notice-worker-release'
const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex')
const hash=createHash('sha256')
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const path=join(dir,entry.name);if(entry.isDirectory())walk(path);else if(entry.isFile()&&!/\.(test|spec)\./.test(entry.name)){hash.update(path.replaceAll('\\','/'));hash.update(readFileSync(path))}}}
walk('src')
for(const file of ['package.json','package-lock.json','Dockerfile','docker-entrypoint.sh','next.config.js','scripts/prepare-standalone.mjs','public/metardu-icon.png','public/fonts/JetBrainsMono-Regular.ttf','public/fonts/JetBrainsMono-coverage.json','public/fonts/JetBrainsMono-OFL.txt']){hash.update(file);hash.update(readFileSync(file))}
const sourceSha256=hash.digest('hex')
const tests=JSON.parse(readFileSync('test-results/notice-worker-source-tests.json','utf8'))
assert.equal(tests.success,true);assert.equal(tests.numTotalTests,87);assert.equal(tests.numPassedTests,87);assert.equal(tests.numPassedTestSuites,11);assert.equal(tests.numFailedTests,0)
const lint=JSON.parse(readFileSync('test-results/notice-worker-lint.json','utf8'))
assert.equal(lint.length,28);assert.ok(lint.every(file=>file.errorCount===0&&file.warningCount===0&&file.fatalErrorCount===0))
const typeLog=readFileSync('.cache/release-verify/notice-worker-typecheck.log','utf8')
assert.ok(typeLog.includes('typecheck:app')&&typeLog.includes('typecheck:tests'));assert.ok(!/error TS\d+/.test(typeLog))
const worker=JSON.parse(readFileSync('test-results/tin-mobile-source-browser/worker.json','utf8'))
assert.equal(worker.origin,'http://127.0.0.1:3021/tools/contour-generator');assert.equal(worker.workerText,'Calculated in the background worker.')
assert.ok(/Contour Lines\s+14/.test(worker.text)&&/Index Contours\s+2/.test(worker.text)&&/TIN Triangles\s+8/.test(worker.text))
assert.ok(!worker.logs.some(log=>/TIN worker crashed|TIN worker timed out/.test(log.message)))
const login=JSON.parse(readFileSync('test-results/tin-mobile-source-browser/login-mobile.json','utf8'))
assert.equal(login.width,390);assert.equal(login.scrollWidth,390);assert.equal(login.forgot.length,1);assert.equal(login.forgot[0].height,44);assert.equal(login.remember[0].height,44)
const map=JSON.parse(readFileSync('test-results/tin-mobile-source-browser/map-mobile.json','utf8'))
assert.equal(map.viewport.width,390);assert.equal(map.scrollWidth,map.width);assert.equal(map.tools.length,6)
assert.ok(map.tools.every(tool=>tool.height>=44&&tool.width>=44));assert.equal(map.tools.filter(tool=>tool.label==='True North').length,1)
assert.equal(map.offline.length,1);assert.equal(map.offline[0].height,44);assert.equal(map.offline[0].width,44);assert.ok(map.offline[0].bounds.bottom<map.map.bottom)
const content=JSON.parse(readFileSync('src/lib/chatgpt/noticeContent.json','utf8'))
const contentSha256=createHash('sha256').update(`${content.version}\n${content.title}\n${content.paragraphs.join('\n\n')}`).digest('hex')
const base='http://127.0.0.1:3021'
const response=await fetch(base+'/api/public/chatgpt-notice'),notice=await response.json()
assert.equal(response.status,200);assert.ok(response.headers.get('cache-control').split(',').map(value=>value.trim()).includes('no-store'));assert.equal(notice.state,'unpublished');assert.equal(notice.eligible,false);assert.equal(notice.linkingConfigured,false);assert.equal(notice.publishedAt,null);assert.equal(notice.eligibleAt,null);assert.equal(notice.contentSha256,contentSha256)
const pageResponse=await fetch(base+'/docs/chatgpt-notice'),page=await pageResponse.text()
assert.equal(pageResponse.status,200);assert.ok(page.includes(`data-chatgpt-notice-version="${content.version}"`)&&page.includes('The publication timestamp has not been recorded.'))
const homeResponse=await fetch(base),home=await homeResponse.text()
assert.equal(homeResponse.status,200);assert.ok(home.includes('aria-label="ChatGPT data-sharing notice"')&&home.includes('Read the data-sharing notice'))
const connectionResponse=await fetch(base+'/connect/chatgpt'),connection=await connectionResponse.text()
assert.equal(connectionResponse.status,200);assert.ok(connection.includes('Account linking is not enabled on this deployment.')&&connection.includes('/docs/chatgpt-notice'))
const mcp=await fetch(base+'/api/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'synthetic-source-notice-check',version:'1'}}})})
assert.equal(mcp.status,503)
mkdirSync(root,{recursive:true})
writeFileSync('test-results/chatgpt-notice-source/http.json',JSON.stringify({base,notice,pageStatus:pageResponse.status,homeBannerVisible:true,connectionStatus:connectionResponse.status,mcpStatus:mcp.status,productionMutated:false,externalMessagesSent:0},null,2)+'\n')
const files=['test-results/notice-worker-source-tests.json','test-results/notice-worker-lint.json','.cache/release-verify/notice-worker-typecheck.log','test-results/tin-mobile-source-browser/worker.json','test-results/tin-mobile-source-browser/worker.jpg','test-results/tin-mobile-source-browser/login-mobile.json','test-results/tin-mobile-source-browser/login-mobile.jpg','test-results/tin-mobile-source-browser/map-mobile.json','test-results/tin-mobile-source-browser/map-mobile.jpg','test-results/chatgpt-notice-source/http.json','test-results/chatgpt-notice-source/browser.json','test-results/chatgpt-notice-source/notice.jpg','scripts/publish-chatgpt-notice.mjs']
const suitePaths=tests.testResults.map(test=>test.name.replaceAll('\\','/').split('/METARDU/')[1])
assert.ok(suitePaths.every(path=>path&&tests.testResults.some(test=>test.name.replaceAll('\\','/').endsWith('/'+path)&&test.status==='passed')))
const proof={recordedAt:new Date().toISOString(),sourceSha256,passed:true,unitTests:{total:87,suites:11},suitePaths,applicationTypes:true,testTypes:true,scopedLint:true,lintFiles:28,observedExitCodes:{unitTests:0,typecheck:0,scopedLint:0},noticeVersion:content.version,noticeContentSha256:contentSha256,artifactAssociation:{sourceSha256,files:Object.fromEntries(files.map(file=>[file,digest(file)]))},testSourceHashes:Object.fromEntries([...suitePaths,'jest.config.js','tsconfig.tests.json','tests/fixtures/chatgptNotice.ts','tests/__mocks__/tinWorkerFactory.ts'].map(file=>[file,digest(file)])),productionProof:false,fieldInstrumentProof:false}
writeFileSync(`${root}/source-checks.json`,JSON.stringify(proof,null,2)+'\n')
console.log(JSON.stringify({sourceSha256,tests:87,suites:11,lintFiles:28,sourceNoticeUnpublished:true,sourceWorkerVerified:true,passed:true},null,2))
