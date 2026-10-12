import { searchBenchmarks,getAvailableCountries } from '@/lib/online/benchmarks'
import { findNearestBeacons,formatBeaconResults } from '@/lib/survey/beaconLookup'
const originalFetch=globalThis.fetch
const syntheticGrid='EPSG:21037'
afterEach(()=>{globalThis.fetch=originalFetch})
const response=(value:unknown,status=200)=>{const result=new Response(JSON.stringify(value),{status});Object.defineProperty(result,'ok',{value:status>=200&&status<300});return result}
test('empty catalogue and failed requests cannot produce sample control or cached availability',async()=>{
 globalThis.fetch=jest.fn(async()=>response({benchmarks:[],total:0,offset:0,limit:100,fromCache:false,navigationOnly:false}))
 expect((await searchBenchmarks({country:'No published catalogue'})).benchmarks).toEqual([])
 globalThis.fetch=jest.fn(async()=>response({error:'Synthetic catalogue unavailable'},503))
 await expect(searchBenchmarks({})).rejects.toThrow('Synthetic catalogue unavailable')
 await expect(findNearestBeacons({latitude:0,longitude:0})).rejects.toThrow('Synthetic catalogue unavailable')
})
test('country metadata comes from current reviewed sources',async()=>{
 globalThis.fetch=jest.fn(async()=>response({countries:['Synthetic source country']}))
 expect(await getAvailableCountries()).toEqual(['Synthetic source country'])
})
test('zero or unknown height and coincident bearing are kept distinct in navigation output',()=>{
 const baseline={id:'synthetic',name:'Synthetic catalogue mark',type:'BM' as const,country:'Synthetic country',region:null,latitude:null,longitude:null,reviewedAt:'2026-10-08T08:00:00Z',easting:500000,northing:9800000,horizontalCrs:syntheticGrid,verticalDatum:'Synthetic BM',source:'Synthetic publisher',sourceReference:'Synthetic sheet only',catalogueStatus:'reviewed' as const,fieldVerified:false as const}
 const output={beacons:[{beacon:{...baseline,elevation:0},distanceKm:0,bearingDeg:null}],total:1,searchPoint:{latitude:0,longitude:0},radiusKm:0,elapsedMs:0,fromCache:false as const}
 expect(formatBeaconResults(output)).toContain('0.000 m')
 expect(formatBeaconResults(output)).toContain('coincident')
 expect(formatBeaconResults({...output,beacons:[{...output.beacons[0],beacon:{...baseline,elevation:null,verticalDatum:null}}]})).toContain('height unknown')
})
