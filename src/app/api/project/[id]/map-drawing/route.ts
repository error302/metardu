export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db, setRlsContext } from '@/lib/db'
import { requireProjectReadAccess } from '@/lib/auth/ownership'
import { projectCache, CacheKeys } from '@/lib/cache/memory-cache'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
import { mapDrawingWriteSchema } from '@/lib/mapDrawing/wire'
import { drawingBoundary, projectDrawingSnapshot, projectDrawingVersion, updatedDrawingBoundary, type DrawingProjectRow } from '@/lib/mapDrawing/snapshot'

const selection = `SELECT p.id,p.user_id,p.name,p.datum,p.utm_zone,p.hemisphere,p.boundary_data,to_jsonb(r) AS reference
  FROM projects p LEFT JOIN project_reference_systems r ON r.project_id=p.id`
const privateHeaders = { 'Cache-Control':'private, no-store' }

export const GET = apiHandler({ auth:true,rateLimit:{ max:60,windowMs:60000 } }, async (req,ctx) => {
  const access = await requireProjectReadAccess(ctx.params.id,ctx.userId)
  if (!access.ok) return access.error ?? NextResponse.json({ error:'Project access is required.' },{ status:403 })
  if (!access.projectUserId) return NextResponse.json({ error:'Recorded ownership is required.' },{ status:403 })
  const result = await db.query<DrawingProjectRow>(`${selection} WHERE p.id=$1 AND p.user_id=$2`,[ctx.params.id,access.projectUserId])
  const row = result.rows[0]
  if (!row || row.user_id !== access.projectUserId) return NextResponse.json({ error:'Project access changed; reload the project.' },{ status:404 })
  if (new URL(req.url).searchParams.get('download') === 'original') {
    const raw=row.boundary_data&&typeof row.boundary_data==='object'&&!Array.isArray(row.boundary_data)
      ? (row.boundary_data as Record<string,unknown>).drawnFeatures??{type:'FeatureCollection',features:[]}:row.boundary_data
    return NextResponse.json(raw,{ headers:{ ...privateHeaders,'Content-Disposition':'attachment; filename="retained-project-map.json"' } })
  }
  try { return NextResponse.json(projectDrawingSnapshot(row,ctx.userId),{ headers:privateHeaders }) }
  catch (error) { return NextResponse.json({ error:error instanceof Error ? error.message : 'Saved drawing could not be read; download its original data for review.' },{ status:422,headers:privateHeaders }) }
})

export const PUT = apiHandler({ auth:true,rateLimit:{ max:60,windowMs:60000 } },async (req,ctx) => {
  const expectedUser = req.headers.get('X-Metardu-Expected-User')
  if (!expectedUser || expectedUser !== ctx.userId) return NextResponse.json({ error:'The signed-in account changed. The local draft is retained; sign in with its owner before saving.' },{ status:403 })
  const parsed = mapDrawingWriteSchema.safeParse(ctx.body)
  if (!parsed.success) return NextResponse.json({ error:'Invalid drawing data; retain the local draft and review its geometry.',issues:parsed.error.issues },{ status:400 })
  const client = await db.getClient()
  let discard = false
  try {
    await client.query('BEGIN'); await setRlsContext(client)
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[ctx.params.id])
    await client.query('SELECT project_id FROM project_reference_systems WHERE project_id=$1 FOR SHARE',[ctx.params.id])
    const locked = await client.query<DrawingProjectRow>(`${selection} WHERE p.id=$1 FOR UPDATE OF p`,[ctx.params.id])
    const row = locked.rows[0]
    if (!row || !row.user_id || row.user_id !== ctx.userId) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error:'Project ownership or access changed. The local draft is retained.' },{ status:403 })
    }
    if (projectDrawingVersion(row) !== parsed.data.baseVersion) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error:'The saved drawing or project reference changed. Retain the local draft and reload the saved drawing before merging edits.',code:'DRAWING_CONFLICT' },{ status:409 })
    }
    // Validate the current stored source as well as the replacement before writing.
    projectDrawingSnapshot(row,ctx.userId)
    const boundary = updatedDrawingBoundary(row,parsed.data.features)
    const updated = await client.query<DrawingProjectRow>(`UPDATE projects SET boundary_data=$1::jsonb WHERE id=$2 AND user_id=$3
      RETURNING id,user_id,name,datum,utm_zone,hemisphere,boundary_data`,[JSON.stringify(boundary),ctx.params.id,ctx.userId])
    if (updated.rowCount !== 1 || updated.rows.length !== 1 || updated.rows[0].id !== ctx.params.id
      || canonicalJson(drawingBoundary(updated.rows[0].boundary_data)) !== canonicalJson(boundary)) throw new Error('The database did not confirm the complete drawing save.')
    const saved = projectDrawingSnapshot({ ...updated.rows[0],reference:row.reference },ctx.userId)
    await client.query('COMMIT')
    projectCache.invalidate(CacheKeys.project(ctx.params.id))
    return NextResponse.json(saved,{ headers:privateHeaders })
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { discard = true }
    throw error
  } finally { client.release(discard ? true : undefined) }
})
