import { createHash } from 'node:crypto'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
import { resolveStageReference } from '@/lib/workspaces/stageReference'
import { fromReferenceSystemRow } from '@/lib/spatial/projectReferenceSystem'
import { resolveEpsg, transformPoint } from '@/lib/spatial/projectCrs'
import { logAuditEvent } from '@/lib/enterprise/auditTrail'
import { pointImportSchema, preparePointImport, MAX_POINT_IMPORT_BYTES } from './pointImport'

const hash=(text:string)=>createHash('sha256').update(text,'utf8').digest('hex')
export const pointImportReferenceHash=(row:Record<string,unknown>|null|undefined)=>hash(canonicalJson(fromReferenceSystemRow(row)))
interface StoredReceipt {
  id:string
  created_by:string|null
  point_count:number
  quality_metadata:{kind?:string;inputHash?:string;pointIds?:string[]}
}
export async function commitPointImport(projectId:string,actorId:string,input:unknown) {
  const request=pointImportSchema.parse(input)
  const bytes=Buffer.byteLength(request.sourceText,'utf8')
  if(bytes>MAX_POINT_IMPORT_BYTES||bytes!==request.fileSize||hash(request.sourceText)!==request.sourceFileHash)throw new AppError('The source file size or SHA-256 does not match. Read the original UTF-8 file again.',400,'POINT_IMPORT_SOURCE')
  const {requestId,sourceText,...capture}=request
  const inputHash=hash(canonicalJson({projectId,actorId,...capture}))
  return db.transaction(async client=>{
    // The reference-system writer and the point register use this same parent
    // lock. Concurrent retries/imports cannot race the name/reference checks.
    const project=(await client.query<{user_id:string|null}>('SELECT user_id FROM projects WHERE id=$1 FOR UPDATE',[projectId])).rows[0]
    if(project?.user_id!==actorId)throw new AppError('Project not found or not writable by this account.',404,'POINT_IMPORT_PROJECT')
    const previous=(await client.query<StoredReceipt>(`SELECT id,created_by,point_count,quality_metadata FROM observation_batches
      WHERE project_id=$1 AND (id=$2 OR (source_type='import' AND quality_metadata->>'kind'='coordinate_import' AND quality_metadata->>'inputHash'=$3))
      ORDER BY (id=$2) DESC,created_at,id LIMIT 1`,[projectId,requestId,inputHash])).rows[0]
    if(previous) {
      const metadata=previous.quality_metadata
      if(previous.created_by!==actorId||metadata.kind!=='coordinate_import'||metadata.inputHash!==inputHash||!Array.isArray(metadata.pointIds))throw new AppError('This request ID already belongs to a different capture. Review the import before retrying.',409,'POINT_IMPORT_CONFLICT')
      const recordedIds=metadata.pointIds
      const stored=(await client.query<{id:string}>('SELECT id FROM survey_points WHERE project_id=$1 AND import_session_id=$2 AND deleted_at IS NULL',[projectId,previous.id])).rows.map(point=>point.id)
      if(stored.length!==previous.point_count||stored.length!==recordedIds.length||stored.some(id=>!recordedIds.includes(id)))throw new AppError('The saved import no longer matches its receipt. Review the point register before retrying.',409,'POINT_IMPORT_CHANGED')
      return {requestId,batchId:previous.id,sourceFileHash:request.sourceFileHash,inputHash,imported:stored.length,pointIds:metadata.pointIds,replayed:true,fieldVerified:false}
    }
    const referenceRow=(await client.query<Record<string,unknown>>('SELECT * FROM project_reference_systems WHERE project_id=$1 FOR SHARE',[projectId])).rows[0]
    if(pointImportReferenceHash(referenceRow)!==request.expectedReferenceHash)throw new AppError('The project reference changed after review. Reload and review the file against the current declaration.',409,'POINT_IMPORT_REFERENCE_CHANGED')
    const reference=resolveStageReference(referenceRow,{})
    const prepared=preparePointImport(request,reference)
    const existing=(await client.query<{point_name:string}>(`SELECT point_name FROM survey_points WHERE project_id=$1 AND deleted_at IS NULL AND point_name=ANY($2::text[])`,[projectId,prepared.points.map(point=>point.pointName)])).rows
    if(existing.length)throw new AppError(`Existing point names would be overwritten: ${existing.slice(0,5).map(row=>row.point_name).join(', ')}. No points were imported.`,409,'POINT_IMPORT_DUPLICATE')
    await client.query(`INSERT INTO import_sessions(id,project_id,file_name,format,row_count,status) VALUES($1,$2,$3,$4,$5,'committed')`,[requestId,projectId,request.fileName,prepared.format,prepared.points.length])
    const info=resolveEpsg(prepared.projectCrs),pointIds:string[]=[]
    for(let offset=0;offset<prepared.points.length;offset+=500) {
      const chunk=prepared.points.slice(offset,offset+500),values:unknown[]=[],tuples:string[]=[]
      for(const point of chunk) {
        const [lon,lat]=transformPoint(point.easting,point.northing,prepared.projectCrs,'EPSG:4326')
        const start=values.length
        values.push(projectId,point.pointName,point.easting,point.northing,point.elevation,point.code,info.code,point.elevation===null?null:reference.verticalDatum,
          info.datum,info.zone?'UTM':info.name.slice(0,20),info.zone??null,info.hemisphere??null,actorId,requestId,lon,lat)
        const p=(index:number)=>`$${start+index}`
        tuples.push(`(${[1,2,3,4,5,6].map(p).join(',')},false,'imported',${[7,8,9,10,11,12,13,14].map(p).join(',')},NULL,ST_SetSRID(ST_MakePoint(${p(15)},${p(16)}),4326))`)
      }
      const saved=(await client.query<{id:string;point_name:string}>(`INSERT INTO survey_points(project_id,point_name,easting,northing,elevation,code,is_control,source,horizontal_crs,vertical_datum,datum,projection,utm_zone,hemisphere,observer_id,import_session_id,confidence_level,geom)
        VALUES ${tuples.join(',')} RETURNING id,point_name`,values)).rows
      if(saved.length!==chunk.length||new Set(saved.map(point=>point.id)).size!==chunk.length||new Set(saved.map(point=>point.point_name)).size!==chunk.length||saved.some(point=>!chunk.some(row=>row.pointName===point.point_name)))throw new AppError('The database did not acknowledge every selected point. The complete import was rolled back.',500,'POINT_IMPORT_ACKNOWLEDGEMENT')
      pointIds.push(...saved.map(point=>point.id))
    }
    const qualityMetadata={schemaVersion:1,kind:'coordinate_import',inputHash,sourceText,parserVersion:'coordinate-import-v1',
      sourceFileHash:request.sourceFileHash,selectedIndices:request.selectedIndices,options:request.options,sourceCrs:prepared.sourceCrs,
      coordinateUnit:request.coordinateUnit,heightUnit:request.heightUnit,projectReference:referenceRow,expectedReferenceHash:request.expectedReferenceHash,
      confirmTransformation:request.confirmTransformation,confirmVerticalDatum:request.confirmVerticalDatum,confirmWarnings:request.confirmWarnings,
      excludedCount:prepared.excludedCount,warnings:prepared.warnings,points:prepared.points,pointIds,fieldVerified:false}
    await client.query(`INSERT INTO observation_batches(id,project_id,batch_number,source_type,source_file_name,source_file_hash,source_file_size,instrument_name,source_crs,quality_metadata,point_count,status,created_by)
      VALUES($1,$2,$3,'import',$4,$5,$6,$7,$8,$9,$10,'raw',$11)`,[requestId,projectId,`coordinate-${requestId}`,request.fileName,request.sourceFileHash,bytes,prepared.instrument,prepared.sourceCrs,JSON.stringify(qualityMetadata),pointIds.length,actorId])
    await logAuditEvent({userId:actorId,action:'import',resourceType:'observation_batches',resourceId:requestId,timestamp:new Date(),
      details:{inputHash,sourceFileHash:request.sourceFileHash,pointCount:pointIds.length,excludedCount:prepared.excludedCount,referenceHash:request.expectedReferenceHash,fieldVerified:false}},client)
    return {requestId,batchId:requestId,sourceFileHash:request.sourceFileHash,inputHash,imported:pointIds.length,pointIds,replayed:false,fieldVerified:false}
  })
}
