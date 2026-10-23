'use client'

import { useState } from 'react'
import { sightDistanceCheck, checkRadiusCompliance } from '@/lib/computations/roadDesignEngine'
import { CriterionFields, CriterionResult, CriterionSteps, roadNumber, optionalRoadNumber, type RoadField } from './RoadCriteriaForm'

const sightFields: RoadField[] = [
  { key: 'speed', label: 'Design Speed (km/h)' }, { key: 'gradient', label: 'Gradient (%)' },
  { key: 'reference', label: 'Criteria Reference / Revision', text: true },
  { key: 'friction', label: 'Longitudinal Friction Factor' }, { key: 'reaction', label: 'Reaction Time (s)' },
  { key: 'minimumSSD', label: 'Adopted Minimum SSD (m) — optional' },
  { key: 'availableSSD', label: 'Available SSD (m) — optional' },
  { key: 'minimumPSD', label: 'Adopted Minimum PSD (m) — optional' },
  { key: 'availablePSD', label: 'Available PSD (m) — optional' },
]
const radiusFields: RoadField[] = [
  { key: 'radius', label: 'Proposed Radius R (m)' }, { key: 'minimumRadius', label: 'Adopted Minimum Radius (m)' },
]
export default function SightDistanceChecker() {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries([...sightFields, ...radiusFields].map(field => [field.key, ''])))
  const [result, setResult] = useState<ReturnType<typeof sightDistanceCheck> | null>(null)
  const [radiusResult, setRadiusResult] = useState<ReturnType<typeof checkRadiusCompliance> | null>(null)
  const [error, setError] = useState('')
  function edit(key: string, value: string) { setValues(previous => ({ ...previous, [key]: value })); setResult(null); setRadiusResult(null); setError('') }
  const label = (key: string) => [...sightFields, ...radiusFields].find(field => field.key === key)?.label ?? key
  const n = (key: string) => roadNumber(values[key], label(key))
  const optional = (key: string) => optionalRoadNumber(values[key], label(key))
  function compute() {
    setResult(null); setRadiusResult(null); setError('')
    try {
      setResult(sightDistanceCheck({ designSpeed: n('speed'), gradient: n('gradient'),
        proposedSSD: optional('availableSSD'), proposedPSD: optional('availablePSD'),
        criteria: { reference: values.reference, longitudinalFriction: n('friction'), reactionTimeSeconds: n('reaction'), minimumStoppingDistanceM: optional('minimumSSD'), minimumPassingDistanceM: optional('minimumPSD') },
      }))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to assess sight distance.') }
  }
  function compareRadius() {
    setResult(null); setRadiusResult(null); setError('')
    try { setRadiusResult(checkRadiusCompliance(n('radius'), { reference: values.reference, minimumRadiusM: n('minimumRadius') })) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to compare radius.') }
  }
  return <div className="min-w-0 space-y-5">
    <p className="text-sm text-[var(--text-muted)]">Enter adopted braking criteria and the available sight distance to compare. Gradient is positive uphill and negative downhill. A calculated stopping requirement supplies no evidence of the visibility available on site.</p>
    <form noValidate onSubmit={event => { event.preventDefault(); compute() }} className="space-y-4">
      <CriterionFields fields={sightFields} values={values} onChange={edit} prefix="sight" />
      <button type="submit" className="px-5 py-2 bg-[var(--accent)] text-black rounded text-sm font-medium">Check Sight Distance</button>
    </form>
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    {result && <>
      <p role="status" className="text-sm">SSD comparison: {result.ssdStatus}. PSD comparison: {result.psdStatus}. Whole-design compliance is not assessed.</p>
      <CriterionResult rows={[
        ['Criteria reference', result.criteriaReference], ['Criteria verification', 'User-declared; independent verification not recorded'],
        ['Model SSD on Level', `${result.ssdFlat.toFixed(3)} m`], ['Model SSD on Grade', `${result.ssdComputed.toFixed(3)} m`],
        ['Signed Grade Correction', `${result.ssdGradeCorrection.toFixed(3)} m`], ['Required SSD for Comparison', `${result.requiredSSD.toFixed(3)} m`],
        ['Available SSD Result', result.ssdStatus], ['Available PSD Result', result.psdStatus],
        ['Adopted Minimum PSD', result.psdMin === null ? 'Not supplied' : `${result.psdMin.toFixed(3)} m`],
      ]} />
      <p className="text-xs text-[var(--text-muted)]">SSD requires an available distance to assess. PSD requires both available distance and an adopted minimum. Criteria and their reference are user-declared; their applicability and site measurements require professional review.</p>
      <CriterionSteps steps={result.steps} />
    </>}
    <section className="min-w-0 space-y-3 border-t border-[var(--border-color)] pt-5">
      <h3 className="text-sm font-semibold">Radius against adopted minimum</h3>
      <p className="text-sm text-[var(--text-muted)]">Use the reference above and a project minimum applicable to the speed, surface and superelevation. Radius alone cannot establish sight distance: sight lines also depend on obstructions, curve length and lane position.</p>
      <CriterionFields fields={radiusFields} values={values} onChange={edit} prefix="sight" />
      <button type="button" onClick={compareRadius} className="px-5 py-2 bg-[var(--accent)] text-black rounded text-sm font-medium">Compare Radius</button>
      {radiusResult && <>
        <p role="status" className="text-sm">Radius comparison: {radiusResult.status}. Visibility is not assessed.</p>
        <CriterionResult rows={[
          ['Radius Criteria Reference', radiusResult.criteriaReference], ['Adopted Minimum Radius', `${radiusResult.minRadius.toFixed(3)} m`], ['Proposed / Minimum', `${radiusResult.ratio.toFixed(4)}×`],
        ]} />
      </>}
    </section>
  </div>
}
