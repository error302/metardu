export const dynamic='force-dynamic'
import {NextResponse} from 'next/server'
import {z} from 'zod'
import {apiHandler} from '@/lib/apiHandler'
import {AppError} from '@/lib/api/errors'
import {db} from '@/lib/db'
import {loadRoadWorkbenchSource} from '@/lib/engineering/roadWorkbenchRecoveryServer'
import {loadRoadRetainedTerrain} from '@/lib/engineering/roadTerrainServer'
import {roadTerrainScopeSchema,roadTerrainListSchema} from '@/lib/engineering/roadTerrain'
const schema=roadTerrainScopeSchema.extend({revisionId:z.string().guid().optional()}).strict()
export const GET=apiHandler({auth:true,rateLimit:{max:60,windowMs:60000}},async(req,ctx)=>{
  const parsed=schema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if(!parsed.success)throw new AppError('Supply the original account, project and source hashes for terrain review.',422,'ROAD_TERRAIN_SCOPE')
  const {revisionId,...scope}=parsed.data
  if(scope.actorId!==ctx.userId)throw new AppError('Recover the terrain selection in its original signed-in account.',403,'ROAD_TERRAIN_ACCOUNT')
  const result=await db.transaction(async client=>{
    const source=await loadRoadWorkbenchSource(client,ctx.userId,scope.projectId)
    if(source.engineeringHash!==scope.engineeringHash||source.referenceHash!==scope.referenceHash)throw new AppError('The saved road or project reference changed. Keep the draft and review its original source before selecting terrain.',409,'ROAD_TERRAIN_SOURCE_CHANGED')
    if(revisionId)return{scope,terrain:await loadRoadRetainedTerrain(client,ctx.userId,scope.projectId,revisionId)}
    const {rows}=await client.query<z.infer<typeof roadTerrainListSchema>['revisions'][number]>(`SELECT r.id AS "revisionId",s.id AS "surfaceId",s.name,r.revision,r.crs,r.point_count AS "pointCount",r.triangle_count AS "triangleCount"
      FROM surface_revisions r JOIN surfaces s ON s.id=r.surface_id JOIN projects p ON p.id=s.project_id
      WHERE s.project_id=$1 AND p.user_id=$2 ORDER BY r.computed_at DESC,r.id LIMIT 201`,[scope.projectId,ctx.userId])
    return roadTerrainListSchema.parse({scope,revisions:rows.slice(0,200),limited:rows.length>200})
  })
  return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}})
})
