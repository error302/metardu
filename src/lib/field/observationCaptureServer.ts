import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { logAuditEvent } from '@/lib/enterprise/auditTrail'
import { offlineObservationSchema, offlineObservationSource, offlineObservationInputHash, fieldObservationHash } from './observationCapture'

interface CaptureReceipt {
  id:string;created_by:string|null
  quality_metadata:{kind?:string;inputHash?:string;observationId?:string;storedObservationHash?:string}|null
}
const failure=(message:string,code='FIELD_OBSERVATION_CONFLICT')=>new AppError(message,409,code)

/** Retain raw readings and a bound receipt; this does not issue reviewed points. */
export async function recordOfflineObservation(actorId:string,input:unknown){
  const observation=offlineObservationSchema.parse(input)
  if(observation.ownerId&&observation.ownerId!==actorId)throw new AppError('Sign in as this device capture’s owner before syncing.',403,'FIELD_OBSERVATION_OWNER')
  const raw=offlineObservationSource(observation),inputHash=offlineObservationInputHash(raw)
  const batchNumber='field-'+fieldObservationHash({projectId:observation.projectId,clientId:observation.id})
  return db.transaction(async client=>{
    // The established narrow helper locks a readable project without granting
    // viewers UPDATE. The separate role helper is also the INSERT RLS rule.
    const project=(await client.query<{user_id:string|null}>('SELECT user_id FROM public.lock_project_for_read($1)',[observation.projectId])).rows[0]
    if(!project)throw new AppError('Project not found.',404,'FIELD_OBSERVATION_PROJECT')
    const access=(await client.query<{allowed:boolean}>('SELECT public.field_observation_project_access($1,true) AS allowed',[observation.projectId])).rows[0]
    if(!access?.allowed)throw new AppError('This project requires an active field-recording role.',403,'FIELD_OBSERVATION_ACCESS')
    // Serialize the exact delivery key. Different captures remain independent;
    // concurrent retries read the complete first transaction after its commit.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${observation.projectId}:${observation.id}`])
    const captures=(await client.query<CaptureReceipt>('SELECT id,created_by,quality_metadata FROM observation_batches WHERE project_id=$1 AND batch_number=$2 LIMIT 2',[observation.projectId,batchNumber])).rows
    if(captures.length>1)throw failure('Multiple capture receipts use this device key. Retain the device copy and review the existing records.')
    const previous=captures[0]
    if(previous){
      const receipt=previous.quality_metadata
      if(previous.created_by!==actorId||receipt?.kind!=='offline_field_observation'||receipt.inputHash!==inputHash||!receipt.observationId||!receipt.storedObservationHash)throw failure('This device ID already belongs to a different raw capture. No existing reading was overwritten.')
    const stored=(await client.query<Record<string,unknown>>('SELECT * FROM survey_observations WHERE id=$1 AND project_id=$2 AND client_id=$3',[receipt.observationId,observation.projectId,observation.id])).rows
      if(stored.length!==1||fieldObservationHash(stored[0])!==receipt.storedObservationHash)throw failure('The recorded observation no longer matches its capture receipt. Retain the device copy for review.','FIELD_OBSERVATION_CHANGED')
      return {ok:true as const,id:observation.id,observationId:receipt.observationId,batchId:previous.id,inputHash,replayed:true,fieldVerified:false as const}
    }
    const existing=(await client.query<{id:string}>('SELECT id FROM survey_observations WHERE project_id=$1 AND client_id=$2',[observation.projectId,observation.id])).rows
    if(existing.length)throw failure('An existing reading has this device ID but no matching capture receipt. Retain both copies for review.')
    const reference=(await client.query<Record<string,unknown>>('SELECT * FROM project_reference_systems WHERE project_id=$1',[observation.projectId])).rows[0]??null
    const record={
      project_id:observation.projectId,client_id:observation.id,point_id:observation.pointId??null,
      point_name:observation.pointId||observation.foresight||observation.station,
      observation_type:observation.observationType??(observation.instrumentType?.startsWith('gnss_')||observation.surveyType==='gnss'?'gps':observation.instrumentType==='total_station'?'total_station':observation.surveyType==='leveling'?'level':'manual'),
      easting:observation.easting??null,northing:observation.northing??null,elevation:observation.elevation??null,
      latitude:observation.latitude??null,longitude:observation.longitude??null,
      backsight:observation.backsight??null,foresight:observation.foresight??null,
      horizontal_angle:observation.horizontalAngle??null,slope_distance:observation.slopeDistance??null,vertical_angle:observation.verticalAngle??null,
      instrument_height:observation.instrumentHeight??null,rod_height:observation.targetHeight??null,
      horizontal_crs:observation.horizontalCrs??(observation.easting==null?observation.geographicCrs:null)??null,vertical_datum:observation.verticalDatum??null,
      fix_quality:observation.fixQuality??null,satellites:observation.satellites??null,hdop:observation.hdop??null,
      accuracy:observation.accuracy??null,accuracy_source:observation.accuracySource??null,solution_type:observation.solutionType??null,
      vdop:observation.vdop??null,pdop:observation.pdop??null,temperature:observation.temperature??null,
      pressure:observation.pressure??null,humidity:observation.humidity??null,weather:observation.weather??null,
      instrument_name:observation.instrumentName??null,observation_source:observation.observationSource??null,
      notes:observation.notes??null,observed_at:observation.createdAt,synced_at:new Date(),
    }
    // Bearing components, staff readings, horizontal distance and every extra
    // raw field remain in the archive. They are never relabelled as an angle,
    // grid coordinate or control observation to fit unrelated table columns.
    const saved=(await client.query<Record<string,unknown>>(`INSERT INTO survey_observations (${Object.keys(record).join(',')}) VALUES (${Object.keys(record).map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,Object.values(record))).rows
    if(saved.length!==1||typeof saved[0].id!=='string'||saved[0].client_id!==observation.id||saved[0].project_id!==observation.projectId)throw new AppError('The server did not acknowledge the raw observation. Delivery was rolled back.',500,'FIELD_OBSERVATION_ACKNOWLEDGEMENT')
    const observationId=String(saved[0].id),batchId=randomUUID()
    const metadata={schemaVersion:1,kind:'offline_field_observation',inputHash,raw,projectReference:reference,
      observationId,storedObservationHash:fieldObservationHash(saved[0]),uploadedBy:actorId,capturedBy:observation.ownerId??null,
      authority:'raw_capture',fieldVerified:false}
    const capture=(await client.query<{id:string}>(`INSERT INTO observation_batches (id,project_id,batch_number,source_type,source_crs,instrument_name,quality_metadata,point_count,observation_count,status,created_by)
      VALUES ($1,$2,$3,'import',$4,$5,$6,0,1,'raw',$7) RETURNING id`,[batchId,observation.projectId,batchNumber,observation.horizontalCrs??null,observation.instrumentName??null,JSON.stringify(metadata),actorId])).rows
    if(capture.length!==1||capture[0].id!==batchId)throw new AppError('The server did not acknowledge the raw capture receipt. Delivery was rolled back.',500,'FIELD_OBSERVATION_ACKNOWLEDGEMENT')
    await logAuditEvent({userId:actorId,action:'import',resourceType:'survey_observations',resourceId:observationId,timestamp:new Date(),details:{projectId:observation.projectId,clientId:observation.id,batchId,inputHash,fieldVerified:false}},client)
    return {ok:true as const,id:observation.id,observationId,batchId,inputHash,replayed:false,fieldVerified:false as const}
  })
}
