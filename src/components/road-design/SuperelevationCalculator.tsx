'use client'

import { useState } from 'react'
import { superelevationDesign } from '@/lib/computations/roadDesignEngine'
import { CriterionFields, CriterionResult, CriterionSteps, roadNumber, type RoadField } from './RoadCriteriaForm'

const geometry: RoadField[] = [
  { key: 'speed', label: 'Design Speed (km/h)' }, { key: 'radius', label: 'Curve Radius R (m)' },
  { key: 'lanes', label: 'Number of Lanes Rotated' }, { key: 'width', label: 'Lane Width (m)' },
  { key: 'initial', label: 'Initial Crossfall (%)' }, { key: 'provided', label: 'Provided Superelevation (%)' },
]
const criteria: RoadField[] = [
  { key: 'reference', label: 'Criteria Reference / Revision', text: true },
  { key: 'friction', label: 'Lateral Friction Factor' },
  { key: 'maximum', label: 'Maximum Superelevation (%)' },
  { key: 'relative', label: 'Maximum Relative Gradient (%)' },
]
export default function SuperelevationCalculator() {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries([...geometry, ...criteria].map(field => [field.key, ''])))
  const [result, setResult] = useState<ReturnType<typeof superelevationDesign> | null>(null)
  const [error, setError] = useState('')
  function edit(key: string, value: string) { setValues(previous => ({ ...previous, [key]: value })); setResult(null); setError('') }
  function compute() {
    setResult(null); setError('')
    try {
      const n = (key: string) => roadNumber(values[key], [...geometry, ...criteria].find(field => field.key === key)?.label ?? key)
      setResult(superelevationDesign({
        designSpeed: n('speed'), radius: n('radius'), numLanes: n('lanes'), laneWidth: n('width'),
        initialCrossfall: n('initial') / 100, providedSuperelevation: n('provided') / 100,
        criteria: { reference: values.reference, lateralFriction: n('friction'), maximumSuperelevation: n('maximum') / 100, maximumRelativeGradient: n('relative') / 100 },
      }))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to assess the supplied crossfall.') }
  }
  return <div className="min-w-0 space-y-5">
    <p className="text-sm text-[var(--text-muted)]">Compare the provided banking with lateral demand and adopted limits. Enter the width actually rotated about the design axis. Adverse initial crossfall is negative; inward banking is positive.</p>
    <form noValidate onSubmit={event => { event.preventDefault(); compute() }} className="space-y-5">
      <CriterionFields fields={geometry} values={values} onChange={edit} prefix="banking" />
      <fieldset className="min-w-0 space-y-3 border border-[var(--border-color)] p-3 rounded"><legend className="px-1 text-sm">Adopted project criteria</legend>
        <p className="text-xs text-[var(--text-muted)]">Use side friction for banking. Relative gradient is the longitudinal slope of the pavement edge relative to the rotation axis. Enter 0.5 for a 0.5% relative gradient.</p>
        <CriterionFields fields={criteria} values={values} onChange={edit} prefix="banking" />
      </fieldset>
      <button type="submit" className="px-5 py-2 bg-[var(--accent)] text-black rounded text-sm font-medium">Compute Superelevation</button>
    </form>
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    {!result && !error && <p className="text-sm text-[var(--text-muted)]">Supply the geometry and criteria, then compute to show current results.</p>}
    {result && <>
      <p role="status" className="text-sm">Banking checks: {result.status === 'PASS' ? 'MEET' : 'DO NOT MEET'} supplied friction and banking limit. Whole-design compliance is not assessed.</p>
      <CriterionResult rows={[
        ['Criteria reference', result.criteriaReference], ['Criteria verification', 'User-declared; independent verification not recorded'],
        ['Minimum Banking from Lateral Demand', `${(result.requiredE * 100).toFixed(4)}%`],
        ['Provided Superelevation', `${(result.designE * 100).toFixed(4)}%`],
        ['Within Declared Banking Limit', result.checks.withinSuperelevationLimit ? 'YES' : 'NO'],
        ['Lateral Demand Met', result.checks.lateralDemandMet ? 'YES' : 'NO'],
        ['Rotated Width', `${result.rotatedWidth.toFixed(3)} m`],
        ['Crossfall Rotation Length', `${result.transitionLength.toFixed(3)} m`],
        ['Equilibrium Radius at Declared Limit', `${result.minimumRadiusAtLimit.toFixed(3)} m`],
      ]} />
      <p className="text-xs text-[var(--text-muted)]">Rotation length uses width × absolute crossfall change / relative gradient. This checks that one constraint; spiral comfort, pavement-width adjustments, drainage, sight lines and project approval require their own checks. Superelevation is retained as entered.</p>
      <CriterionSteps steps={result.steps} />
    </>}
  </div>
}
