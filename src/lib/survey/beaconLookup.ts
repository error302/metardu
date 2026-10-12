import { searchBenchmarks,type Benchmark,type BenchmarkType } from '@/lib/online/benchmarks'
export type BeaconType=BenchmarkType
export interface BeaconSearchParams {latitude:number;longitude:number;radiusKm?:number;limit?:number;types?:BeaconType[];country?:string}
export interface BeaconSearchResult {beacon:Benchmark;distanceKm:number;bearingDeg:number|null}
export interface BeaconSearchResponse {beacons:BeaconSearchResult[];total:number;searchPoint:{latitude:number;longitude:number};radiusKm:number;elapsedMs:number;fromCache:false}
/** Reviewed server catalogue only. Navigation results are neither offline availability nor survey observations. */
export async function findNearestBeacons(params:BeaconSearchParams):Promise<BeaconSearchResponse>{
 const started=Date.now(),result=await searchBenchmarks({...params,limit:params.limit??10,radiusKm:params.radiusKm??50})
 const beacons=result.benchmarks.map(beacon=>{
  if(beacon.distanceKm===undefined||beacon.navigationBearingDeg===undefined)throw new Error('The catalogue response has no navigation comparison')
  return {beacon,distanceKm:beacon.distanceKm,bearingDeg:beacon.navigationBearingDeg}
 })
 return {beacons,total:result.total,searchPoint:{latitude:params.latitude,longitude:params.longitude},radiusKm:params.radiusKm??50,elapsedMs:Date.now()-started,fromCache:false}
}
export function formatBeaconResults(response:BeaconSearchResponse):string{
 if(!response.beacons.length)return `No reviewed reference marks within ${response.radiusKm} km of the navigation location.`
 const lines=[`${response.total} reviewed reference mark(s); showing ${response.beacons.length}. Navigation distances and bearings require field confirmation.`]
 for(const {beacon,distanceKm,bearingDeg}of response.beacons){
  const height=beacon.elevation===null?'height unknown':`${beacon.elevation.toFixed(3)} m (${beacon.verticalDatum})`
  lines.push(`${beacon.name} (${beacon.type}): ${distanceKm.toFixed(3)} km, ${bearingDeg===null?'coincident — no azimuth':bearingDeg.toFixed(1)+'° navigation azimuth'}; ${height}; grid ${beacon.horizontalCrs}; source ${beacon.sourceReference}`)
 }
 return lines.join('\n')
}
