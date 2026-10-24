import { emptyTerrainDefinition, readTerrainDefinition } from '@/lib/topo/terrainDefinitionDraft'
const ids=[1,2,3].map(value=>`11111111-1111-4111-8111-11111111111${value}`),CRS='EPSG:21037'
const context={horizontalCrs:CRS,referenceHash:'a'.repeat(64),points:ids.map((id,index)=>({id,pointNumber:`P${index}`,easting:500000+index*10,northing:9850000,elevation:index-2,code:'SPOT'})),selectedIds:new Set(ids)}
const declared=()=>({...emptyTerrainDefinition(),horizontalCrs:CRS,referenceHash:context.referenceHash,reviewed:true})
test('the default hull flow does not invent a footprint or line definition',()=>{expect(readTerrainDefinition(emptyTerrainDefinition(),context)).toEqual({})})
test('a reviewed XY definition retains finite coordinates and explicit project basis',()=>{
  const draft={...declared(),useDomain:true,sourceLabel:'Synthetic boundary note',regions:[{outer:'500000,9850000\n500020,9850000\n500020,9850020\n500000,9850020',holes:['500008,9850008\n500012,9850008\n500012,9850012\n500008,9850012']}]}
  const result=readTerrainDefinition(draft,context)
  expect(result.terrainDomain?.regions[0].holes).toHaveLength(1)
  expect(result.terrainDomain).toMatchObject({horizontalCrs:CRS,units:'metres',supportUseReviewed:true})
})
test('unreviewed and stale-basis definitions cannot be submitted',()=>{
  const draft={...declared(),chains:[{name:'Chain',type:'hard' as const,sourceLabel:'Project observations',pointIds:[ids[0],ids[1]]}]}
  expect(()=>readTerrainDefinition({...draft,reviewed:false},context)).toThrow(/review/i)
  expect(()=>readTerrainDefinition({...draft,referenceHash:'f'.repeat(64)},context)).toThrow(/reference/i)
})
test('point-chain order is preserved by original identity, including a measured zero height',()=>{
  const result=readTerrainDefinition({...declared(),chains:[{name:'Chain',type:'hard',sourceLabel:'Project observations',pointIds:[ids[2],ids[0],ids[1]]}]},context)
  expect(result.breaklineChains?.[0].pointIds).toEqual([ids[2],ids[0],ids[1]])
})
test('a point removed from reviewed ground cannot be silently substituted in a chain',()=>{
  const draft={...declared(),chains:[{name:'Chain',type:'hard' as const,sourceLabel:'Project observations',pointIds:[ids[0],ids[2]]}]}
  expect(()=>readTerrainDefinition(draft,{...context,selectedIds:new Set([ids[0],ids[1]])})).toThrow(/selected/i)
})
test.each(['500000,9850000,20\n500020,9850000\n500000,9850020','500000,9850000\nmissing,9850010\n500000,9850020','500000,9850000\n500020,9850020\n500020,9850000\n500000,9850020'])('invalid or crossed coordinate definitions are not guessed or repaired',outer=>{
  expect(()=>readTerrainDefinition({...declared(),useDomain:true,sourceLabel:'Synthetic',regions:[{outer,holes:[]}]},context)).toThrow()
})
