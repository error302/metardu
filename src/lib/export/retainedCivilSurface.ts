/** Server-only handoff of retained mesh bytes; never triangulates today's observations. */
import {createHash} from 'node:crypto'
import {z} from 'zod'
import {canonicalJson} from '@/lib/provenance/canonicalJson'
import {fromReferenceSystemRow} from '@/lib/spatial/projectReferenceSystem'
import {generateLandXML,escapeXml} from './landXmlDocument'

const hash=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex')
const digest=z.string().regex(/^[a-f0-9]{64}$/),uuid=z.string().uuid(),coordinate=z.number().finite()
const meshSchema=z.object({points:z.array(z.object({x:coordinate,y:coordinate,z:coordinate})).min(3).max(60000),
  triangles:z.array(z.object({a:z.number().int().nonnegative(),b:z.number().int().nonnegative(),c:z.number().int().nonnegative()})).min(1).max(20000),
  constraintEdges:z.array(z.tuple([z.number().int().nonnegative(),z.number().int().nonnegative()])).optional(),
}).passthrough()
const snapshotSchema=z.object({schemaVersion:z.literal(2),sourceAdmissionVersion:z.literal('surface-source-v2'),hashAlgorithm:z.literal('sha256-canonical-json-v1'),
  reference:z.record(z.unknown()),referenceHash:digest,parameters:z.record(z.unknown()),fieldVerified:z.literal(false),
  observations:z.array(z.object({id:uuid,x:coordinate,y:coordinate,z:coordinate,horizontalCrs:z.string(),verticalDatum:z.string()}).passthrough()).min(3).max(10000),
  sourceSelection:z.object({pointIds:z.array(uuid).min(3).max(10000)}).passthrough(),
  terrainDomain:z.unknown().optional(),
}).passthrough()
const rowSchema=z.object({surface_id:uuid,revision_id:uuid,project_id:uuid,project_name:z.string().min(1),name:z.string().min(1),revision:z.number().int().positive(),
  crs:z.string().min(1),point_count:z.number().int().positive(),triangle_count:z.number().int().positive(),input_hash:digest,parameters:z.unknown(),
  result:z.object({snapshot:snapshotSchema,mesh:meshSchema,outputIntegrity:z.object({algorithm:z.literal('sha256-canonical-json-v1'),meshHash:digest,domainHash:digest.optional(),sourceMeshHash:digest.optional()}).passthrough(),
    domain:z.object({area:coordinate.positive(),definitionHash:digest}).passthrough().optional(),sourceMesh:z.unknown().optional(),
  }).passthrough(),
}).passthrough()
const invalid=()=>new Error('This retained surface revision lacks consistent geometry or reference evidence. Review the saved revision; no new mesh was inferred.')
export function generateRetainedCivilSurface(value:unknown,projectId:string,revisionId:string):string {
  const row=rowSchema.parse(value),raw=(value as {result:Record<string,unknown>}).result
  const {snapshot,mesh,outputIntegrity:integrity}=row.result
  const reference=fromReferenceSystemRow(snapshot.reference)
  if(row.project_id!==projectId||row.revision_id!==revisionId||snapshot.reference.project_id!==projectId||!reference
    ||reference.prs.horizontalCrs!==row.crs||!reference.prs.verticalDatum||reference.prs.zone==null||!reference.prs.hemisphere
    ||hash(raw.snapshot)!==row.input_hash||hash(raw.mesh)!==integrity.meshHash||hash(reference)!==snapshot.referenceHash
    ||hash(row.parameters)!==hash(snapshot.parameters)||row.point_count!==snapshot.observations.length||row.triangle_count!==mesh.triangles.length
    ||new Set(snapshot.observations.map(p=>p.id)).size!==snapshot.observations.length||new Set(snapshot.sourceSelection.pointIds).size!==snapshot.observations.length
    ||snapshot.observations.some(p=>!snapshot.sourceSelection.pointIds.includes(p.id)||p.horizontalCrs!==row.crs||p.verticalDatum!==reference.prs.verticalDatum))throw invalid()
  if(snapshot.terrainDomain){
    if(!row.result.domain||!raw.sourceMesh||hash(raw.domain)!==integrity.domainHash||hash(raw.sourceMesh)!==integrity.sourceMeshHash||row.result.domain.definitionHash!==hash(snapshot.terrainDomain))throw invalid()
  }else if(row.result.domain||raw.sourceMesh||integrity.domainHash||integrity.sourceMeshHash)throw invalid()
  const edgeKey=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`
  const constraints=new Set<string>()
  for(const [a,b] of mesh.constraintEdges??[]){if(a===b||!mesh.points[a]||!mesh.points[b])throw invalid();constraints.add(edgeKey(a,b))}
  const faces=new Set<string>(),edges=new Map<string,{count:number;direction:number}>();let area=0
  const faceXml=mesh.triangles.map(face=>{
    const ids=[face.a,face.b,face.c],key=ids.slice().sort((a,b)=>a-b).join(':')
    if(new Set(ids).size!==3||ids.some(i=>!mesh.points[i])||faces.has(key))throw invalid()
    faces.add(key)
    const [a,b,c]=ids.map(i=>mesh.points[i]),signed=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)
    if(!Number.isFinite(signed)||signed===0)throw invalid();area+=Math.abs(signed)/2
    let mask=0
    ids.forEach((a,index)=>{
      const b=ids[(index+1)%3],key=edgeKey(a,b),previous=edges.get(key),direction=a<b?1:-1
      if(previous&&(previous.count>=2||previous.direction===direction))throw invalid()
      edges.set(key,{count:(previous?.count??0)+1,direction})
      if(constraints.has(key))mask|=1<<index
    })
    return `<F${mask?` b="${mask}"`:''}>${ids.map(i=>i+1).join(' ')}</F>`
  }).join('\n')
  if([...constraints].some(edge=>!edges.has(edge))||!Number.isFinite(area)||row.result.domain&&Math.abs(row.result.domain.area-area)>Math.max(1e-8,area*1e-8))throw invalid()
  const sourceMetadata={surfaceId:row.surface_id,surfaceRevisionId:revisionId,surfaceRevision:String(row.revision),inputHash:row.input_hash,meshHash:integrity.meshHash,
    referenceHash:snapshot.referenceHash,evidenceStatus:'computed_surface_draft',fieldVerified:'false',professionalApproval:'false',
    terrainDomain:canonicalJson(snapshot.terrainDomain??null),sourceSnapshot:canonicalJson(raw.snapshot)}
  const document=generateLandXML({name:row.project_name,datum:reference.prs.datum,utm_zone:reference.prs.zone,hemisphere:reference.prs.hemisphere,
    vertical_datum:reference.prs.verticalDatum,vertical_reference:reference.prs.verticalReference,geoid_model:reference.geoidModel,benchmark_basis:reference.benchmarkBasis,metadata:sourceMetadata},
    mesh.points.map((point,index)=>({name:`V${index+1}`,easting:point.x,northing:point.y,elevation:point.z,is_control:false})))
  const pointXml=mesh.points.map((p,index)=>`<P id="${index+1}">${p.y} ${p.x} ${p.z}</P>`).join('\n')
  const surface=`<Surfaces><Surface name="${escapeXml(`${row.name} R${row.revision}`)}" desc="Computed draft retained mesh; field and professional approval not established"><Definition surfType="TIN" area2DSurf="${area}"><Pnts>${pointXml}</Pnts><Faces>${faceXml}</Faces></Definition></Surface></Surfaces>`
  return document.replace('</LandXML>',`${surface}\n</LandXML>`)
}
