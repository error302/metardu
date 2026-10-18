/** @jest-environment node */
// Executed only by verify-observation-upgrade.mjs against its guarded temporary
// database. The ordinary suite never opens a connection for this integration.
import { createHash, randomUUID } from 'node:crypto'
import { commitPointImport, pointImportReferenceHash } from '@/lib/import/pointImportServer'
import { db, getPool, setCurrentUserId } from '@/lib/db'
import { createObservationBatch, getObservationBatch, listObservationBatches } from '@/lib/observations/observationBatches'

const enabled=process.env.METARDU_OBSERVATION_UPGRADE==='synthetic-only'
const integration=enabled?test:test.skip
integration('native import and historical observation metadata survive the schema upgrade',async()=>{
  const address=new URL(process.env.DATABASE_URL!)
  expect(address.hostname).toBe('127.0.0.1');expect(address.port).toBe('55433')
  expect(address.pathname).toBe('/metardu_observation_upgrade_verify')
  const owner=process.env.QA_OWNER!,other=process.env.QA_OTHER!,project=process.env.QA_PROJECT!,legacy=process.env.QA_LEGACY!
  try {
    setCurrentUserId(owner)
    const reference=(await db.query<Record<string,unknown>>('SELECT * FROM project_reference_systems WHERE project_id=$1',[project])).rows[0]
    const sourceText='\uFEFFid,easting,northing,elevation\nSYN-UNKNOWN,500000,9850000,\nSYN-ZERO,500010,9850010,0'
    const request={requestId:randomUUID(),fileName:'SYNTHETIC café.csv',sourceText,fileSize:Buffer.byteLength(sourceText),sourceFileHash:createHash('sha256').update(sourceText).digest('hex'),selectedIndices:[0,1],options:{},sourceCrs:'EPSG:32737',coordinateUnit:'metres',heightUnit:'metres',expectedReferenceHash:pointImportReferenceHash(reference),confirmTransformation:false,confirmVerticalDatum:true,confirmWarnings:false}
    await expect(commitPointImport(project,owner,{...request,requestId:legacy})).rejects.toMatchObject({statusCode:409})
    setCurrentUserId(other)
    await expect(commitPointImport(project,other,request)).rejects.toMatchObject({statusCode:404})
    setCurrentUserId(owner)
    const first=await commitPointImport(project,owner,request)
    expect(first).toMatchObject({imported:2,replayed:false,fieldVerified:false})
    expect(await commitPointImport(project,owner,{...request,requestId:randomUUID()})).toMatchObject({batchId:first.batchId,replayed:true})
    const points=(await db.query('SELECT point_name,elevation FROM survey_points WHERE project_id=$1 ORDER BY point_name',[project])).rows
    expect(points).toHaveLength(2);expect(points[0].elevation).toBeNull();expect(Number(points[1].elevation)).toBe(0)
    const stored=await getObservationBatch(first.batchId,project)
    expect(stored?.status).toBe('raw');expect(stored?.quality_metadata.sourceText).toBe(sourceText)
    expect(createHash('sha256').update(String(stored?.quality_metadata.sourceText)).digest('hex')).toBe(request.sourceFileHash)
    for(const requestId of [process.env.QA_NOOP_SESSION!,process.env.QA_NOOP_CAPTURE!]){
      const text=sourceText.replaceAll('SYN-',`SYN-${requestId}-`)
      await expect(commitPointImport(project,owner,{...request,requestId,sourceText:text,fileSize:Buffer.byteLength(text),sourceFileHash:createHash('sha256').update(text).digest('hex')})).rejects.toMatchObject({code:'POINT_IMPORT_ACKNOWLEDGEMENT'})
      expect((await db.query('SELECT id FROM survey_points WHERE project_id=$1',[project])).rows).toHaveLength(2)
      expect((await db.query('SELECT id FROM import_sessions WHERE project_id=$1',[project])).rows).toHaveLength(1)
    }
    const old=await getObservationBatch(legacy,project)
    expect(old?.source_file_name).toBe('café original.csv')
    expect(old?.operator).toBe('SYNTHETIC historical operator')
    expect(old?.instrument_name).toBe('SYNTHETIC historical instrument')
    const history=await listObservationBatches(project)
    expect(history.find(row=>row.id===legacy)?.source_file_name).toBe(old?.source_file_name)
    expect(history.find(row=>row.id===first.batchId)?.quality_metadata).not.toHaveProperty('sourceText')
    const unknown=await createObservationBatch({projectId:project,batchNumber:'SYNTHETIC unknown counts',sourceType:'manual',userId:owner})
    expect(unknown.point_count).toBeNull();expect(unknown.observation_count).toBeNull();expect(unknown.status).toBe('raw')
    const zero=await createObservationBatch({projectId:project,batchNumber:'SYNTHETIC zero counts',sourceType:'manual',pointCount:0,observationCount:0,userId:owner})
    expect(zero.point_count).toBe(0);expect(zero.observation_count).toBe(0)
  } finally {await getPool().end()}
},60000)
