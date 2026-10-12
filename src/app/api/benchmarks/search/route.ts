export const dynamic='force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { SearchBenchmarksSchema } from '@/lib/validation/apiSchemas'
import { readReviewedBenchmarks,readReviewedBenchmarkCountries } from '@/lib/survey/reviewedBenchmarkCatalogue'
import { getBenchmarkTypes } from '@/lib/online/benchmarks'
const headers={'Cache-Control':'private, no-store'}
export const POST=apiHandler({auth:true,schema:SearchBenchmarksSchema,rateLimit:{max:60,windowMs:60000}},async(_req,ctx)=>NextResponse.json(await readReviewedBenchmarks(ctx.body as z.infer<typeof SearchBenchmarksSchema>),{headers}))
const getSchema=z.object({id:z.string().uuid().optional(),countries:z.literal('true').optional(),types:z.literal('true').optional()}).strict()
export const GET=apiHandler({auth:true,rateLimit:{max:60,windowMs:60000}},async(req)=>{
 const parsed=getSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
 if(!parsed.success)return NextResponse.json({error:'Valid catalogue metadata or reference ID is required'},{status:400,headers})
 const query=parsed.data
 if(query.id){const result=await readReviewedBenchmarks({limit:1},query.id);return result.benchmarks[0]?NextResponse.json(result.benchmarks[0],{headers}):NextResponse.json({error:'Reviewed reference mark not found'},{status:404,headers})}
 if(query.countries)return NextResponse.json({countries:await readReviewedBenchmarkCountries()},{headers})
 if(query.types)return NextResponse.json({types:getBenchmarkTypes()},{headers})
 return NextResponse.json({description:'Reviewed referenced control catalogue; source review is separate from physical field verification.',fromCache:false},{headers})
})
