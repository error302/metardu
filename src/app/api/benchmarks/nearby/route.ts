export const dynamic='force-dynamic'
import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { readReviewedBenchmarks } from '@/lib/survey/reviewedBenchmarkCatalogue'
import { benchmarkNavigationQuery } from '@/lib/validation/benchmarkNavigation'
const headers={'Cache-Control':'private, no-store'}
/** Compatibility array response; source XY stays in its declared grid, never treated as latitude. */
export const GET=apiHandler({auth:true,rateLimit:{max:60,windowMs:60000}},async(req)=>{
 const query=Object.fromEntries(req.nextUrl.searchParams)
 if(query.radius!==undefined){query.radiusKm=query.radius;delete query.radius}
 if(query.radiusKm===undefined)query.radiusKm='10'
 const parsed=benchmarkNavigationQuery.safeParse(query)
 if(!parsed.success)return NextResponse.json({error:'Valid latitude, longitude and radius are required',issues:parsed.error.issues},{status:400,headers})
 const p=parsed.data,result=await readReviewedBenchmarks({latitude:p.lat,longitude:p.lon,radiusKm:p.radiusKm,limit:p.limit,offset:p.offset,country:p.country,q:p.q,type:'BM'})
 return NextResponse.json(result.benchmarks,{headers:{...headers,'X-Catalogue-Total':String(result.total),'X-Navigation-Only':'true'}})
})
