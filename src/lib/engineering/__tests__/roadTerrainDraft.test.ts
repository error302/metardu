/** @jest-environment node */
import {createRoadWorkbenchDraft,evaluateRoadWorkbenchDraft} from '../roadWorkbenchDraft'
import {roadWorkbenchExample} from '../roadWorkbenchExample'
import type {RoadTerrainIdentity} from '../roadTerrain'
const example=roadWorkbenchExample()
const identity:RoadTerrainIdentity={projectId:'10000000-0000-4000-8000-000000000001',surfaceId:'10000000-0000-4000-8000-000000000004',revisionId:'10000000-0000-4000-8000-000000000002',revision:2,name:'SYNTHETIC terrain',inputHash:'a'.repeat(64),meshHash:'b'.repeat(64),referenceHash:'c'.repeat(64),crs:example.reference.code as string,verticalDatum:example.reference.verticalDatum as string,fieldVerified:false}
it('saves a selected immutable terrain identity and review recipe without changing observations',()=>{
  const draft={...createRoadWorkbenchDraft(example.road),terrainRevisionId:identity.revisionId,terrainIntervalM:'10',terrainHalfWidthM:'20'}
  const evaluated=evaluateRoadWorkbenchDraft(example.road,draft,example.reference,identity)
  expect(evaluated.error).toBe('')
  expect(evaluated.road?.retainedTerrain).toEqual({...identity,intervalM:10,halfWidthM:20})
  expect(evaluated.road?.stations).toEqual(example.road.stations)
})
it('requires the selected retained revision to finish loading before a new binding can be saved',()=>{
  const draft={...createRoadWorkbenchDraft(example.road),terrainRevisionId:identity.revisionId}
  expect(evaluateRoadWorkbenchDraft(example.road,draft,example.reference).road).toBeNull()
})
it('does not use a different loaded revision or a different height basis',()=>{
  const draft={...createRoadWorkbenchDraft(example.road),terrainRevisionId:identity.revisionId}
  expect(evaluateRoadWorkbenchDraft(example.road,draft,example.reference,{...identity,revisionId:identity.projectId}).road).toBeNull()
  expect(evaluateRoadWorkbenchDraft(example.road,draft,example.reference,{...identity,verticalDatum:'different'}).road).toBeNull()
})
it('recovers a saved terrain binding and can explicitly remove it without erasing measurements',()=>{
  const road={...example.road,retainedTerrain:{...identity,intervalM:10,halfWidthM:20}}
  const draft=createRoadWorkbenchDraft(road)
  expect(draft.terrainRevisionId).toBe(identity.revisionId)
  const evaluated=evaluateRoadWorkbenchDraft(road,{...draft,terrainRevisionId:''},example.reference)
  expect(evaluated.road?.retainedTerrain).toBeUndefined()
  expect(evaluated.road?.stations).toEqual(example.road.stations)
})
