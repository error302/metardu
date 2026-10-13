'use client'
import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { createSectionalPlanFromUnits, type SectionalUnit, type SectionalPlan } from '@/lib/cadastral/sectionalAreas'
import { engineeringScheduleCsv } from '@/lib/engineering/engineeringScheduleCsv'

interface DraftUnit { id: string; unitNumber: string; floor: string; type: SectionalUnit['type'] | ''; area: string }
function measurement(value: string, label: string): number {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) || !Number.isFinite(Number(value))) throw new RangeError(`${label}: enter a complete finite measured value.`)
  return Number(value)
}

export default function SectionalPropertiesPage() {
  const [buildingName, setBuildingName] = useState('')
  const [lrNumber, setLrNumber] = useState('')
  const [areaBasis, setAreaBasis] = useState('')
  const [units, setUnits] = useState<DraftUnit[]>([])
  const [floorTotals, setFloorTotals] = useState<Record<string, string>>({})
  const [plan, setPlan] = useState<SectionalPlan | null>(null)
  const [error, setError] = useState('')
  const invalidate = () => { setPlan(null); setError('') }
  const update = (id: string, field: keyof Omit<DraftUnit, 'id'>, value: string) => {
    invalidate(); setUnits(previous => previous.map(unit => unit.id === id ? { ...unit, [field]: value } : unit))
  }
  const floors = [...new Set(units.filter(u => u.floor.trim() && Number.isInteger(Number(u.floor))).map(u => Number(u.floor)))].sort((a, b) => a - b)
  const generate = () => {
    invalidate()
    try {
      const observed: SectionalUnit[] = units.map((unit, i) => ({ id: unit.id, unitNumber: unit.unitNumber.trim(),
        floor: measurement(unit.floor, `Unit ${i + 1} floor`), type: unit.type as SectionalUnit['type'], area: measurement(unit.area, `Unit ${i + 1} area`) }))
      setPlan(createSectionalPlanFromUnits(buildingName.trim(), lrNumber.trim(), observed,
        floors.map(floor => ({ floor, totalArea: measurement(floorTotals[floor] ?? '', `Measured total area of floor ${floor}`) }))))
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Review the measured floor and unit records.') }
  }
  const download = () => {
    if (!plan) return
    const csv = engineeringScheduleCsv(['Building', 'Parcel_reference', 'Area_basis_reference', 'Floor', 'Unit_ID', 'Unit_number', 'Supplied_type', 'Measured_unit_area_m2', 'Measured_floor_total_m2', 'Draft_area_based_share_percent'],
      plan.floors.flatMap(floor => floor.units.map(unit => [plan.buildingName, plan.lrNumber, areaBasis || 'NOT SUPPLIED', floor.floor, unit.id, unit.unitNumber, unit.type,
        unit.area, floor.totalArea, plan.participationQuotas.find(q => q.unitId === unit.id)?.quota])))
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'metardu-draft-sectional-areas.csv'; anchor.click()
    URL.revokeObjectURL(url)
  }
  const inputClass = 'min-h-11 w-full rounded border border-zinc-700 bg-zinc-900 p-2 text-white'
  return <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
    <PageHeader title="Sectional Properties" subtitle="Measured floor and unit area schedule" reference="Draft calculation · supplied records and approved survey instructions" />
    <p className="text-sm text-zinc-400">Record measured floor totals and unit areas on the same declared measurement basis. No common-space allowance is added. This tool prepares an area schedule; it does not draw or certify a registrable sectional plan.</p>
    <div className="grid gap-4 sm:grid-cols-3">
      <label className="text-sm text-zinc-400">Building Name<input value={buildingName} onChange={event => { invalidate(); setBuildingName(event.target.value) }} className={inputClass} /></label>
      <label className="text-sm text-zinc-400">LR Number<input value={lrNumber} onChange={event => { invalidate(); setLrNumber(event.target.value) }} className={inputClass} /></label>
      <label className="text-sm text-zinc-400">Area measurement basis / source reference<input value={areaBasis} onChange={event => { invalidate(); setAreaBasis(event.target.value) }} className={inputClass} /></label>
    </div>
    <div className="flex items-center justify-between"><h2 className="font-semibold">Measured units and spaces</h2><button type="button" onClick={() => { invalidate(); setUnits(previous => [...previous, { id: crypto.randomUUID(), unitNumber: '', floor: '', type: '', area: '' }]) }} className="min-h-11 rounded border border-zinc-700 px-4">+ Add Unit</button></div>
    {units.map((unit, i) => <div key={unit.id} className="grid gap-3 rounded border border-zinc-700 p-4 sm:grid-cols-5">
      <label className="text-sm text-zinc-400">Unit number<input aria-label={`Unit ${i + 1} number`} value={unit.unitNumber} onChange={event => update(unit.id, 'unitNumber', event.target.value)} className={inputClass} /></label>
      <label className="text-sm text-zinc-400">Floor<input aria-label={`Unit ${i + 1} floor`} type="number" step="1" value={unit.floor} onChange={event => update(unit.id, 'floor', event.target.value)} className={inputClass} /></label>
      <label className="text-sm text-zinc-400">Declared type<select aria-label={`Unit ${i + 1} type`} value={unit.type} onChange={event => update(unit.id, 'type', event.target.value)} className={inputClass}><option value="">Select type</option>{['residential', 'commercial', 'parking', 'storage', 'common'].map(type => <option key={type} value={type}>{type}</option>)}</select></label>
      <label className="text-sm text-zinc-400">Measured area (m²)<input aria-label={`Unit ${i + 1} area (m²)`} type="number" step="any" min="0" value={unit.area} onChange={event => update(unit.id, 'area', event.target.value)} className={inputClass} /></label>
      <button type="button" aria-label={`Remove unit ${i + 1}`} onClick={() => { invalidate(); setUnits(previous => previous.filter(item => item.id !== unit.id)) }} className="min-h-11 text-red-300">Remove</button>
    </div>)}
    {!!floors.length && <section className="space-y-3"><h2 className="font-semibold">Measured floor totals</h2><p className="text-sm text-zinc-400">Include all spaces on each floor. Listed unit and common-space areas cannot exceed the measured total.</p><div className="grid gap-3 sm:grid-cols-3">{floors.map(floor => <label key={floor} className="text-sm text-zinc-400">Floor {floor} total (m²)<input aria-label={`Measured total area of floor ${floor} (m²)`} type="number" step="any" min="0" value={floorTotals[floor] ?? ''} onChange={event => { invalidate(); setFloorTotals(previous => ({ ...previous, [floor]: event.target.value })) }} className={inputClass} /></label>)}</div></section>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <button type="button" onClick={generate} className="min-h-11 rounded bg-[var(--accent)] px-5 font-semibold text-black">Prepare area schedule</button>
    {plan && <section className="space-y-4">
      <h2 className="font-semibold">Draft measured area schedule</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <p>Measured floor total: {plan.totalArea.toFixed(3)} m²</p><p>Private-unit area: {plan.totalUnitArea.toFixed(3)} m²</p><p aria-label="Non-unit floor area">Non-unit floor area: {plan.totalCommonArea.toFixed(3)} m²</p>
      </div>
      <p className="text-sm text-zinc-400">Non-unit area is the measured floor total minus supplied private-unit areas. Its legal/common-property classification is not verified. Shares below are based only on supplied unit areas; they are not approved ownership quotas. Area basis: {areaBasis || 'not supplied'}.</p>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Floor', 'Unit', 'Type', 'Area (m²)', 'Draft area share (%)'].map(header => <th key={header} className="border-b border-zinc-700 p-2 text-left">{header}</th>)}</tr></thead><tbody>{plan.floors.flatMap(floor => floor.units.map(unit => <tr key={unit.id}><td className="p-2">{floor.floor}</td><td className="p-2">{unit.unitNumber}</td><td className="p-2">{unit.type}</td><td className="p-2">{unit.area.toFixed(3)}</td><td className="p-2">{plan.participationQuotas.find(q => q.unitId === unit.id)?.quota.toFixed(4) ?? 'Not applicable'}</td></tr>))}</tbody></table></div>
      <button type="button" onClick={download} className="min-h-11 rounded border border-zinc-700 px-4">Download area schedule CSV</button>
    </section>}
  </div>
}
