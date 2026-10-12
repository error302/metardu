import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs'
const root='test-results/performance-source-batch'
const promotion=JSON.parse(readFileSync('test-results/notice-worker-release/promotion.json','utf8'))
function docker(args){const result=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1024*1024});assert.equal(result.status,0,'Public bundle inspection failed; diagnostics suppressed');return result.stdout.trim()}
const app=JSON.parse(docker(['inspect','metardu-app']))[0];assert.equal(app.Image,promotion.applicationAfter.image);assert.equal(app.State.Health.Status,'healthy')
const code=`const fs=require('fs'),path=require('path'),zlib=require('zlib');const rows=[];function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else if(file.endsWith('.js')){const data=fs.readFileSync(file);rows.push({file:file.slice('/app/.next/'.length),bytes:data.length,gzipBytes:zlib.gzipSync(data).length,markers:['pdfjs','PDFDocument','fontkit','opentype','ExcelJS','MeshBasicMaterial','OpenCascade','CryptoJS','readDwg','DWG','protobuf','recharts','Sentry'].filter(marker=>data.includes(marker))})}}}walk('/app/.next/static/chunks');rows.sort((a,b)=>b.bytes-a.bytes);process.stdout.write(JSON.stringify(rows.slice(0,15)))`
const chunks=JSON.parse(docker(['exec','metardu-app','node','-e',code]))
const excluded=chunks.find(chunk=>chunk.file==='static/chunks/fbe89ba5.7144cd6a95cd6b78.js')
assert.ok(excluded&&excluded.bytes>5*1024*1024)
const routes=[]
for(const route of ['/','/tools/contour-generator','/map','/tools/setting-out']){
 const started=performance.now(),response=await fetch('http://127.0.0.1:3000'+route),html=await response.text(),elapsedMs=performance.now()-started
 assert.equal(response.status,200)
 const scriptFiles=[...new Set([...html.matchAll(/<script[^>]*src="([^"?]+\.js)[^"\s]*"/g)].map(match=>match[1]))]
 routes.push({route,status:response.status,serverElapsedMs:Math.round(elapsedMs),htmlBytes:Buffer.byteLength(html),initialScriptFiles:scriptFiles,excludedChunkIsInitial:scriptFiles.includes('/_next/'+excluded.file),cacheControl:response.headers.get('cache-control')})
}
mkdirSync(root,{recursive:true})
const report={recordedAt:new Date().toISOString(),scope:'Actual local production public bundle and anonymous HTTP response inspection',releaseId:promotion.health.releaseId,imageId:app.Image,chunks,routes,excludedFromPrecache:excluded,physicalDeviceTiming:false,externalNetworkTiming:false,customerDataRead:false,productionMutated:false}
writeFileSync(`${root}/production-baseline.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
