import { terrainDomainSchema, breaklineChainSchema, type SurfaceRequest } from './surfaceRequest'
import { normalizeTerrainDomain } from './terrainDomainValidation'
export interface DefinitionPoint { id: string; pointNumber?: string; easting: number; northing: number; elevation?: number; code: string }
export interface TerrainDefinitionDraft { useDomain: boolean; sourceLabel: string; regions: Array<{ outer: string; holes: string[] }>; chains: Array<{name: string; type: 'hard'|'soft'|'ridge'|'valley'; sourceLabel: string; pointIds: string[]}>; reviewed: boolean; referenceHash: string; horizontalCrs: string }
export interface DefinitionContext { horizontalCrs: string; referenceHash: string; points: DefinitionPoint[]; selectedIds: Set<string> }
export const emptyTerrainDefinition = (): TerrainDefinitionDraft => ({useDomain:false,sourceLabel:'',regions:[{outer:'',holes:[]}],chains:[],reviewed:false,referenceHash:'',horizontalCrs:''})
function readRing(text: string, label: string) {
  if(text.length>200000)throw new Error(`${label}: split definitions larger than 200,000 characters.`)
  const numeric=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
  const vertices=text.split(/\r?\n/).map((value,index)=>({value:value.trim(),line:index+1})).filter(row=>row.value).map(row=>{
    const fields=row.value.split(/[,;\t]/)
    const values=(fields.length===1?row.value.split(/\s+/):fields).map(value=>value.trim())
    if(values.length!==2||values.some(value=>!numeric.test(value)||!Number.isFinite(Number(value))))throw new Error(`${label}, line ${row.line}: enter one finite easting,northing pair. No columns were guessed.`)
    return {x:Number(values[0]),y:Number(values[1])}
  })
  if(vertices.length<3||vertices.length>2001)throw new Error(`${label}: enter 3–2,000 boundary vertices.`)
  return vertices
}
export function readTerrainDefinition(draft: TerrainDefinitionDraft, context: DefinitionContext): Pick<SurfaceRequest,'terrainDomain'|'breaklineChains'> {
  if(!draft.useDomain&&!draft.chains.length)return {}
  if(draft.referenceHash!==context.referenceHash||draft.horizontalCrs!==context.horizontalCrs)throw new Error('The project reference changed after these definitions were entered. Retain the notes and review or transform their original coordinate basis.')
  if(!draft.reviewed)throw new Error('Review the definitions and the use of all selected support points before computing.')
  let terrainDomain:SurfaceRequest['terrainDomain']
  if(draft.useDomain) {
    if(!draft.sourceLabel.trim())throw new Error('Describe the boundary source before computing.')
    terrainDomain=terrainDomainSchema.parse({horizontalCrs:draft.horizontalCrs,units:'metres',sourceLabel:draft.sourceLabel,supportUseReviewed:true,
      regions:draft.regions.map((region,i)=>({outer:readRing(region.outer,`Area ${i+1} outer boundary`),holes:region.holes.map((hole,j)=>readRing(hole,`Area ${i+1} exclusion ${j+1}`))}))})
    normalizeTerrainDomain(terrainDomain)
  }
  const byId=new Map(context.points.map(point=>[point.id,point]))
  const chains=draft.chains.map((chain,i)=>{
    if(!chain.sourceLabel.trim())throw new Error(`Breakline ${i+1}: describe the original source.`)
    for(const id of chain.pointIds) {
      const point=byId.get(id)
      if(!context.selectedIds.has(id)||!point||![point.easting,point.northing,point.elevation].every(value=>typeof value==='number'&&Number.isFinite(value)))throw new Error(`Breakline ${i+1}: each vertex needs a complete selected original ground observation.`)
    }
    return breaklineChainSchema.parse({...chain,reviewed:true})
  })
  return {...(terrainDomain?{terrainDomain}:{}),...(chains.length?{breaklineChains:chains}:{})}
}
