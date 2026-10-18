import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { apiHandler } from '@/lib/apiHandler'
import { AppError } from '@/lib/api/errors'
import { db } from '@/lib/db'
import { fromReferenceSystemRow } from '@/lib/spatial/projectReferenceSystem'
import { commitPointImport, pointImportReferenceHash } from '@/lib/import/pointImportServer'
import { pointImportSchema } from '@/lib/import/pointImport'
import { readTextBounded } from '@/lib/security/requestBody'

export const dynamic='force-dynamic'
const headers={'Cache-Control':'private, no-store'}
export const GET=apiHandler({auth:true,rateLimit:{max:60,windowMs:60000}},async(req,ctx)=>{
  if(!z.string().uuid().safeParse(ctx.params.id).success)return NextResponse.json({error:'Invalid project.'},{status:400,headers})
  const owner=(await db.query<{user_id:string|null}>('SELECT user_id FROM projects WHERE id=$1',[ctx.params.id])).rows[0]
  if(owner?.user_id!==ctx.userId)return NextResponse.json({error:'Project not found or not writable by this account.'},{status:404,headers})
  const sourceId=new URL(req.url).searchParams.get('source')
  if(sourceId) {
    if(!z.string().uuid().safeParse(sourceId).success)return NextResponse.json({error:'Invalid capture.'},{status:400,headers})
    const capture=(await db.query<{source_file_name:string;source_file_hash:string;quality_metadata:{sourceText?:unknown}}>(`SELECT source_file_name,source_file_hash,quality_metadata FROM observation_batches WHERE id=$1 AND project_id=$2 AND created_by=$3 AND quality_metadata->>'kind'='coordinate_import'`,[sourceId,ctx.params.id,ctx.userId])).rows[0]
    const text=capture?.quality_metadata.sourceText
    if(typeof text!=='string')return NextResponse.json({error:'Source capture not found.'},{status:404,headers})
    if(createHash('sha256').update(text,'utf8').digest('hex')!==capture.source_file_hash)return NextResponse.json({error:'The retained source no longer matches its SHA-256 receipt.'},{status:409,headers})
    return new NextResponse(new Uint8Array(Buffer.from(text,'utf8')),{headers:{...headers,'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(capture.source_file_name)}`,'X-Content-Type-Options':'nosniff'}})
  }
  const reference=(await db.query<Record<string,unknown>>('SELECT * FROM project_reference_systems WHERE project_id=$1',[ctx.params.id])).rows[0]
  const history=(await db.query<{id:string;source_file_name:string;source_file_hash:string;point_count:number;created_at:Date}>(`SELECT id,source_file_name,source_file_hash,point_count,created_at FROM observation_batches WHERE project_id=$1 AND created_by=$2 AND quality_metadata->>'kind'='coordinate_import' ORDER BY created_at DESC,id LIMIT 20`,[ctx.params.id,ctx.userId])).rows
  return NextResponse.json({data:{referenceSystem:fromReferenceSystemRow(reference),referenceHash:pointImportReferenceHash(reference),history}},{headers})
})
export const POST=apiHandler({auth:true,rawBody:true,rateLimit:{max:30,windowMs:60000}},async(req,ctx)=>{
  if(!z.string().uuid().safeParse(ctx.params.id).success)return NextResponse.json({error:'Invalid project.'},{status:400,headers})
  try {
    const raw=await readTextBounded(req.body,8*1024*1024)
    if(raw===null)return NextResponse.json({error:'Import request exceeds the size limit.'},{status:413,headers})
    let input:unknown
    try { input=JSON.parse(raw) } catch { return NextResponse.json({error:'Invalid import JSON.'},{status:400,headers}) }
    const data=await commitPointImport(ctx.params.id,ctx.userId,pointImportSchema.parse(input))
    return NextResponse.json({data},{status:data.replayed?200:201,headers})
  } catch(error) {
    // Expected validation must not send source-file content or coordinates to
    // remote exception monitoring. The retained capture lives only in the DB.
    if(error instanceof AppError)return NextResponse.json({error:error.message,code:error.code},{status:error.statusCode,headers})
    if(error instanceof z.ZodError)return NextResponse.json({error:'Invalid import request. Review the file and settings.'},{status:400,headers})
    if(error&&typeof error==='object'&&'code'in error&&error.code==='23505')return NextResponse.json({error:'This capture or point already exists. Review the import history before retrying.'},{status:409,headers})
    throw error
  }
})
