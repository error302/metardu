/** Attributed internal review of one immutable saved surface. Never professional approval. */
import {createHash,randomUUID} from 'node:crypto'
import {z} from 'zod'
import {db} from '@/lib/db'
import {AppError,AuthorizationError} from '@/lib/api/errors'
import {canonicalJson} from '@/lib/provenance/canonicalJson'
import {resolveProjectRoomAccess} from '@/lib/realtime/projectRoomAccess'
import {loadSurfaceRevision} from './surfaceRevision'

const hash=z.string().regex(/^[a-f0-9]{64}$/)
export {surfaceReviewCommandSchema} from './surfaceReviewProtocol'
import {surfaceReviewCommandSchema,surfaceReviewReadSchema,type SurfaceReviewCommand} from './surfaceReviewProtocol'
const rowSchema=z.object({id:z.string().guid(),project_id:z.string().guid(),source_revision_id:z.string().guid(),
  source_hash:hash,source_reference_hash:hash,source_output_hash:hash,source_output_evidence:z.string().min(2).max(8192),actor_id:z.string().guid(),request_id:z.string().guid(),command_hash:hash,
  outcome:z.enum(['changes_requested','reviewed_for_draft']),note:z.string().min(1).max(4000),created_at:z.union([z.date(),z.iso.datetime()])})
export interface SurfaceReviewRow {id:string;project_id:string;source_revision_id:string;source_hash:string;source_reference_hash:string;
  source_output_hash:string;source_output_evidence:string;actor_id:string;request_id:string;command_hash:string;outcome:'changes_requested'|'reviewed_for_draft';note:string;created_at:Date|string}
const digest=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex')
const conflict=(message:string)=>new AppError(message,409,'SURFACE_REVIEW_CONFLICT')
function receipt(input:unknown,command:SurfaceReviewCommand,actorId:string,commandHash:string,replayed:boolean){
  const parsed=rowSchema.safeParse(input)
  if(!parsed.success)throw conflict('The retained review receipt is incomplete. No existing review was replaced.')
  const row=parsed.data
  if(createHash('sha256').update(row.source_output_evidence).digest('hex')!==row.source_output_hash)throw conflict('The retained review output evidence is inconsistent.')
  if(row.project_id!==command.projectId||row.actor_id!==actorId||row.request_id!==command.requestId||row.command_hash!==commandHash
    ||row.source_revision_id!==command.sourceRevisionId||row.source_hash!==command.expectedSourceHash||row.outcome!==command.outcome||row.note!==command.note){
    throw conflict('This request identity already belongs to different review content. Recover the original review or use a new request.')
  }
  return {id:row.id,projectId:row.project_id,sourceRevisionId:row.source_revision_id,sourceHash:row.source_hash,
    sourceReferenceHash:row.source_reference_hash,sourceOutputHash:row.source_output_hash,actorId:row.actor_id,
    requestId:row.request_id,outcome:row.outcome,note:row.note,createdAt:new Date(row.created_at).toISOString(),replayed,
    professionalApproval:false as const,fieldVerified:false as const}
}

export async function submitSurfaceReview(input:unknown,actorId:string){
  const command=surfaceReviewCommandSchema.parse(input)
  const role=await resolveProjectRoomAccess(actorId,command.projectId)
  if(!role||role==='viewer')throw new AuthorizationError('This project role cannot record an internal source review.')
  const commandHash=digest({protocol:'surface-source-review-v1',actorId,...command})
  return db.transaction(async client=>{
    // Reuse the established snapshot lock: blocks concurrent surface computation without granting UPDATE.
    const project=await client.query<{user_id:string|null}>('SELECT user_id FROM public.lock_project_for_read($1)',[command.projectId])
    const access=await client.query<{allowed:boolean}>('SELECT public.surface_review_project_access($1,true) AS allowed',[command.projectId])
    if(project.rows.length!==1||!project.rows[0].user_id||access.rows[0]?.allowed!==true)throw new AuthorizationError('Project review access changed. No review was recorded.')
    await client.query<never>('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`surface-review:${command.projectId}:${actorId}:${command.requestId}`])
    const prior=await client.query<SurfaceReviewRow>(
      'SELECT * FROM surface_source_reviews WHERE project_id=$1 AND actor_id=$2 AND request_id=$3 LIMIT 2',[command.projectId,actorId,command.requestId])
    if(prior.rows.length>1)throw conflict('Multiple review records share this request identity. Retain the originals for inspection.')
    if(prior.rows.length===1)return receipt(prior.rows[0],command,actorId,commandHash,true)
    const source=await loadSurfaceRevision(command.projectId,command.sourceRevisionId,client)
    if(source.inputHash!==command.expectedSourceHash)throw conflict('The reviewed source hash changed. Refresh the saved revision before recording a review.')
    const head=await client.query<{current_revision_id:string|null;revision:number;latest_revision:number}>(
      `SELECT s.current_revision_id,r.revision,(SELECT MAX(h.revision) FROM surface_revisions h WHERE h.surface_id=s.id) AS latest_revision
       FROM surfaces s LEFT JOIN surface_revisions r ON r.id=s.current_revision_id AND r.surface_id=s.id
       WHERE s.project_id=$1 AND s.id=$2`,[command.projectId,source.surfaceId])
    if(head.rows.length!==1||head.rows[0].current_revision_id!==command.sourceRevisionId||!Number.isSafeInteger(head.rows[0].revision)||head.rows[0].revision<1||head.rows[0].revision!==head.rows[0].latest_revision){
      throw conflict('A newer or inconsistent saved surface exists. Refresh and review its source before recording this decision.')
    }
    const id=randomUUID(),outputEvidence=canonicalJson(source.outputIntegrity),outputHash=createHash('sha256').update(outputEvidence).digest('hex')
    const saved=await client.query<SurfaceReviewRow>(
      `INSERT INTO surface_source_reviews(id,project_id,source_revision_id,source_hash,actor_id,request_id,source_output_hash,
        source_reference_hash,command_hash,outcome,note,source_output_evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [id,command.projectId,command.sourceRevisionId,source.inputHash,actorId,command.requestId,outputHash,source.snapshot.referenceHash,commandHash,command.outcome,command.note,outputEvidence])
    if(saved.rowCount!==1||saved.rows.length!==1||saved.rows[0].id!==id||saved.rows[0].source_output_hash!==outputHash
      ||saved.rows[0].source_reference_hash!==source.snapshot.referenceHash||saved.rows[0].source_output_evidence!==outputEvidence)throw conflict('The server did not acknowledge the exact source review. The transaction was rolled back.')
    return receipt(saved.rows[0],command,actorId,commandHash,false)
  })
}

export async function readSurfaceReviews(projectId:string,sourceRevisionId:string,actorId:string){
  z.string().guid().parse(projectId);z.string().guid().parse(sourceRevisionId)
  const role=await resolveProjectRoomAccess(actorId,projectId)
  if(!role)throw new AuthorizationError('This project is not accessible to this account.')
  return db.transaction(async client=>{
    const project=await client.query<{user_id:string|null}>('SELECT user_id FROM public.lock_project_for_read($1)',[projectId])
    if(project.rows.length!==1||!project.rows[0].user_id)throw new AuthorizationError('Project access changed. Refresh before continuing.')
    const source=await loadSurfaceRevision(projectId,sourceRevisionId,client)
    const head=await client.query<{current_revision_id:string|null;revision:number|null;latest_revision:number|null}>(`SELECT s.current_revision_id,r.revision,(SELECT MAX(h.revision) FROM surface_revisions h WHERE h.surface_id=s.id) AS latest_revision
      FROM surfaces s LEFT JOIN surface_revisions r ON r.id=s.current_revision_id AND r.surface_id=s.id WHERE s.id=$1 AND s.project_id=$2`,[source.surfaceId,projectId])
    const history=await client.query<SurfaceReviewRow>('SELECT * FROM surface_source_reviews WHERE project_id=$1 AND source_revision_id=$2 ORDER BY created_at DESC,id DESC LIMIT 101',[projectId,sourceRevisionId])
    const outputHash=digest(source.outputIntegrity)
    const reviews=history.rows.slice(0,100).map(row=>{
      if(row.source_hash!==source.inputHash||row.source_reference_hash!==source.snapshot.referenceHash||row.source_output_hash!==outputHash)throw conflict('A review no longer matches its retained source evidence. Preserve it for inspection.')
      const command:SurfaceReviewCommand={projectId,sourceRevisionId,expectedSourceHash:row.source_hash,requestId:row.request_id,outcome:row.outcome,note:row.note}
      return receipt(row,command,row.actor_id,digest({protocol:'surface-source-review-v1',actorId:row.actor_id,...command}),true)
    })
    return surfaceReviewReadSchema.parse({role,source:{revisionId:sourceRevisionId,inputHash:source.inputHash,referenceHash:source.snapshot.referenceHash,outputHash,current:head.rows.length===1&&head.rows[0].current_revision_id===sourceRevisionId&&Number.isSafeInteger(head.rows[0].revision)&&(head.rows[0].revision??0)>0&&head.rows[0].revision===head.rows[0].latest_revision},reviews,historyLimited:history.rows.length>100})
  })
}
