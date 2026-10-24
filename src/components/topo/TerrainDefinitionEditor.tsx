'use client'
import type { TerrainDefinitionDraft, DefinitionPoint } from '@/lib/topo/terrainDefinitionDraft'

interface Props { value:TerrainDefinitionDraft; onChange:(value:TerrainDefinitionDraft)=>void; points:DefinitionPoint[]; selectedIds:Set<string>; disabled:boolean; issue:string|null }
export function TerrainDefinitionEditor({value,onChange,points,selectedIds,disabled,issue}:Props) {
  const edit=(next:TerrainDefinitionDraft)=>onChange({...next,reviewed:false})
  const active=value.useDomain||value.chains.length>0
  const selected=points.filter(point=>selectedIds.has(point.id)&&point.elevation!==undefined)
  const updateRegion=(index:number,patch:Partial<TerrainDefinitionDraft['regions'][number]>)=>edit({...value,regions:value.regions.map((region,i)=>i===index?{...region,...patch}:region)})
  const updateChain=(index:number,patch:Partial<TerrainDefinitionDraft['chains'][number]>)=>edit({...value,chains:value.chains.map((chain,i)=>i===index?{...chain,...patch}:chain)})
  return <fieldset disabled={disabled} className="space-y-4 border rounded p-4">
    <legend className="px-2 font-semibold">Terrain boundary and breaklines</legend>
    <p className="text-sm">Definitions are retained with the computed revision. Outer boundaries and exclusions clip the terrain faces and contours; all selected observations still support the parent TIN. Deselect observations that should not influence it.</p>
    <label className="flex gap-2"><input type="checkbox" checked={value.useDomain} onChange={event=>edit({...value,useDomain:event.target.checked})}/>Use a reviewed terrain boundary</label>
    {value.useDomain&&<div className="space-y-4">
      <label className="block">Boundary source or field-note reference<input className="block border rounded p-2 bg-transparent w-full" maxLength={500} value={value.sourceLabel} onChange={event=>edit({...value,sourceLabel:event.target.value})}/></label>
      <p className="text-sm">Enter easting,northing pairs in metres, one vertex per line, with a decimal point. Close each ring implicitly or repeat its first vertex. Exclusions must remain strictly inside their outer boundary.</p>
      {value.regions.map((region,index)=><div key={index} className="space-y-3 border rounded p-3">
        <label className="block">Area {index+1} outer boundary<textarea className="block border rounded p-2 w-full bg-transparent font-mono text-sm" rows={4} value={region.outer} onChange={event=>updateRegion(index,{outer:event.target.value})}/></label>
        {region.holes.map((hole,holeIndex)=><div key={holeIndex} className="space-y-2">
          <label className="block">Area {index+1} exclusion {holeIndex+1}<textarea className="block border rounded p-2 w-full bg-transparent font-mono text-sm" rows={3} value={hole} onChange={event=>updateRegion(index,{holes:region.holes.map((item,i)=>i===holeIndex?event.target.value:item)})}/></label>
          <button type="button" className="underline text-sm" onClick={()=>updateRegion(index,{holes:region.holes.filter((_,i)=>i!==holeIndex)})}>Remove exclusion {holeIndex+1} from area {index+1}</button>
        </div>)}
        <div className="flex gap-3 flex-wrap"><button type="button" className="border rounded p-2 text-sm" disabled={region.holes.length>=64} onClick={()=>updateRegion(index,{holes:[...region.holes,'']})}>Add exclusion to area {index+1}</button>
          {value.regions.length>1&&<button type="button" className="underline text-sm" onClick={()=>edit({...value,regions:value.regions.filter((_,i)=>i!==index)})}>Remove area {index+1}</button>}</div>
      </div>)}
      <button type="button" className="border rounded p-2 text-sm" disabled={value.regions.length>=32} onClick={()=>edit({...value,regions:[...value.regions,{outer:'',holes:[]}]})}>Add separate surveyed area</button>
    </div>}
    {value.chains.map((chain,index)=><div key={index} className="space-y-3 border rounded p-3">
      <h3 className="font-medium">Breakline {index+1}</h3>
      <div className="grid gap-3 sm:grid-cols-2"><label>Name<input className="block border rounded p-2 w-full bg-transparent" value={chain.name} maxLength={150} onChange={event=>updateChain(index,{name:event.target.value})}/></label>
      <label>Type<select className="block border rounded p-2 w-full bg-[var(--bg-secondary)]" value={chain.type} onChange={event=>updateChain(index,{type:event.target.value as typeof chain.type})}>{['hard','soft','ridge','valley'].map(type=><option key={type} value={type}>{type}</option>)}</select></label></div>
      <label className="block">Breakline {index+1} source reference<input className="block border rounded p-2 w-full bg-transparent" value={chain.sourceLabel} maxLength={500} onChange={event=>updateChain(index,{sourceLabel:event.target.value})}/></label>
      <p className="text-sm">Choose original observations in line order. Their recorded XYZ values are retained. Every supplied line constrains the model; type is the reviewed feature classification.</p>
      {chain.pointIds.map((id,pointIndex)=><div key={pointIndex} className="flex items-end gap-3"><label className="min-w-0 flex-1">Breakline {index+1} point {pointIndex+1}<select className="block border rounded p-2 w-full bg-[var(--bg-secondary)]" value={id} onChange={event=>updateChain(index,{pointIds:chain.pointIds.map((item,i)=>i===pointIndex?event.target.value:item)})}><option value="">Choose a selected original point</option>{selected.map(point=><option key={point.id} value={point.id}>{point.pointNumber??point.id} · height {point.elevation} m</option>)}</select></label>
        {chain.pointIds.length>2&&<button type="button" className="underline text-sm pb-2" onClick={()=>updateChain(index,{pointIds:chain.pointIds.filter((_,i)=>i!==pointIndex)})}>Remove point {pointIndex+1}</button>}</div>)}
      <div className="flex gap-3 flex-wrap"><button type="button" className="border rounded p-2 text-sm" disabled={chain.pointIds.length>=2001} onClick={()=>updateChain(index,{pointIds:[...chain.pointIds,'']})}>Add point to breakline {index+1}</button><button type="button" className="underline text-sm" onClick={()=>edit({...value,chains:value.chains.filter((_,i)=>i!==index)})}>Remove breakline {index+1}</button></div>
    </div>)}
    <button type="button" className="border rounded p-2 text-sm" disabled={value.chains.length>=2000} onClick={()=>edit({...value,chains:[...value.chains,{name:`Breakline ${value.chains.length+1}`,type:'hard',sourceLabel:'Selected project observations',pointIds:['','']}]})}>Add measured point-chain breakline</button>
    {active&&<><p className="text-sm">Definition coordinate basis: {value.horizontalCrs||'Not bound to the project reference'} · metres. XY mask vertices acquire derived heights from the retained TIN, and are not new observations.</p>
      <label className="flex gap-2"><input type="checkbox" checked={value.reviewed} onChange={event=>onChange({...value,reviewed:event.target.checked})}/>These definitions use the stated project basis. I checked the line order, boundaries and use of every selected support point, including points outside boundaries or inside exclusions.</label>
      {issue&&<p role="status" className="text-sm text-orange-400">{issue}</p>}</>}
  </fieldset>
}
