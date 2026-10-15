'use client'
import type { RoadDesignData } from '@/types/engineering'
import type { EngineeringProject } from '../shared'
import { calculateRoadEarthworks, calculateRoadHorizontal } from '@/lib/engineering/roadProjectOutputs'
import { resolveRoadDesignStations } from '@/lib/engineering/roadVerticalAlignment'
import { buildRoadCentrelineSetout } from '@/lib/engineering/roadCoordinateSetout'

export function Step6Outputs({ project, data }: { project: EngineeringProject; data: RoadDesignData | null }) {
  const horizontal = calculateRoadHorizontal(data?.ips ?? [], data?.startChainage ?? Number.NaN, project.projectReferenceSystem?.code ?? '')
  const resolved = resolveRoadDesignStations(data)
  const earthworks = calculateRoadEarthworks(resolved.stations, data?.crossSectionTemplate)
  const centreline = buildRoadCentrelineSetout(data, project.projectReferenceSystem?.code ?? '', project.projectReferenceSystem?.verticalDatum)
  return <div className="space-y-6">
    <div><h3 className="text-lg font-semibold text-white">Computed Outputs</h3><p className="text-sm text-zinc-400">Circular and symmetric transition alignment geometry with measured cross-section quantities.</p></div>
    <section className="rounded-lg border border-zinc-700 p-4">
      <h4 className="mb-3 font-medium text-white">Horizontal Curves</h4>
      {horizontal.issues.map(issue => <p role="status" key={issue} className="text-sm text-amber-300">{issue}</p>)}
      {!horizontal.issues.length && !horizontal.curves.length && <p className="text-sm text-zinc-400">This alignment contains no circular curves. A straight segment needs two endpoints; a curve needs a middle PI and a supplied design radius.</p>}
      {!!horizontal.curves.length && <div className="overflow-x-auto"><table aria-label="Horizontal alignment curves" className="w-full text-right text-sm tabular-nums">
        <thead><tr>{['PI', 'Type', 'Turn', 'Radius m', 'Deflection °', 'Tangent m', 'Circular arc m', 'Spiral each m', 'TC chainage m', 'MC chainage m', 'CT chainage m', 'TS chainage m', 'SC chainage m', 'CS chainage m', 'ST chainage m'].map(label => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead>
        <tbody>{horizontal.curves.map(curve => <tr key={curve.ipId} className="border-t border-zinc-800"><td className="px-3 py-2">{curve.name}</td><td>{curve.kind}</td><td>{curve.turn}</td>{[curve.radius, curve.deflectionAngle, curve.tangentLength, curve.arcLength, curve.transitionLength, curve.spiralAlignment ? null : curve.chainageTC, curve.chainageMC, curve.spiralAlignment ? null : curve.chainageCT, curve.chainageTS, curve.spiralAlignment ? curve.chainageTC : null, curve.spiralAlignment ? curve.chainageCT : null, curve.chainageST].map((value, i) => <td key={i} className="px-3 py-2">{value == null ? '—' : value.toFixed(3)}</td>)}</tr>)}</tbody>
      </table></div>}
    </section>
    <section className="rounded-lg border border-zinc-700 p-4">
      <h4 className="mb-3 font-medium text-white">Earthworks Summary</h4>
      {resolved.issues.map(issue => <p role="status" key={issue} className="text-sm text-amber-300">{issue}</p>)}
      {earthworks.issues.map(issue => <p role="status" key={issue} className="text-sm text-amber-300">{issue}</p>)}
      {!!earthworks.rows.length && <>
        <div className="mb-4 flex flex-wrap gap-6 text-sm"><p>Total cut <strong aria-label="Total cut volume">{earthworks.totalCut?.toFixed(3)} m³</strong></p><p>Total fill <strong>{earthworks.totalFill?.toFixed(3)} m³</strong></p></div>
        <div className="max-h-[34rem] overflow-auto"><table className="w-full text-right text-sm tabular-nums">
          <thead><tr>{['Chainage m', 'Ground RL m', 'Design surface RL m', 'Formation RL m', 'Cut m²', 'Fill m²', 'Cut increment m³', 'Fill increment m³', 'Cumulative cut m³', 'Cumulative fill m³', 'Left daylight m', 'Right daylight m'].map(label => <th className="px-3 py-2" key={label}>{label}</th>)}</tr></thead>
          <tbody>{earthworks.rows.map(row => <tr key={row.chainage} className="border-t border-zinc-800">{[row.chainage, row.groundLevel, row.designLevel, row.formationLevel, row.cutArea, row.fillArea, row.cutVolume, row.fillVolume, row.cumulativeCut, row.cumulativeFill, row.leftDaylightOffset, row.rightDaylightOffset].map((value, i) => <td className="px-3 py-2" key={i}>{value.toFixed(3)}</td>)}</tr>)}</tbody>
        </table></div>
      </>}
    </section>
    <section className="rounded-lg border border-zinc-700 p-4">
      <h4 className="mb-3 font-medium text-white">Draft Centreline Coordinate Targets</h4>
      {centreline.issues.map(issue => <p role="status" key={issue} className="text-sm text-amber-300">{issue}</p>)}
      {!!centreline.rows.length && <><p className="mb-3 text-xs text-zinc-400">{centreline.rows.length} targets available in the complete CSV/PDF export. Preview shows the first 100. Coordinates use supplied straight, circular or symmetric transition geometry and the explicitly selected height source; field control, design revision and benchmark checks remain required.</p>
      <div className="overflow-x-auto"><table aria-label="Centreline coordinate targets" className="w-full text-right text-sm"><thead><tr>{['Chainage m','Easting m','Northing m','Surface RL m','Formation RL m','Grid bearing °','Level source'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{centreline.rows.slice(0,100).map(row => <tr key={row.chainage}>{[row.chainage,row.easting,row.northing,row.designLevel,row.formationLevel,row.bearing].map((value,i) => <td key={i} className="p-2">{value == null ? 'Unknown' : value.toFixed(3)}</td>)}<td>{row.levelSource}</td></tr>)}</tbody></table></div></>}
    </section>
    <p className="text-xs text-zinc-400">Ground is interpolated only between measured offsets. The crowned formation uses the supplied road template and subgrade depth; each side finds its own cut/fill daylight. Volumes use average end-area on the actual chainage spans. Supply extra sections at terrain/design changes; material factors, curvature correction and construction acceptance are not inferred.</p>
  </div>
}
