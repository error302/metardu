export const dynamic='force-dynamic'
import {NextResponse} from 'next/server'
import {z} from 'zod'
import {apiHandler} from '@/lib/apiHandler'
import {db} from '@/lib/db'
import {SaveEarthworksSchema} from '@/lib/validation/apiSchemas'
import {ValidationError,ConflictError,NotFoundError} from '@/lib/api/errors'
import {hashDesignPayload,recordDesignRevision} from '@/lib/engineering/designRevisions'
import {roadQuantityInputs,calculateRoadQuantityRun} from '@/lib/engineering/roadQuantity'
import {lockQuantityAlignment,loadRoadQuantitySource,quantityRecord,QUANTITY_ENTITY,type QuantityRevision} from '@/lib/engineering/roadQuantityPersistence'

const privateHeaders={'Cache-Control':'private, no-store'}
const checked=<T>(compute:()=>T):T=>{try{return compute()}catch(error){throw new ValidationError(error instanceof Error?error.message:'Review the saved road inputs.')}}

export const POST=apiHandler({auth:true,schema:SaveEarthworksSchema,rateLimit:{max:30,windowMs:60000}},async(_req,ctx)=>{
  const body=ctx.body as z.infer<typeof SaveEarthworksSchema>
  const result=await db.transaction(async client=>{
    const alignment=await lockQuantityAlignment(client,body.alignment_id,ctx.userId,true)
    // Project-first lock serializes this stream, edits and ownership changes.
    const {rows:retried}=await client.query<QuantityRevision>(`SELECT * FROM design_revisions WHERE project_id = $1 AND discipline = 'road'
      AND entity_type = $2 AND entity_id = $3 AND payload #>> '{quantityRun,clientRunId}' = $4`,[alignment.project_id,QUANTITY_ENTITY,alignment.id,body.client_run_id])
    if(retried.length>1)throw new ConflictError('The delivery identity is ambiguous; retain the original records for review.')
    if(retried[0]){
      const archived=quantityRecord(retried[0])
      if(archived.quantity.inputHash!==body.expected_input_hash)throw new ConflictError('This delivery ID belongs to a different input snapshot.')
      return{data:archived,replayed:true}
    }
    const {road,reference}=await loadRoadQuantitySource(client,alignment)
    const inputs=checked(()=>roadQuantityInputs(road,reference)),inputHash=hashDesignPayload(inputs)
    if(inputHash!==body.expected_input_hash)throw new ConflictError('Saved road inputs changed. Reload and review before recording quantities.')
    const calculation=checked(()=>calculateRoadQuantityRun(road,reference))
    const quantity={...calculation,clientRunId:body.client_run_id,inputHash,outputHash:hashDesignPayload(calculation.result)}
    const payload={quantityRun:quantity}
    const {revision}=await recordDesignRevision({projectId:alignment.project_id,discipline:'road',entityType:QUANTITY_ENTITY,entityId:alignment.id,
      userId:ctx.userId,crs:reference.code,draftOnly:true,summary:'Measured-profile geometric quantities (draft)',payload},client)
    const data=quantityRecord({...revision,created_by:ctx.userId,payload})
    return{data,replayed:false}
  })
  return NextResponse.json(result,{status:result.replayed?200:201,headers:privateHeaders})
})

const readQuery=z.object({alignment_id:z.string().guid(),run_id:z.string().guid().optional(),preview:z.literal('1').optional(),before_revision:z.coerce.number().int().positive().max(2147483647).optional()}).strict()
export const GET=apiHandler({auth:true,rateLimit:{max:60,windowMs:60000}},async(req,ctx)=>{
  const parsed=readQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if(!parsed.success)throw new ValidationError('Supply a valid alignment ID and quantity query.')
  const query=parsed.data
  if([Boolean(query.run_id),Boolean(query.preview),Boolean(query.before_revision)].filter(Boolean).length>1)throw new ValidationError('Select one quantity preview, history page or archived run.')
  const result=await db.transaction(async client=>{
    const alignment=await lockQuantityAlignment(client,query.alignment_id,ctx.userId,false)
    if(query.run_id){
      const {rows}=await client.query<QuantityRevision>(`SELECT * FROM design_revisions WHERE project_id = $1 AND discipline = 'road'
        AND entity_type = $2 AND entity_id = $3 AND id = $4`,[alignment.project_id,QUANTITY_ENTITY,alignment.id,query.run_id])
      if(!rows[0])throw new NotFoundError('Quantity run not found in this alignment')
      return{data:quantityRecord(rows[0])}
    }
    if(query.preview){
      const {road,reference}=await loadRoadQuantitySource(client,alignment)
      const calculation=checked(()=>calculateRoadQuantityRun(road,reference))
      return{data:{...calculation,input_hash:hashDesignPayload(calculation.inputs)}}
    }
    const {rows}=await client.query<{id:string;revision:string;revision_number:number;status:string;created_at:string;input_hash:string;total_cut:number;total_fill:number}>(`SELECT id,revision,revision_number,status,created_at,
      payload #>> '{quantityRun,inputHash}' AS input_hash,(payload #>> '{quantityRun,result,totalCut}')::float8 AS total_cut,
      (payload #>> '{quantityRun,result,totalFill}')::float8 AS total_fill
      FROM design_revisions WHERE project_id = $1 AND discipline = 'road' AND entity_type = $2 AND entity_id = $3
      AND ($4::integer IS NULL OR revision_number < $4) ORDER BY revision_number DESC LIMIT 26`,[alignment.project_id,QUANTITY_ENTITY,alignment.id,query.before_revision??null])
    return{data:rows.slice(0,25),next_before:rows.length>25?rows[24].revision_number:null,can_record:alignment.project_owner===ctx.userId}
  })
  return NextResponse.json(result,{headers:privateHeaders})
})
