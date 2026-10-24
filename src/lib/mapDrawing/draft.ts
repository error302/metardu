import { z } from 'zod'
import { mapFeatureCollectionSchema } from '@/lib/validation/mapDrawing'
import type { MapFeatureCollection } from './wire'

export const drawingDraftSchema = z.object({
  projectId:z.string(),viewerId:z.string(),baseVersion:z.string().regex(/^[a-f0-9]{64}$/),
  features:mapFeatureCollectionSchema,savedAt:z.string(),
})
export type DrawingDraft = z.infer<typeof drawingDraftSchema>
export const drawingDraftKey = (projectId:string,viewerId:string) => `metardu-project-map:${viewerId}:${projectId}`

/** Project drafts never read or replace the unlinked legacy map/CAD browser records. */
export function readDrawingDraft(storage:Pick<Storage,'getItem'>,projectId:string,viewerId:string):DrawingDraft|null {
  const raw = storage.getItem(drawingDraftKey(projectId,viewerId))
  if (!raw) return null
  let value:unknown
  try { value=JSON.parse(raw) as unknown }
  catch { throw new Error('The retained project draft could not be read; its original browser record has been preserved.') }
  const parsed = drawingDraftSchema.safeParse(value)
  if (!parsed.success || parsed.data.projectId !== projectId || parsed.data.viewerId !== viewerId) throw new Error('The retained project draft could not be confirmed; its browser record has been preserved.')
  return parsed.data
}
export function saveDrawingDraft(storage:Pick<Storage,'setItem'>,projectId:string,viewerId:string,baseVersion:string,features:MapFeatureCollection):DrawingDraft {
  const draft = drawingDraftSchema.parse({ projectId,viewerId,baseVersion,features,savedAt:new Date().toISOString() })
  storage.setItem(drawingDraftKey(projectId,viewerId),JSON.stringify(draft))
  return draft
}
export function archiveDrawingDraft(storage:Pick<Storage,'setItem'>,draft:DrawingDraft):string {
  const key = `${drawingDraftKey(draft.projectId,draft.viewerId)}:recovery:${crypto.randomUUID()}`
  storage.setItem(key,JSON.stringify(draft))
  return key
}
