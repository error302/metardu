import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { AppError } from '@/lib/api/errors'
import { readBlockRegister } from '@/lib/scheme/readBlockRegister'

export const dynamic='force-dynamic'
export const GET=apiHandler({auth:true,rateLimit:{max:60,windowMs:60000}},async(request,ctx)=>{
  const query=new URL(request.url).searchParams
  if(['page','q','status'].some(key=>query.getAll(key).length>1))throw new AppError('Choose one value for each register filter.',400,'BLOCK_REGISTER_INPUT')
  const data=await readBlockRegister(ctx.userId,ctx.params.id,ctx.params.blockId,{page:query.get('page')??undefined,q:query.get('q')??undefined,status:query.get('status')??undefined})
  return NextResponse.json({data},{headers:{'Cache-Control':'private, no-store'}})
})
