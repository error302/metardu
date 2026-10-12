/** @jest-environment node */
import { parseNasaImageryMetadata, createImageryCatalogueReader } from '@/lib/online/imageryCatalogue'
import { imageryViewSchema, isImageryDateAvailable } from '@/lib/online/satellite'

const fixtureXml = `<?xml version="1.0"?><Capabilities xmlns:ows="http://www.opengis.net/ows/1.1"><Contents>
<Layer><ows:Identifier>MODIS_Terra_CorrectedReflectance_TrueColor</ows:Identifier>
<Dimension><ows:Identifier>Time</ows:Identifier><Default>2026-10-05</Default><Value>2026-10-01/2026-10-02/P1D</Value><Value>2026-10-04/2026-10-05/P1D</Value></Dimension>
<TileMatrixSetLink><TileMatrixSet>GoogleMapsCompatible_Level9</TileMatrixSet></TileMatrixSetLink>
<ResourceURL resourceType="tile" format="image/jpeg" template="https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{Time}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpeg"/>
</Layer><TileMatrixSet><ows:Identifier>GoogleMapsCompatible_Level9</ows:Identifier><ows:SupportedCRS>urn:ogc:def:crs:EPSG::3857</ows:SupportedCRS>
${Array.from({length:10},(_,level)=>`<TileMatrix><ows:Identifier>${level}</ows:Identifier><ScaleDenominator>${2*Math.PI*6378137/(256*0.00028*2**level)}</ScaleDenominator><TopLeftCorner>-20037508.34278925 20037508.34278925</TopLeftCorner><TileWidth>256</TileWidth><TileHeight>256</TileHeight><MatrixWidth>${2**level}</MatrixWidth><MatrixHeight>${2**level}</MatrixHeight></TileMatrix>`).join('')}
</TileMatrixSet></Contents></Capabilities>`
const esri = {copyrightText:'TEST publisher attribution',spatialReference:{wkid:102100,latestWkid:3857},tileInfo:{rows:256,cols:256,origin:{x:-Math.PI*6378137,y:Math.PI*6378137},lods:Array.from({length:24},(_,level)=>({level,resolution:2*Math.PI*6378137/(256*2**level)}))}}
test('NASA data day and gaps come from the published calendar, not the computer clock',()=>{
 const metadata=parseNasaImageryMetadata(fixtureXml)
 expect(metadata.defaultDate).toBe('2026-10-05')
 expect(metadata.maxZoom).toBe(9)
 expect(isImageryDateAvailable('2026-10-02',metadata.dateRanges)).toBe(true)
 expect(isImageryDateAvailable('2026-10-03',metadata.dateRanges)).toBe(false)
 expect(isImageryDateAvailable('2026-10-06',metadata.dateRanges)).toBe(false)
 expect(metadata.tileTemplate).toContain('GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg')
})
test.each(['<!DOCTYPE x [<!ENTITY e SYSTEM "file:///test">]>','<!DOCTYPE x>'])('XML declarations cannot introduce external entities (%s)',declaration=>{
 expect(()=>parseNasaImageryMetadata(declaration+fixtureXml)).toThrow(/declaration/i)
})
test('NASA source cannot substitute an unapproved tile host',()=>{
 expect(()=>parseNasaImageryMetadata(fixtureXml.replace('https://gibs.earthdata.nasa.gov/','https://unapproved.example.invalid/'))).toThrow(/template/i)
})
test('a shifted source grid is rejected even if its matrix identifier looks correct',()=>{
 expect(()=>parseNasaImageryMetadata(fixtureXml.replace('-20037508.34278925 20037508.34278925','0 0'))).toThrow(/tile grid/i)
})
test('calendar suffix parsing and an invalid Gregorian date are rejected',()=>{
 expect(isImageryDateAvailable('2026-10-02suffix',[{start:'2026-10-01',end:'2026-10-05'}])).toBe(false)
 expect(isImageryDateAvailable('2026-02-30',[{start:'2026-01-01',end:'2026-12-31'}])).toBe(false)
})
test('concurrent catalogue requests share their bounded provider reads and success cache',async()=>{
 const request=jest.fn<ReturnType<typeof fetch>,Parameters<typeof fetch>>().mockImplementation(async input=>new Response(String(input).includes('nasa')?fixtureXml:JSON.stringify(esri)))
 const reader=createImageryCatalogueReader(request)
 const [first,second]=await Promise.all([reader(),reader()])
 expect(request).toHaveBeenCalledTimes(2)
 expect(first).toEqual(second)
 expect(first.providers.find(provider=>provider.id==='esri-world')?.exportAllowed).toBe(false)
 expect(first.providers.find(provider=>provider.id==='esri-world')?.acquisitionDate).toBeNull()
 await reader();expect(request).toHaveBeenCalledTimes(2)
})
test('a provider failure stays explicit while the other source remains usable',async()=>{
 const request=jest.fn<ReturnType<typeof fetch>,Parameters<typeof fetch>>().mockImplementation(async input=>String(input).includes('nasa')?new Response('Unavailable',{status:503}):new Response(JSON.stringify(esri)))
 const result=await createImageryCatalogueReader(request)()
 expect(result.providers.find(provider=>provider.id==='nasa-modis-terra')?.available).toBe(false)
 expect(result.providers.find(provider=>provider.id==='esri-world')?.available).toBe(true)
})
test.each([{latitude:86,longitude:0,zoom:8},{latitude:0,longitude:181,zoom:8},{latitude:NaN,longitude:0,zoom:8}])('invalid navigation coordinates cannot enter the viewer (%j)',input=>{
 expect(imageryViewSchema.safeParse(input).success).toBe(false)
})
test('valid zero coordinates and an explicit zoom survive navigation validation',()=>{
 expect(imageryViewSchema.parse({latitude:0,longitude:0,zoom:8})).toEqual({latitude:0,longitude:0,zoom:8})
})
