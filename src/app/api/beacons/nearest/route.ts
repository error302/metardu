export const dynamic='force-dynamic'
import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { readReviewedBenchmarks } from '@/lib/survey/reviewedBenchmarkCatalogue'
import { formatBeaconResults,type BeaconSearchResponse } from '@/lib/survey/beaconLookup'
import { benchmarkNavigationQuery } from '@/lib/validation/benchmarkNavigation'
const headers={'Cache-Control':'private, no-store'}
export const GET=apiHandler({auth:true,rateLimit:{max:60,windowMs:60000}},async(req)=>{
 const parsed=benchmarkNavigationQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams))
 if(!parsed.success)return NextResponse.json({error:'Enter complete navigation coordinates, a valid radius and supported types',issues:parsed.error.issues},{status:400,headers})
 const p=parsed.data,started=Date.now(),result=await readReviewedBenchmarks({latitude:p.lat,longitude:p.lon,radiusKm:p.radiusKm,limit:p.limit,offset:p.offset,types:p.types,country:p.country,q:p.q})
 const beacons=result.benchmarks.map(beacon=>{
  if(beacon.distanceKm===undefined||beacon.navigationBearingDeg===undefined)throw new Error('Missing navigation result')
  return {beacon,distanceKm:beacon.distanceKm,bearingDeg:beacon.navigationBearingDeg}
 })
 const response:BeaconSearchResponse={beacons,total:result.total,searchPoint:{latitude:p.lat,longitude:p.lon},radiusKm:p.radiusKm,elapsedMs:Date.now()-started,fromCache:false}
 return NextResponse.json({...response,offset:result.offset,limit:result.limit,navigationOnly:true,formatted:formatBeaconResults(response)},{headers})
})
