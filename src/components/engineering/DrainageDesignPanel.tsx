'use client'

import { useState } from 'react'
import { manningChannelCapacity, manningPipeCapacity, rationalMethodCatchment, STANDARD_PIPE_SIZES } from '@/lib/engineering/drainageDesign'
import { downloadRowsCsv } from '@/components/compute/csvDownload'

type Tab = 'pipe' | 'catchment' | 'channel'
type PipeRow = { diameterMm: number; capacityLs: number; velocityMs: number; meetsFlow: boolean }
const numberFrom = (text: string) => text.trim() !== '' && Number.isFinite(Number(text)) ? Number(text) : undefined
const inputClass = 'w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500'

function NumericField({ label, value, onChange, step = 'any', hint }: { label: string; value: string; onChange: (value: string) => void; step?: string; hint?: string }) {
  const id = `drainage-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return <label htmlFor={id} className="block text-xs text-zinc-400">{label}<input id={id} type="number" step={step} value={value} onChange={event => onChange(event.target.value)} className={`${inputClass} mt-1`} />{hint && <span className="mt-1 block text-[11px] text-zinc-500">{hint}</span>}</label>
}

export default function DrainageDesignPanel() {
  const [tab, setTab] = useState<Tab>('pipe')
  const [pipeInputs, setPipeInputs] = useState({ flowLs: '', slopePercent: '', manningN: '' })
  const [pipeRows, setPipeRows] = useState<PipeRow[]>([])
  const [pipeError, setPipeError] = useState('')
  const [catchmentInputs, setCatchmentInputs] = useState({ areaHa: '', coefficient: '', intensityMmHr: '' })
  const [catchmentResult, setCatchmentResult] = useState<ReturnType<typeof rationalMethodCatchment> | null>(null)
  const [catchmentError, setCatchmentError] = useState('')
  const [channelInputs, setChannelInputs] = useState({ bedWidthM: '', sideSlope: '', manningN: '', slopePercent: '', flowDepthM: '' })
  const [channelResult, setChannelResult] = useState<ReturnType<typeof manningChannelCapacity> | null>(null)
  const [channelError, setChannelError] = useState('')

  const calculatePipe = () => {
    const flowLs = numberFrom(pipeInputs.flowLs)
    const slopePercent = numberFrom(pipeInputs.slopePercent)
    const manningN = numberFrom(pipeInputs.manningN)
    const issues: string[] = []
    if (flowLs === undefined || flowLs <= 0) issues.push('Enter a finite design flow greater than zero.')
    if (slopePercent === undefined || slopePercent <= 0) issues.push('Enter a finite positive pipe slope in the flow direction.')
    if (manningN === undefined || manningN <= 0) issues.push('Enter a finite positive Manning roughness value from the specified pipe product.')
    setPipeError(issues.join(' '))
    if (issues.length || flowLs === undefined || slopePercent === undefined || manningN === undefined) {
      setPipeRows([])
      return
    }
    const rows = STANDARD_PIPE_SIZES.map(diameterMm => {
      const result = manningPipeCapacity({ diameter: diameterMm, manningN, slope: slopePercent / 100 })
      return { diameterMm, capacityLs: result.fullBoreCapacity * 1000, velocityMs: result.fullBoreVelocity, meetsFlow: result.fullBoreCapacity * 1000 >= flowLs }
    })
    setPipeRows(rows)
  }

  const calculateCatchment = () => {
    const area = numberFrom(catchmentInputs.areaHa)
    const runoffCoefficient = numberFrom(catchmentInputs.coefficient)
    const rainfallIntensity = numberFrom(catchmentInputs.intensityMmHr)
    const issues: string[] = []
    if (area === undefined || area <= 0) issues.push('Enter a finite catchment area greater than zero.')
    if (runoffCoefficient === undefined || runoffCoefficient <= 0 || runoffCoefficient > 1) issues.push('Enter the project runoff coefficient C, greater than zero and no more than one.')
    if (rainfallIntensity === undefined || rainfallIntensity <= 0) issues.push('Enter rainfall intensity from the approved project storm analysis.')
    setCatchmentError(issues.join(' '))
    if (issues.length || area === undefined || runoffCoefficient === undefined || rainfallIntensity === undefined) {
      setCatchmentResult(null)
      return
    }
    setCatchmentResult(rationalMethodCatchment({ area, runoffCoefficient, rainfallIntensity }))
  }

  const calculateChannel = () => {
    const bedWidth = numberFrom(channelInputs.bedWidthM)
    const sideSlope = numberFrom(channelInputs.sideSlope)
    const manningN = numberFrom(channelInputs.manningN)
    const slopePercent = numberFrom(channelInputs.slopePercent)
    const flowDepth = numberFrom(channelInputs.flowDepthM)
    const issues: string[] = []
    if (bedWidth === undefined || bedWidth <= 0) issues.push('Enter a finite bed width greater than zero.')
    if (sideSlope === undefined || sideSlope < 0) issues.push('Enter a finite non-negative side slope (horizontal to vertical).')
    if (manningN === undefined || manningN <= 0) issues.push('Enter a finite positive channel Manning roughness from the specified lining.')
    if (slopePercent === undefined || slopePercent <= 0) issues.push('Enter a finite positive bed slope in the flow direction.')
    if (flowDepth === undefined || flowDepth <= 0) issues.push('Enter a finite flow depth greater than zero.')
    setChannelError(issues.join(' '))
    if (issues.length || bedWidth === undefined || sideSlope === undefined || manningN === undefined || slopePercent === undefined || flowDepth === undefined) {
      setChannelResult(null)
      return
    }
    setChannelResult(manningChannelCapacity({ bedWidth, sideSlope, manningN, slope: slopePercent / 100, flowDepth }))
  }

  const tabs: Array<[Tab, string]> = [['pipe', 'Pipe capacity'], ['catchment', 'Catchment flow'], ['channel', 'Open channel']]
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-700 bg-zinc-900 p-5">
        <h3 className="text-lg font-semibold text-white">Hydraulic screening calculators</h3>
        <p className="mt-1 text-sm text-zinc-400">These tools compute from the inputs you provide. They do not choose a design storm, infer field levels, check a drainage network/HGL, or certify standards compliance.</p>
      </section>

      <div role="tablist" aria-label="Drainage screening calculators" className="flex gap-1 overflow-x-auto rounded-lg bg-zinc-800 p-1">
        {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium ${tab === id ? 'bg-zinc-700 text-white shadow' : 'text-zinc-400 hover:text-white'}`}>{label}</button>)}
      </div>

      {tab === 'pipe' && <section className="space-y-5 rounded-xl border border-zinc-700 bg-zinc-900 p-5">
        <div><h4 className="font-medium text-white">Circular pipe full-bore capacity</h4><p className="mt-1 text-sm text-zinc-400">Compare entered flow with calculated full-bore capacities for the listed internal diameters. Passing this comparison alone does not size or approve a pipe.</p></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NumericField label="Design flow (L/s)" value={pipeInputs.flowLs} onChange={value => { setPipeInputs(current => ({ ...current, flowLs: value })); setPipeRows([]); setPipeError('') }} />
          <NumericField label="Slope (%)" value={pipeInputs.slopePercent} onChange={value => { setPipeInputs(current => ({ ...current, slopePercent: value })); setPipeRows([]); setPipeError('') }} hint="Use a positive downstream fall." />
          <NumericField label="Manning n" value={pipeInputs.manningN} onChange={value => { setPipeInputs(current => ({ ...current, manningN: value })); setPipeRows([]); setPipeError('') }} hint="Confirm against the selected pipe product." />
        </div>
        <button type="button" onClick={calculatePipe} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">Calculate listed capacities</button>
        {pipeError && <p role="alert" className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">{pipeError}</p>}
        {pipeRows.length > 0 && <>
          <div className="overflow-x-auto rounded border border-zinc-800"><table className="w-full min-w-[520px] text-sm"><thead className="bg-zinc-800 text-zinc-300"><tr><th className="px-3 py-2 text-right">Internal diameter (mm)</th><th className="px-3 py-2 text-right">Full-bore capacity (L/s)</th><th className="px-3 py-2 text-right">Full-bore velocity (m/s)</th><th className="px-3 py-2 text-left">Flow comparison</th></tr></thead><tbody>{pipeRows.map(row => <tr key={row.diameterMm} className="border-t border-zinc-800"><td className="px-3 py-2 text-right">{row.diameterMm}</td><td className="px-3 py-2 text-right">{row.capacityLs.toFixed(2)}</td><td className="px-3 py-2 text-right">{row.velocityMs.toFixed(3)}</td><td className="px-3 py-2">{row.meetsFlow ? 'Calculated capacity ≥ entered flow' : 'Calculated capacity < entered flow'}</td></tr>)}</tbody></table></div>
          <button type="button" onClick={() => downloadRowsCsv('metardu-pipe-capacity-screen.csv', ['Internal_diameter_mm', 'Full_bore_capacity_L_s', 'Full_bore_velocity_m_s', 'Capacity_at_least_entered_flow'], pipeRows.map(row => [row.diameterMm, row.capacityLs, row.velocityMs, row.meetsFlow]))} className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800">Download capacity CSV</button>
          <p className="text-xs text-zinc-500">Full-bore circular flow only; no partial-flow depth, inlet/outlet losses, HGL, surcharge, cover, structural loading or product compatibility is checked.</p>
        </>}
      </section>}

      {tab === 'catchment' && <section className="space-y-5 rounded-xl border border-zinc-700 bg-zinc-900 p-5">
        <div><h4 className="font-medium text-white">Rational-method flow estimate</h4><p className="mt-1 text-sm text-zinc-400">Q = C × I × A / 360. Supply C and rainfall intensity from the project’s approved hydrology and design-storm basis; this calculator does not select a return period or time of concentration.</p></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NumericField label="Catchment area (ha)" value={catchmentInputs.areaHa} onChange={value => { setCatchmentInputs(current => ({ ...current, areaHa: value })); setCatchmentResult(null); setCatchmentError('') }} />
          <NumericField label="Runoff coefficient C" value={catchmentInputs.coefficient} onChange={value => { setCatchmentInputs(current => ({ ...current, coefficient: value })); setCatchmentResult(null); setCatchmentError('') }} hint="Project-selected value, between 0 and 1." />
          <NumericField label="Rainfall intensity I (mm/hr)" value={catchmentInputs.intensityMmHr} onChange={value => { setCatchmentInputs(current => ({ ...current, intensityMmHr: value })); setCatchmentResult(null); setCatchmentError('') }} />
        </div>
        <button type="button" onClick={calculateCatchment} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">Calculate flow</button>
        {catchmentError && <p role="alert" className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">{catchmentError}</p>}
        {catchmentResult && <div className="space-y-3 rounded border border-zinc-800 p-4"><p className="text-sm text-zinc-300">Peak flow: <strong className="text-white">{catchmentResult.peakFlow.toFixed(5)} m³/s ({(catchmentResult.peakFlow * 1000).toFixed(2)} L/s)</strong></p><p className="text-sm text-zinc-400">Effective area C × A: {catchmentResult.effectiveArea.toFixed(3)} ha</p><button type="button" onClick={() => downloadRowsCsv('metardu-rational-method-flow.csv', ['Catchment_area_ha', 'Runoff_coefficient_C', 'Rainfall_intensity_mm_hr', 'Peak_flow_m3_s', 'Effective_area_ha'], [[catchmentResult.catchmentArea, catchmentInputs.coefficient, catchmentInputs.intensityMmHr, catchmentResult.peakFlow, catchmentResult.effectiveArea]])} className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800">Download flow CSV</button></div>}
      </section>}

      {tab === 'channel' && <section className="space-y-5 rounded-xl border border-zinc-700 bg-zinc-900 p-5">
        <div><h4 className="font-medium text-white">Trapezoidal open-channel capacity</h4><p className="mt-1 text-sm text-zinc-400">Compute Manning discharge and velocity from entered section geometry, roughness, bed slope and flow depth.</p></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <NumericField label="Bed width (m)" value={channelInputs.bedWidthM} onChange={value => { setChannelInputs(current => ({ ...current, bedWidthM: value })); setChannelResult(null); setChannelError('') }} />
          <NumericField label="Side slope (H:V)" value={channelInputs.sideSlope} onChange={value => { setChannelInputs(current => ({ ...current, sideSlope: value })); setChannelResult(null); setChannelError('') }} />
          <NumericField label="Manning n" value={channelInputs.manningN} onChange={value => { setChannelInputs(current => ({ ...current, manningN: value })); setChannelResult(null); setChannelError('') }} hint="Confirm against the channel lining." />
          <NumericField label="Bed slope (%)" value={channelInputs.slopePercent} onChange={value => { setChannelInputs(current => ({ ...current, slopePercent: value })); setChannelResult(null); setChannelError('') }} />
          <NumericField label="Flow depth (m)" value={channelInputs.flowDepthM} onChange={value => { setChannelInputs(current => ({ ...current, flowDepthM: value })); setChannelResult(null); setChannelError('') }} />
        </div>
        <button type="button" onClick={calculateChannel} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">Calculate channel capacity</button>
        {channelError && <p role="alert" className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">{channelError}</p>}
        {channelResult && <div className="space-y-3 rounded border border-zinc-800 p-4"><div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><p>Area: <strong>{channelResult.flowArea.toFixed(4)} m²</strong></p><p>Wetted perimeter: <strong>{channelResult.wettedPerimeter.toFixed(4)} m</strong></p><p>Velocity: <strong>{channelResult.velocity.toFixed(3)} m/s</strong></p><p>Discharge: <strong>{channelResult.discharge.toFixed(5)} m³/s</strong></p></div><button type="button" onClick={() => downloadRowsCsv('metardu-channel-capacity.csv', ['Flow_area_m2', 'Wetted_perimeter_m', 'Hydraulic_radius_m', 'Flow_depth_m', 'Velocity_m_s', 'Discharge_m3_s', 'Top_width_m'], [[channelResult.flowArea, channelResult.wettedPerimeter, channelResult.hydraulicRadius, channelInputs.flowDepthM, channelResult.velocity, channelResult.discharge, channelResult.topWidth]])} className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800">Download channel CSV</button><p className="text-xs text-zinc-500">No freeboard, erosion, sediment, lining, transition or downstream control check is included.</p></div>}
      </section>}
    </div>
  )
}
