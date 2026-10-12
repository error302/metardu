import assert from 'node:assert/strict'
import { mkdir,writeFile } from 'node:fs/promises'
const base=process.env.IMAGERY_VERIFY_BASE ?? 'http://localhost:3012',checks=[]
assert.ok(['http://localhost:3012','http://localhost:3013','http://localhost:3014','http://localhost:3015'].includes(base),'Only isolated imagery verification previews are allowed')
const output=base.endsWith(':3015')?'test-results/export-package/imagery-http':base.endsWith(':3014')?'test-results/dependency-security/imagery-http':base.endsWith(':3013')?'test-results/imagery-viewer/final':'test-results/imagery-viewer'
const check=(name,value)=>{checks.push({name,passed:Boolean(value)});console.log(`${value?'PASS':'FAIL'} ${name}`);assert.ok(value,name)}
let passed=false
try{
 const response=await fetch(base+'/api/imagery/catalogue',{signal:AbortSignal.timeout(30000)}),catalogue=await response.json()
 check('public catalogue is available without a project or account',response.status===200&&catalogue.providers?.length===2)
 check('imagery metadata preserves the platform private API cache policy',response.headers.get('cache-control')==='private, no-store')
 const nasa=catalogue.providers.find(source=>source.id==='nasa-modis-terra'),esri=catalogue.providers.find(source=>source.id==='esri-world')
 check('NASA metadata comes from the live declared tile grid and dated calendar',nasa?.available===true&&nasa.maxZoom===9&&nasa.tileSize===256&&nasa.dateRanges.length>0&&/^\d{4}-\d{2}-\d{2}$/.test(nasa.defaultDate)&&nasa.tileTemplate.includes('{Time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg'))
 check('Esri is an identified mixed-source basemap without invented acquisition dates',esri?.available===true&&esri.acquisitionDate===null&&esri.defaultDate===null&&esri.credits.includes('Source:'))
 check('service-specific raster export permission is preserved',nasa.exportAllowed===true&&esri.exportAllowed===false&&esri.exportReason.includes('online viewing'))
 check('metadata contains no project/user or private observation fields',!JSON.stringify(catalogue).match(/user_id|project_id|password|field_observations/))
 const second=await(await fetch(base+'/api/imagery/catalogue',{signal:AbortSignal.timeout(30000)})).json()
 check('repeat reads reuse the recorded catalogue rather than inventing a fresh data day',second.retrievedAt===catalogue.retrievedAt&&second.providers.find(source=>source.id===nasa.id).defaultDate===nasa.defaultDate)
 const online=await fetch(base+'/online',{signal:AbortSignal.timeout(30000)}),page=await online.text()
 check('the packaged public utilities page responds successfully',online.status===200&&page.includes('Online Services'))
 check('browser image policy permits the specific NASA GIBS tile host',online.headers.get('content-security-policy')?.split(';').find(directive=>directive.trim().startsWith('img-src'))?.includes('https://gibs.earthdata.nasa.gov'))
 const privateProject=await fetch(base+'/api/project/00000000-0000-4000-8000-000000000001',{signal:AbortSignal.timeout(30000)})
 check('adding public imagery metadata cannot expose private project data',privateProject.status===401)
 await mkdir(output,{recursive:true});await writeFile(output+'/packaged-catalogue.json',JSON.stringify(catalogue,null,2)+'\n')
 passed=true
}finally{
 await mkdir(output,{recursive:true});await writeFile(output+'/http-result.json',JSON.stringify({passed,base,checks,customerDataAccessed:false,providerOAuthVerified:false},null,2)+'\n')
}
