'use client'
import { useRef, useState, useEffect } from 'react'
import { generatePileGrid, computeSettingOut, generatePileGridDXF, pileGridToCSV, formatBearingDMS, type PileGridDefinition, type PileGridResult, type PileSettingOutData, type PileInstrumentOptions } from '@/lib/engineering/pileGrid'
import { engineeringScheduleCsv } from '@/lib/engineering/engineeringScheduleCsv'
import { assertProjectedCrs } from '@/lib/spatial/projectCrs'
import { EMPTY_SETOUT_TOLERANCE_PROFILE, resolveSetoutToleranceProfile, type SetoutToleranceProfileDraft } from '@/lib/engineering/setoutToleranceProfile'
import { SetoutToleranceProfileFields } from '@/components/field/SetoutToleranceProfileFields'

const controls = 'min-h-11 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white'
const button = 'min-h-11 rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-200 disabled:opacity-40'
const fields = [ ['originEasting','Origin Easting (m)','Origineasting'], ['originNorthing','Origin Northing (m)','Originnorthing'], ['originRL','Design RL (m, optional)','Originrl'], ['rotation','Clockwise grid rotation (°)','Rotation'], ['rows','Rows','Rows'], ['columns','Columns','Columns'], ['rowSpacing','Row spacing (m)','Rowspacing'], ['columnSpacing','Column spacing (m)','Columnspacing'], ['pileDiameter','Diameter (mm, optional)','Pile diameter'], ['depth','Depth (m, optional)','Pile depth'] ] as const
type NumericField = typeof fields[number][0]
type Draft = Omit<PileGridDefinition,NumericField> & Record<NumericField,string>
const emptyDraft = (): Draft => ({ name:'',coordinateSystem:'',startLabel:'A1',labelRowsAs:'alpha',labelColumnsAs:'numeric',pileType:'pile',originEasting:'',originNorthing:'',originRL:'',rotation:'',rows:'',columns:'',rowSpacing:'',columnSpacing:'',pileDiameter:'',depth:'' })
const emptyStation = () => ({e:'',n:'',rl:'',ih:'',bsE:'',bsN:'',prism:''})
const decimal = (value: string, label: string): number => {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) || !Number.isFinite(Number(value))) throw new RangeError(`${label}: a complete finite decimal is required.`)
  return Number(value)
}
const optional = (value: string,label: string) => value.trim() ? decimal(value,label) : null
const definition = (draft: Draft,crs: string): PileGridDefinition => ({ ...draft, coordinateSystem:crs,
  originEasting:decimal(draft.originEasting,'Origin Easting'),originNorthing:decimal(draft.originNorthing,'Origin Northing'),originRL:optional(draft.originRL,'Design RL'),rotation:decimal(draft.rotation,'Grid rotation'),
  rows:decimal(draft.rows,'Rows'),columns:decimal(draft.columns,'Columns'),rowSpacing:decimal(draft.rowSpacing,'Row spacing'),columnSpacing:decimal(draft.columnSpacing,'Column spacing'),pileDiameter:optional(draft.pileDiameter,'Diameter')??undefined,depth:optional(draft.depth,'Depth')??undefined })
const asDraft = (value: PileGridDefinition): Draft => {
  const next:Draft={...emptyDraft(),name:value.name,coordinateSystem:value.coordinateSystem,pileType:value.pileType,startLabel:value.startLabel,labelRowsAs:value.labelRowsAs,labelColumnsAs:value.labelColumnsAs}
  for(const [key] of fields)next[key]=value[key]==null?'':String(value[key])
  return next
}
const demo: PileGridDefinition = { name:'Synthetic training grid',coordinateSystem:'EPSG:32737',startLabel:'A1',labelRowsAs:'alpha',labelColumnsAs:'numeric',pileType:'pile',originEasting:500000,originNorthing:9800000,originRL:100,rotation:15,rows:4,columns:5,rowSpacing:3,columnSpacing:4,pileDiameter:600,depth:18 }
type Setup = { e: number; n: number; rl: number|null; ih: number|null; options: PileInstrumentOptions }
type SavedGrid = Record<string,unknown> & {id:string;name:string}
const object = (value:unknown):Record<string,unknown> => value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : {}
const savedGrid = (value:unknown):value is SavedGrid => typeof object(value).id==='string' && typeof object(value).name==='string'
const responseError = (json:Record<string,unknown>,fallback:string) => typeof json.error==='string' ? json.error : fallback
const metadata = (record: SavedGrid): Record<string,unknown> => record.metadata && typeof record.metadata==='object' && !Array.isArray(record.metadata) ? record.metadata as Record<string,unknown> : {}

export default function PileGridPanel({ projectId, crsCode, heightReference }: {projectId?:string;crsCode?:string;heightReference?:string|null}) {
  const [draft,setDraft]=useState<Draft>(emptyDraft)
  const [localHeight,setLocalHeight]=useState('')
  const [result,setResult]=useState<PileGridResult|null>(null)
  const [rows,setRows]=useState<PileSettingOutData[]>([])
  const [station,setStation]=useState(emptyStation)
  const [setup,setSetup]=useState<Setup|null>(null)
  const [profile,setProfile]=useState<SetoutToleranceProfileDraft>(EMPTY_SETOUT_TOLERANCE_PROFILE)
  const [definitionId,setDefinitionId]=useState<string|null>(null)
  const [revision,setRevision]=useState<number|null>(null)
  const [saved,setSaved]=useState<SavedGrid[]>([])
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false),[loading,setLoading]=useState(false),[page,setPage]=useState(0)
  const epoch=useRef(0)
  const crs=projectId ? crsCode??'' : draft.coordinateSystem
  const height=projectId ? heightReference??'' : localHeight
  const invalidate = () => { epoch.current++;setResult(null);setRows([]);setSetup(null);setRevision(null);setNotice('Inputs changed; regenerate before exporting.');setError('') }
  const update = (value: Partial<Draft>) => {invalidate();setDraft(old=>({...old,...value}))}
  useEffect(()=>{epoch.current++;setDraft(emptyDraft());setStation(emptyStation());setProfile(EMPTY_SETOUT_TOLERANCE_PROFILE);setResult(null);setRows([]);setSetup(null);setDefinitionId(null);setSaved([]);setRevision(null);setSaving(false);setLoading(false);setError('');setNotice('')},[projectId])
  useEffect(()=>{epoch.current++;setResult(null);setRows([]);setSetup(null);setRevision(null)},[crsCode,heightReference])
  useEffect(()=>()=>{epoch.current++},[])
  const generate = async () => {
    setError('');setNotice('');setRows([]);setSetup(null);setRevision(null)
    const version=++epoch.current
    try {
      const def=definition(draft,crs)
      if (assertProjectedCrs(crs).units!=='metres') throw new RangeError('Declare a projected metre CRS.')
      const fresh=generatePileGrid(def);setResult(fresh);setPage(0)
      if (!projectId) {setNotice('Local draft design; no project record has been saved.');return}
      setSaving(true)
      const response=await fetch(`/api/project/${encodeURIComponent(projectId)}/setout`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save_definition',definitionId:definitionId??undefined,structureType:def.pileType,...def,pileDiameterMm:def.pileDiameter??null,depthM:def.depth??null,toleranceProfile:profile})})
      const payload:unknown=await response.json(),json=object(payload),data=object(json.data)
      if (version!==epoch.current) return
      if (!response.ok) throw new Error(responseError(json,'The local draft was not saved to this project.'))
      if (typeof data.definitionId!=='string' || !data.definitionId || typeof data.revision!=='number' || !Number.isInteger(data.revision) || data.revision<1 || data.crs!==crs) throw new Error('The project did not return a matching saved design and revision.')
      const warnings=data.coordinateWarnings==null?[]:data.coordinateWarnings
      if (!Array.isArray(warnings)||!warnings.every((w:unknown)=>typeof w==='string'))throw new Error('The project returned an incomplete review notice.')
      setDefinitionId(data.definitionId);setRevision(data.revision)
      setNotice(`Saved project design revision ${data.revision}. ${warnings.join(' ')}`)
    } catch(failure) {if(version===epoch.current) setError(failure instanceof Error?failure.message:'Review the supplied design inputs.')}
    finally {if(version===epoch.current)setSaving(false)}
  }
  const loadList = async () => {
    if (!projectId) return
    const version=epoch.current;setLoading(true);setError('')
    try {
      const response=await fetch(`/api/project/${encodeURIComponent(projectId)}/setout`),payload:unknown=await response.json(),json=object(payload),data=object(json.data)
      if(version!==epoch.current)return
      if(!response.ok||!Array.isArray(data.definitions)||!data.definitions.every(savedGrid))throw new Error(responseError(json,'Saved grids could not be loaded.'))
      setSaved(data.definitions.filter((d:SavedGrid)=>metadata(d).source!=='project_drainage'))
      setNotice('Choose a saved grid to review its original inputs; loading does not issue a new design revision.')
    } catch(failure) {if(version===epoch.current)setError(failure instanceof Error?failure.message:'Saved grids could not be loaded.')}
    finally {setLoading(false)}
  }
  const load = (record: SavedGrid) => {
    invalidate();setDefinitionId(record.id);setProfile(EMPTY_SETOUT_TOLERANCE_PROFILE)
    const number=(key:string,optionalValue=false):number|null=>{const text=record[key];if(optionalValue&&text==null)return null;return decimal(String(text??''),key)}
    try {
      const def: PileGridDefinition={name:String(record.name??''),coordinateSystem:String(record.crs??''),pileType:record.structure_type as PileGridDefinition['pileType'],startLabel:String(record.start_label??''),labelRowsAs:record.label_rows_as as PileGridDefinition['labelRowsAs'],labelColumnsAs:record.label_columns_as as PileGridDefinition['labelColumnsAs'],originEasting:number('origin_easting') as number,originNorthing:number('origin_northing') as number,originRL:number('origin_rl',true),rotation:number('rotation') as number,rows:number('rows') as number,columns:number('columns') as number,rowSpacing:number('row_spacing') as number,columnSpacing:number('column_spacing') as number,pileDiameter:number('pile_diameter_mm',true)??undefined,depth:number('depth_m',true)??undefined}
      setDraft(asDraft(def))
      const stored=metadata(record),issued=resolveSetoutToleranceProfile(stored.setoutToleranceProfileSnapshot)
      if (stored.setoutToleranceProfileSnapshot && !issued) throw new Error('Saved criteria are incomplete; review the original specification before saving.')
      setProfile(issued?{name:issued.name,jurisdiction:issued.jurisdiction,version:issued.version,horizontalMm:String(issued.horizontalM*1000),verticalMm:String(issued.verticalM*1000),effectiveDate:issued.effectiveDate,source:issued.source,approvedBy:issued.approvedBy,acknowledged:true}:EMPTY_SETOUT_TOLERANCE_PROFILE)
      if(def.coordinateSystem!==crs)throw new Error('Saved design CRS differs from this project; review the reference change before recomputing.')
      generatePileGrid(def)
      setRevision(Number.isInteger(Number(record.revision))?Number(record.revision):null)
      setNotice('Saved inputs loaded. Review design, reference and criteria, then regenerate to create a new project revision.')
    } catch(failure) {setError(failure instanceof Error?failure.message:'This saved grid needs review.')}
  }
  const compute = () => {
    setRows([]);setSetup(null);setError('')
    try {
      if(!result)throw new Error('Generate the current design first.')
      const e=decimal(station.e,'Instrument Easting'),n=decimal(station.n,'Instrument Northing'),rl=optional(station.rl,'Station RL'),ih=optional(station.ih,'Instrument height')
      const bsE=optional(station.bsE,'Backsight Easting'),bsN=optional(station.bsN,'Backsight Northing')
      if((bsE==null)!==(bsN==null))throw new RangeError('Enter both backsight coordinates or leave orientation unknown.')
      const options:PileInstrumentOptions={...(bsE!=null&&bsN!=null?{backsight:{easting:bsE,northing:bsN}}:{}),prismHeight:optional(station.prism,'Prism height')??undefined}
      if((rl!=null||result.definition.originRL!=null)&&!height.trim())throw new RangeError('Declare the common height datum/benchmark reference before computing height schedules.')
      const targets=computeSettingOut(result.piles,e,n,rl,ih,options);setRows(targets);setSetup({e,n,rl,ih,options});setPage(0)
    }catch(failure){setError(failure instanceof Error?failure.message:'Review the instrument setup.')}
  }
  const download = (kind:'grid'|'dxf'|'setup') => {
    setError('')
    try {
      if(!result)throw new Error('Regenerate from current inputs first.')
      let content:string
      if(kind==='dxf') content=generatePileGridDXF(result,height)
      else if(kind==='grid')content=pileGridToCSV(result,height)
      else {
        if(!setup)throw new Error('Compute the current instrument schedule first.')
        const current=computeSettingOut(result.piles,setup.e,setup.n,setup.rl,setup.ih,setup.options)
        content=engineeringScheduleCsv(['Point','Easting_m','Northing_m','Design_RL_m','Grid_bearing_deg','Clockwise_Hz_from_BS_deg','Horizontal_distance_m','Ground_minus_instrument_axis_m','Signed_level_staff_reading_m','Prism_vertical_difference_m','VA_from_horizontal_deg','Slope_distance_m','Station_E_m','Station_N_m','Station_RL_m','Instrument_height_m','Backsight_E_m','Backsight_N_m','Prism_height_m','Declared_CRS','Declared_height_reference','Definition_ID','Design_revision','Issue_status'],current.map(r=>[r.pile.label,r.pile.easting,r.pile.northing,r.pile.designRL,r.bearingDeg,r.horizontalAngleDeg,r.horizontalDistance,r.targetHeight,r.staffReading,r.prismVerticalDifference,r.verticalAngleDeg,r.slopeDistance,setup.e,setup.n,setup.rl,setup.ih,setup.options.backsight?.easting,setup.options.backsight?.northing,setup.options.prismHeight,crs,height,definitionId,revision,'DRAFT']))
      }
      const url=URL.createObjectURL(new Blob([kind==='dxf'?content:`\uFEFF${content}`],{type:kind==='dxf'?'application/dxf':'text/csv;charset=utf-8'})),anchor=document.createElement('a')
      anchor.href=url;anchor.download=`metardu-pile-${kind}.${kind==='dxf'?'dxf':'csv'}`;anchor.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000)
    }catch(failure){setError(failure instanceof Error?failure.message:'Export failed; review current inputs.')}
  }
  const pages=Math.max(1,Math.ceil((rows.length||result?.piles.length||0)/100)),active=Math.min(page,pages-1)
  const v=(number:number|null|undefined)=>number==null?'Unknown':number.toFixed(4)
  return <section className="space-y-5 text-zinc-100">
    <div><h3 className="text-lg font-semibold">Pile / Column Grid Setting Out</h3><p className="text-sm text-zinc-400">Enter the approved grid and declared reference. Coordinates and schedules are draft design targets; control checks and field observations establish acceptance.</p></div>
    <div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={saving} onClick={()=>{invalidate();setDefinitionId(null);setProfile(EMPTY_SETOUT_TOLERANCE_PROFILE);setDraft(asDraft({...demo,coordinateSystem:projectId?crs:demo.coordinateSystem}));setLocalHeight('Synthetic training BM');setNotice('Synthetic training example; review every value before using a project.');if(!projectId)setResult(generatePileGrid(demo))}}>Load Demo Data</button>{projectId&&<button type="button" className={button} disabled={loading||saving} onClick={()=>void loadList()}>Load project grids</button>}</div>
    {!!saved.length&&<label className="block text-sm">Saved project grid<select disabled={saving} className={controls} aria-label="Saved project grid" value={definitionId??''} onChange={e=>{const record=saved.find(r=>r.id===e.target.value);if(record)load(record)}}><option value="">Choose saved design</option>{saved.map(record=><option key={record.id} value={record.id}>{record.name}</option>)}</select></label>}
    {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}{notice&&<p role="status" className="text-sm text-amber-200">{notice}</p>}
    <fieldset disabled={saving} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <label className="text-sm text-zinc-400">Grid name<input aria-label="Grid name" className={controls} value={draft.name} onChange={e=>update({name:e.target.value})}/></label>
      <label className="text-sm text-zinc-400">Element type<select aria-label="Element type" className={controls} value={draft.pileType} onChange={e=>update({pileType:e.target.value as PileGridDefinition['pileType']})}>{['pile','column','pier','abutment'].map(k=><option key={k}>{k}</option>)}</select></label>
      <label className="text-sm text-zinc-400">Declared projected metre CRS<input aria-label="Coordinate system" className={controls} disabled={!!projectId} value={crs} onChange={e=>update({coordinateSystem:e.target.value})} placeholder="Declared EPSG code"/></label>
      <label className="text-sm text-zinc-400">Declared height reference<input aria-label="Declared height reference" className={controls} disabled={!!projectId} value={height} onChange={e=>{invalidate();setLocalHeight(e.target.value)}} placeholder="Datum or benchmark reference"/></label>
      {fields.map(([key,label,aria])=><label className="text-sm text-zinc-400" key={key}>{label}<input aria-label={aria} type="number" step="any" className={controls} value={draft[key]} onChange={e=>update({[key]:e.target.value})}/></label>)}
      {(['labelRowsAs','labelColumnsAs'] as const).map(key=><label key={key} className="text-sm text-zinc-400">{key==='labelRowsAs'?'Row':'Column'} label format<select aria-label={key} className={controls} value={draft[key]} onChange={e=>update({[key]:e.target.value})}><option value="alpha">Letters</option><option value="numeric">Numbers</option></select></label>)}
      <label className="text-sm text-zinc-400">Starting label<input aria-label="Start label" className={controls} value={draft.startLabel} onChange={e=>update({startLabel:e.target.value})}/></label>
    </fieldset>
    <p className="text-xs text-zinc-400">Clockwise rotation is measured from grid north: at 0°, rows advance north and columns east; at 90°, rows advance east and columns south. Same-format labels require 1-1 or A-A to keep every target unique. Unknown RL gives a horizontal-only target. A DXF without a declared height reference is explicitly a 2D plan.</p>
    {projectId&&<SetoutToleranceProfileFields value={profile} disabled={saving} onChange={value=>{invalidate();setProfile(value)}}/>}
    <button type="button" className="min-h-11 rounded bg-amber-500 px-5 py-2 font-semibold text-black disabled:opacity-40" disabled={saving} onClick={()=>void generate()}>Generate Grid</button>
    {result&&<><div className="flex flex-wrap items-center gap-3"><span>{result.totalPiles} design targets · grid footprint {result.area.toFixed(3)} m²</span><button type="button" className={button} onClick={()=>download('grid')}>Export grid CSV</button><button type="button" className={button} onClick={()=>download('dxf')}>Export DXF</button>{projectId&&definitionId&&revision!=null&&<a className={button} href={`/field/setout?projectId=${encodeURIComponent(projectId)}&definitionId=${encodeURIComponent(definitionId)}`}>Open field set-out</a>}</div>
      <GridPreview result={result}/>
      <div className="overflow-x-auto"><table aria-label="Grid coordinates" className="w-full text-right text-sm tabular-nums"><thead><tr>{['Point','Easting m','Northing m','Design RL m'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{result.piles.slice(active*100,(active+1)*100).map(p=><tr key={p.label}><td>{p.label}</td><td>{v(p.easting)}</td><td>{v(p.northing)}</td><td>{v(p.designRL)}</td></tr>)}</tbody></table></div>
      <div><h4 className="font-semibold">Instrument setup</h4><p className="text-xs text-zinc-400">Bearings refer to grid north. A supplied backsight gives clockwise horizontal angles from BS=0°. Enter station RL and instrument height together; prism height is independently supplied. VA is signed above the horizontal, not a zenith angle. Staff readings assume a horizontal level sight; a negative reading identifies a target above that horizon.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{([['e','Station easting (m)'],['n','Station northing (m)'],['rl','Station RL (m)'],['ih','Height of instrument (m)'],['bsE','Backsight easting (m)'],['bsN','Backsight northing (m)'],['prism','Prism height (m)']] as const).map(([key,label])=><label key={key} className="text-sm text-zinc-400">{label}<input aria-label={label} className={controls} type="number" step="any" value={station[key]} onChange={e=>{setRows([]);setSetup(null);setError('');setStation(old=>({...old,[key]:e.target.value}))}}/></label>)}</div>
      <button type="button" className={button} onClick={compute}>Compute Setting-Out Data</button>
      {!!rows.length&&<><button type="button" className={button} onClick={()=>download('setup')}>Export instrument CSV</button><div className="overflow-x-auto"><table aria-label="Instrument target schedule" className="w-full text-right text-sm tabular-nums"><thead><tr>{['Point','Grid bearing','Hz from BS','HD m','Ground offset m','Signed staff m','Prism ΔH m','VA °','SD m'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{rows.slice(active*100,(active+1)*100).map(r=><tr key={r.pile.label}><td>{r.pile.label}</td><td>{r.bearingDMS??'Undefined (co-located)'}</td><td>{r.horizontalAngleDeg==null?'Unknown':formatBearingDMS(r.horizontalAngleDeg)}</td>{[r.horizontalDistance,r.targetHeight,r.staffReading,r.prismVerticalDifference,r.verticalAngleDeg,r.slopeDistance].map((number,i)=><td className="p-2" key={i}>{v(number)}</td>)}</tr>)}</tbody></table></div></>}
      <div className="flex items-center gap-4"><button type="button" className={button} disabled={!active} onClick={()=>setPage(active-1)}>Previous</button><span>Page {active+1} of {pages}; exports contain all targets.</span><button type="button" className={button} disabled={active>=pages-1} onClick={()=>setPage(active+1)}>Next</button></div>
    </>}
  </section>
}

function GridPreview({result}:{result:PileGridResult}) {
  const b=result.boundingBox,w=Math.max(b.maxE-b.minE,0.1),h=Math.max(b.maxN-b.minN,0.1),scale=Math.min(680/w,380/h)
  const x=(e:number)=>60+(e-b.minE)*scale+(680-w*scale)/2,y=(n:number)=>60+(b.maxN-n)*scale+(380-h*scale)/2
  const corners=[result.piles[0],result.piles[result.definition.columns-1],result.piles[result.piles.length-1],result.piles[(result.definition.rows-1)*result.definition.columns]]
  return <div><svg role="img" aria-label="Grid north-up equal-scale design preview" viewBox="0 0 800 500" className="w-full rounded bg-zinc-900"><polygon points={corners.map(p=>`${x(p.easting)},${y(p.northing)}`).join(' ')} fill="none" stroke="#a1a1aa"/>{result.piles.slice(0,400).map(p=><g key={p.label}><circle cx={x(p.easting)} cy={y(p.northing)} r="3" fill="#f59e0b"/><title>{`${p.label}: E ${p.easting}, N ${p.northing}, RL ${p.designRL??'Unknown'}`}</title></g>)}<path d="M760 80V35L755 43M760 35L765 43" fill="none" stroke="#e4e4e7"/><text x="760" y="25" textAnchor="middle" fill="#e4e4e7" fontSize="12">Grid N</text></svg><p className="text-xs text-zinc-400">Equal-axis screen preview of computed design geometry; first {Math.min(400,result.piles.length)} of {result.piles.length} targets shown. This is not a printed-scale or verified construction drawing.</p></div>
}
