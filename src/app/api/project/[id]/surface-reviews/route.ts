import {NextResponse} from 'next/server'
import {apiHandler} from '@/lib/apiHandler'
import {z} from 'zod'
import {readSurfaceReviews,submitSurfaceReview} from '@/lib/topo/surfaceReview'
import {surfaceReviewCommandSchema} from '@/lib/topo/surfaceReviewProtocol'
export const dynamic='force-dynamic'
const headers={'Cache-Control':'private, no-store'}
export const GET=apiHandler({auth:true,rateLimit:{max:60,windowMs:60000}},async(req,ctx)=>{
  const parsed=z.object({projectId:z.string().guid(),sourceRevisionId:z.string().guid()}).safeParse({projectId:ctx.params.id,sourceRevisionId:req.nextUrl.searchParams.get('sourceRevisionId')})
  if(!parsed.success)return NextResponse.json({error:'Choose a valid project and saved source revision.'},{status:400,headers})
  return NextResponse.json({data:await readSurfaceReviews(parsed.data.projectId,parsed.data.sourceRevisionId,ctx.userId)},{headers})
})
export const POST=apiHandler({auth:true,schema:surfaceReviewCommandSchema,rateLimit:{max:30,windowMs:60000}},async(_req,ctx)=>{
  const body=surfaceReviewCommandSchema.parse(ctx.body)
  if(body.projectId!==ctx.params.id)return NextResponse.json({error:'The review does not match this project.'},{status:400,headers})
  const result=await submitSurfaceReview(body,ctx.userId)
  return NextResponse.json({data:result},{status:result.replayed?200:201,headers})
})
