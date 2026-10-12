import assert from 'node:assert/strict'
import { readFile, writeFile, realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import JSZip from 'jszip'
import sharp from 'sharp'
import proj4 from 'proj4'

const root=await realpath('test-results/export-package')
const file=await realpath(process.argv[2]??'test-results/export-package/browser/imagery.zip')
const relative=path.relative(root,file)
assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Only preserved export-package evidence is allowed')
const bytes=await readFile(file),zip=await JSZip.loadAsync(bytes,{checkCRC32:true})
const names=Object.keys(zip.files).sort()
assert.deepEqual(names,['README.txt','imagery.pgw','imagery.png','imagery.prj','provenance.json','reference-map.png'].sort())
const raster=await zip.file('imagery.png').async('nodebuffer'),reference=await zip.file('reference-map.png').async('nodebuffer')
const provenance=JSON.parse(await zip.file('provenance.json').async('string'))
const affine=(await zip.file('imagery.pgw').async('string')).trim().split(/\r?\n/).map(Number)
assert.equal(affine.length,6);assert.ok(affine.every(Number.isFinite));assert.deepEqual(affine,provenance.affine)
const metadata=await sharp(raster).metadata(),referenceMetadata=await sharp(reference).metadata()
assert.equal(metadata.format,'png');assert.equal(metadata.width,provenance.width);assert.equal(metadata.height,provenance.height)
assert.equal(referenceMetadata.height,metadata.height+140)
assert.equal(createHash('sha256').update(raster).digest('hex'),provenance.rasterSha256)
assert.equal(provenance.source.id,'nasa-modis-terra');assert.equal(provenance.crs,'EPSG:3857')
assert.equal(provenance.pixelReference,'centres');assert.equal(provenance.certified,false);assert.equal(provenance.fieldVerified,false)
assert.equal(provenance.acquisitionTime,null);assert.equal(provenance.positionalAccuracy,null)
assert.match(provenance.requestedDataDay,/^\d{4}-\d{2}-\d{2}$/)
const [a,d,b,e,c,f]=affine
assert.ok(Math.abs(a*e-b*d)>1e-12)
const col=(metadata.width-1)/2,row=(metadata.height-1)/2
const actual=[a*col+b*row+c,d*col+e*row+f]
const expected=proj4('EPSG:4326','EPSG:3857',[provenance.view.longitude,provenance.view.latitude])
assert.ok(Math.hypot(actual[0]-expected[0],actual[1]-expected[1])<0.001,'Pixel-centred affine must locate the recorded camera centre')
const wkt=await zip.file('imagery.prj').async('string')
const wktCentre=proj4('EPSG:4326',wkt,[provenance.view.longitude,provenance.view.latitude])
assert.ok(Math.hypot(wktCentre[0]-expected[0],wktCentre[1]-expected[1])<0.001,'Projection definition must match EPSG:3857')
await writeFile(path.join(root,'archive-verification.json'),JSON.stringify({passed:true,archive:path.relative(process.cwd(),file),archiveSha256:createHash('sha256').update(bytes).digest('hex'),files:names,width:metadata.width,height:metadata.height,sourceId:provenance.source.id,dataDay:provenance.requestedDataDay,affine,centreResidualMetres:Math.hypot(actual[0]-expected[0],actual[1]-expected[1]),externalGisImportVerified:false,fieldAccuracyVerified:false},null,2)+'\n')
console.log('Actual archive CRC, files, pixels, provenance, hash, projection and pixel-centred affine verified.')
