'use client'

import { Button } from '@/components/ui/button'
import type { CadTopologyResult } from '@/lib/cad/cadTopologyProtocol'

export function CadMeasurementsPanel({ result, loading, error, scaleText, pointCount, onSchedule }: {result:CadTopologyResult|null;loading:boolean;error:string|null;scaleText:string;pointCount:number;onSchedule:()=>void}) {
  const status=loading?'Checking…':error?'Check unavailable':result?.status==='invalid'?'Needs correction':result?.status==='empty'?'No linework':result?.faces.length?`${result.faces.length} closed face${result.faces.length===1?'':'s'}${result.status==='mixed'?' + open lines':''}`:'Open linework'
  const complete=!loading&&!error&&result?.status!=='invalid'
  const values:[string,string][]=[['Linework length:',complete&&result?.networkLengthM!==null&&result?.networkLengthM!==undefined?`${result.networkLengthM.toFixed(2)} m`:'—'],
    ['Area (m²):',complete&&result?.totalAreaM2!==null&&result?.totalAreaM2!==undefined?`${result.totalAreaM2.toFixed(2)} m²`:'—'],
    ['Area (ha):',complete&&result?.totalAreaHa!==null&&result?.totalAreaHa!==undefined?`${result.totalAreaHa.toFixed(4)} ha`:'—'],
    ['Area (acres):',complete&&result?.totalAreaAcres!==null&&result?.totalAreaAcres!==undefined?`${result.totalAreaAcres.toFixed(3)} ac`:'—']]
  return <section aria-label="Drawing measurements" className="p-2.5 rounded-lg bg-gray-950 border border-gray-800 space-y-2">
    <div className="flex flex-wrap gap-2 justify-between border-b border-gray-800 pb-2"><span className="font-semibold text-gray-300">Drawing topology</span><span className="text-amber-300 text-[10px]" role="status">{status}</span></div>
    {values.map(([label,value])=><div key={label} className="flex justify-between gap-2 text-gray-400"><span>{label}</span><span className="font-mono text-gray-200">{value}</span></div>)}
    <p className="text-[10px] text-gray-500 leading-relaxed">{result?.basis==='project-grid'?'Project grid metrics · draft':result?.basis==='scaled-drawing'?'Calibrated drawing metrics · no survey grid':result?.basis==='invalid-reference'?'Reference needs correction':'Metric scale not established'}. Areas cover bounded faces; shared edges count once in linework length.</p>
    {error&&<p role="alert" className="text-amber-300 leading-relaxed">{error}</p>}
    {result?.issues.map((issue,index)=><p key={index} role={result.status==='invalid'?'alert':undefined} className="text-amber-300 leading-relaxed">{issue}</p>)}
    {complete&&Boolean(result?.faces.length)&&<details><summary className="cursor-pointer min-h-11 flex items-center text-gray-300">Closed faces ({result?.faces.length})</summary><div className="overflow-x-auto"><table className="w-full text-[10px] text-left"><caption className="sr-only">Draft bounded face areas and boundary lengths</caption><thead><tr><th className="py-2">Face</th><th>Area (m²)</th><th>Boundary (m)</th></tr></thead><tbody>{result?.faces.map((face,index)=><tr key={index} className="border-t border-gray-800"><td className="py-2">{index+1}</td><td>{face.areaM2?.toFixed(2)??'—'}</td><td>{face.perimeterM?.toFixed(2)??'—'}</td></tr>)}</tbody></table></div></details>}
    <div className="flex justify-between text-gray-500 text-[10px] border-t border-gray-800 pt-2"><span>Scale:</span><span className="font-mono">{scaleText}</span></div>
    <Button size="sm" variant="outline" onClick={onSchedule} className="w-full min-h-11 text-[11px] border-gray-800 text-gray-300">Beacon Schedule ({pointCount})</Button>
  </section>
}
