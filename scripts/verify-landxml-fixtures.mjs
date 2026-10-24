// Synthetic source artifacts only. No HTTP, browser storage, database or secrets.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'
const require=createRequire(import.meta.url),Module=require('node:module'),ts=require('typescript'),originalLoad=Module._load
Module._load=function(request,parent,...rest){return originalLoad.call(this,request.startsWith('@/')?path.resolve(process.cwd(),'src',request.slice(2)):request,parent,...rest)}
Module._extensions['.ts']=function(module,filename){module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename)}
const {generateLandXML}=require('../src/lib/export/generateLandXML.ts')
const {mapDrawingToLandXML}=require('../src/lib/export/mapDrawingLandXml.ts')
const {parseLandXML}=require('../src/lib/import/totalStation/parseLandXML.ts')
const {transformPoint}=require('../src/lib/spatial/projectCrs.ts')
const root='.cache/map-export';mkdirSync(root,{recursive:true})
const paths=[],checks=[],sourceHashes={}
for(const file of ['src/lib/export/generateLandXML.ts','src/lib/export/landXmlDocument.ts','src/lib/export/mapDrawingLandXml.ts','src/lib/export/mapGeometryToDxf.ts','src/app/map/hooks/useMapInteractions.ts'])sourceHashes[file]=createHash('sha256').update(readFileSync(file)).digest('hex')
for(const [datum,zone,hemisphere,grid,northing] of [['WGS84',37,'S','EPSG:32737',9800000],['WGS84',32,'N','EPSG:32632',1000000],['ARC1960',37,'S','EPSG:21037',9800000]]){
  const points=[{name:'SYNTHETIC unknown & height',easting:500000,northing,elevation:null,is_control:false},{name:'SYNTHETIC measured zero',easting:500010,northing:northing+10,elevation:0,is_control:true},{name:'SYNTHETIC negative height',easting:500020,northing:northing+20,elevation:-1.23456789,is_control:false}]
  const project={name:`SYNTHETIC ${grid}`,datum,utm_zone:zone,hemisphere,vertical_datum:'SYNTHETIC local BM',vertical_reference:'local',benchmark_basis:'Synthetic fixture only'}
  const xml=generateLandXML(project,points),file=`${root}/points-${grid.slice(5)}.xml`
  writeFileSync(file,xml);paths.push(file)
  const parsed=parseLandXML(xml);assert.deepEqual(parsed.errors,[]);assert.equal(parsed.records.length,3)
  assert.equal(parsed.records[0].elevation,undefined);assert.equal(parsed.records[1].elevation,0);assert.equal(parsed.records[2].elevation,-1.23456789)
  assert.equal(parsed.records[0].pointId,points[0].name);assert.equal(parsed.records[0].easting,500000)
  checks.push({name:`${grid}: complete point values, escaped names, unknown/zero/negative heights`,passed:true})
}
const grid='EPSG:32737',position=(e,n,z)=>[...transformPoint(e,n,grid,'EPSG:4326'),...(z===undefined?[]:[z])]
const ring=(e,n,size)=>[[e,n],[e+size,n],[e+size,n+size],[e,n+size],[e,n]].map(([x,y])=>position(x,y))
const collection={type:'FeatureCollection',features:[
  {type:'Feature',id:0,properties:{name:'SYNTHETIC outer and hole',nested:{retained:0}},geometry:{type:'Polygon',coordinates:[ring(500000,9800000,100),ring(500010,9800010,10)]}},
  {type:'Feature',id:0,properties:{name:'SYNTHETIC zero & unknown'},geometry:{type:'MultiPoint',coordinates:[position(500120,9800070,0),position(500130,9800070)]}},
  {type:'Feature',properties:{name:'SYNTHETIC collection'},geometry:{type:'GeometryCollection',geometries:[{type:'MultiLineString',coordinates:[[position(500150,9800000),position(500160,9800010)],[position(500180,9800000),position(500190,9800010)]]},{type:'MultiPolygon',coordinates:[[ring(500200,9800000,10)],[ring(500220,9800000,10)]]}]}},
]}
const original=JSON.stringify(collection),converted=mapDrawingToLandXML(collection,grid)
assert.equal(JSON.stringify(collection),original);assert.equal(converted.points.length,26);assert.equal(converted.planFeatures.length,6)
assert.equal(new Set(converted.points.map(point=>point.name)).size,26)
assert.equal(converted.planFeatures.filter(feature=>feature.metadata.geometryRole==='polygon-hole').length,1)
const xml=generateLandXML({name:'SYNTHETIC complete map geometry',datum:'WGS84',utm_zone:37,hemisphere:'S',metadata:{evidenceStatus:'map_drawing_unverified'}},converted.points,converted.planFeatures)
const file=`root-map.xml`;writeFileSync(`${root}/${file}`,xml);paths.push(`${root}/${file}`)
const imported=parseLandXML(xml);assert.deepEqual(imported.errors,[]);assert.equal(imported.records.length,26)
assert(Math.abs(imported.records[0].easting-500000)<0.00001);assert(Math.abs(imported.records[0].northing-9800000)<0.00001)
assert(!xml.includes('verticalDatum='));assert(xml.includes('polygon-hole'));assert(xml.includes('map_drawing_unverified'))
checks.push({name:'Complete polygon/hole, multi-points, multi-lines, multi-polygons and nested collection with exact source metadata retained',passed:true})
const report={checkedAt:new Date().toISOString(),syntheticOnly:true,productionDataChanged:false,sourceHashes,artifacts:paths,checks,passed:true,schemaValidation:'Run scripts/verify-landxml-schema.ps1 separately; generation and parse checks alone do not establish schema compatibility.'}
writeFileSync(`${root}/fixtures.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
