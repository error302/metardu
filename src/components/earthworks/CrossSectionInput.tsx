'use client';

import { useState, useRef, Fragment, useId } from 'react'
import { computeCrossSection, computeEarthwork, parseEarthworkCSV, parseEarthworkNumber, type CrossSectionInput, type CrossSectionComputed, type RoadTemplate, type EarthworkResult } from '@/lib/computations/earthworksEngine'
import CrossSectionDrawing from './CrossSectionDrawing'
import EarthworkQuantitiesTable from './EarthworkQuantitiesTable'
import MassHaulDiagram from './MassHaulDiagram'
import { printEarthworksBoQ, type EarthworksBoQInput } from '@/lib/print/earthworksBoQ'
import { PrintMetaPanel, type PrintMeta } from '@/components/shared/PrintMetaPanel'

const DEFAULT_TEMPLATE: RoadTemplate = {
  carriagewayWidth: 7.0,
  shoulderWidth: 1.5,
  camber: 2.5,
  cutSlopeH: 1,
  fillSlopeH: 1.5,
}

interface SectionRow {
  id: string
  chainageKm: string
  chainageM: string
  clRL: string
  formRL: string
  leftShots: Array<{ off: string; rl: string }>
  rightShots: Array<{ off: string; rl: string }>
}

const EMPTY_ROW = (): SectionRow => ({
  id: crypto.randomUUID(),
  chainageKm: '0',
  chainageM: '0',
  clRL: '',
  formRL: '',
  leftShots: [{ off: '', rl: '' }, { off: '', rl: '' }],
  rightShots: [{ off: '', rl: '' }, { off: '', rl: '' }],
})

export default function EarthworksCalculator() {
  const uid = useId()
  const [sections, setSections] = useState<SectionRow[]>([EMPTY_ROW()])
  const [template, setTemplate] = useState<RoadTemplate>(DEFAULT_TEMPLATE)
  const [shrinkage, setShrinkage] = useState('')
  const [computedSections, setComputedSections] = useState<CrossSectionComputed[]>([])
  const [earthworkResult, setEarthworkResult] = useState<EarthworkResult | null>(null)
  const [activeSection, setActiveSection] = useState(0)
  const [csvError, setCsvError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [printMeta, setPrintMeta] = useState<PrintMeta>({
    projectName: '', clientName: '', surveyorName: '', surveyorEmail: '', clientEmail: '', regNo: '', iskNo: '',
    date: new Date().toISOString().split('T')[0], instrument: '', weather: '', observer: '', submissionNo: '',
  })
  const [roadName, setRoadName] = useState('')
  const [references, setReferences] = useState({ horizontalCrs: '', verticalDatum: '', designRevision: '' })

  function invalidate() {
    setComputedSections([]); setEarthworkResult(null); setActiveSection(0)
  }
  function toInput(row: SectionRow): CrossSectionInput {
    const value = (text: string, label: string) => parseEarthworkNumber(text, label)
    const km = value(row.chainageKm, 'Chainage kilometres'), metres = value(row.chainageM, 'Chainage metres')
    if (!Number.isInteger(km) || km < 0 || metres < 0 || metres >= 1000) throw new RangeError('Use whole non-negative kilometres and metres below 1000.')
    const shots = (list: SectionRow['leftShots'], direction: number) => list.filter(s => s.off.trim() || s.rl.trim()).map(s => {
      const offset = value(s.off, 'Shot offset')
      if (offset <= 0) throw new RangeError('Enter a positive offset distance for the named side.')
      return { offset: direction * offset, rl: value(s.rl, 'Shot ground RL') }
    })
    return { chainage: km * 1000 + metres, centrelineRL: value(row.clRL, 'Centre ground RL'), formationRL: value(row.formRL, 'Approved formation RL'),
      leftShots: shots(row.leftShots, -1), rightShots: shots(row.rightShots, 1) }
  }
  function compute() {
    invalidate(); setCsvError('')
    try {
      if (!sections.length) throw new RangeError('Add at least one measured section.')
      const inputs = sections.map(toInput).sort((a, b) => a.chainage - b.chainage)
      const computed = inputs.map(s => computeCrossSection(s, template))
      const ew = computeEarthwork(computed, shrinkage.trim() ? parseEarthworkNumber(shrinkage, 'Material factor') : undefined)
      setComputedSections(computed); setEarthworkResult(ew)
    } catch (error) { setCsvError(error instanceof Error ? error.message : 'Review the measured sections.') }
  }

  function handlePrintBoQ() {
    if (!earthworkResult || computedSections.length === 0) return
    const inp: EarthworksBoQInput = {
      sections: computedSections,
      result: earthworkResult,
      template,
      roadName,
      ...references,
      startChainage: '',
      endChainage: '',
      meta: { ...printMeta, title: 'Earthworks Bill of Quantities' },
    }
    printEarthworksBoQ(inp)
  }

  function addRow() {
    invalidate()
    setSections(prev => [...prev, EMPTY_ROW()])
  }

  function removeRow(id: string) {
    invalidate()
    setSections(prev => prev.filter((r) => r.id !== id))
  }

  function updateRow(id: string, field: keyof SectionRow, value: unknown) {
    invalidate()
    setSections(prev => prev.map((r) => r.id === id ? { ...r, [field]: value } : r))
  }

  function updateShot(id: string, side: 'left' | 'right', idx: number, field: 'off' | 'rl', value: string) {
    invalidate()
    setSections(prev => prev.map((r) => {
      if (r.id !== id) return r
      const shots = [...r[(side + 'Shots') as 'leftShots' | 'rightShots']]
      shots[idx] = { ...shots[idx], [field]: value }
      return { ...r, [side + 'Shots']: shots }
    }))
  }

  function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvError('')
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const text = ev.target?.result as string
        const parsed = parseEarthworkCSV(text)
        if (parsed.length === 0) { setCsvError('No valid sections found in CSV'); return }
          const rows: SectionRow[] = parsed.map((s) => {
            const km = Math.floor(s.chainage / 1000)
            const m = s.chainage % 1000
            return {
              id: crypto.randomUUID(),
              chainageKm: String(km),
              chainageM: m.toFixed(3),
              clRL: s.centrelineRL.toFixed(3),
              formRL: s.formationRL.toFixed(3),
              leftShots: s.leftShots.map((sh) => ({ off: Math.abs(sh.offset).toFixed(3), rl: sh.rl.toFixed(3) })),
              rightShots: s.rightShots.map((sh) => ({ off: sh.offset.toFixed(3), rl: sh.rl.toFixed(3) })),
            }
          })
        invalidate(); setSections(rows)
      } catch (error) {
        setCsvError(error instanceof Error ? error.message : 'Failed to parse CSV. Check format.')
      }
    }
    reader.onerror = () => setCsvError('The selected CSV could not be read.'); reader.readAsText(file)
  }

  function fmtCh(ch: number) {
    const km = Math.floor(ch / 1000)
    const m = ch % 1000
    return km > 0 ? `${km}+${m.toFixed(3)}` : `${m.toFixed(3)}`
  }

  return (
    <div className="space-y-8">
      {/* Template Settings */}
      <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Road Template Settings</h3>
        <p className="text-xs text-[var(--text-muted)] mb-3">Starting values are examples. Enter the approved design, including shoulder crossfall. Formation RL is the excavation/embankment target, not the finished surface. Blank material factor means unadjusted geometric volumes.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Carriageway Width (m)', key: 'carriagewayWidth' as keyof RoadTemplate },
            { label: 'Shoulder Width (m)', key: 'shoulderWidth' as keyof RoadTemplate },
            { label: 'Shoulder Crossfall (%)', key: 'shoulderCrossfall' as keyof RoadTemplate },
            { label: 'Camber (%)', key: 'camber' as keyof RoadTemplate },
            { label: 'Cut Slope H:V', key: 'cutSlopeH' as keyof RoadTemplate },
            { label: 'Fill Slope H:V', key: 'fillSlopeH' as keyof RoadTemplate },
          ].map(({ label, key }) => (
            <div key={key}>
              <label htmlFor={`${uid}-tpl-${key}`} className="block text-xs text-[var(--text-muted)] mb-1">{label}</label>
              <input id={`${uid}-tpl-${key}`}
                type="number"
                step="0.01"
                value={Number.isFinite(template[key]) ? template[key] : ''}
                onChange={e => { invalidate(); setTemplate(prev => ({ ...prev, [key]: e.target.value.trim() ? Number(e.target.value) : NaN })) }}
                className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1" htmlFor="shrinkage-factor">Material Conversion Factor (optional)</label>
            <input id="shrinkage-factor" type="number" step="0.01" value={shrinkage} onChange={e => { invalidate(); setShrinkage(e.target.value) }}
              className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm" />
          </div>
        </div>
      </div>

      {/* Data Entry Table */}
      <div className="overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Cross Section Data</h3>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
            <button onClick={() => fileRef.current?.click()} className="px-3 py-1.5 text-xs border border-[var(--border-color)] rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
              Import CSV
            </button>
            <button onClick={addRow} className="px-3 py-1.5 text-xs bg-[var(--accent)] text-black rounded hover:opacity-90">
              + Add Section
            </button>
            <button onClick={compute} className="px-4 py-1.5 text-xs bg-[var(--accent)] text-black rounded font-medium hover:opacity-90">
              Compute All
            </button>
            {earthworkResult && (
              <button onClick={handlePrintBoQ} className="px-4 py-1.5 text-xs bg-amber-600 text-black rounded font-medium hover:bg-amber-700">
                 Print BoQ
              </button>
            )}
          </div>
        </div>
        {csvError && <p role="alert" className="text-xs text-red-400 mb-2">{csvError}</p>}
        <p className="text-xs text-[var(--text-muted)] mb-2">
          Format: Chainage (km), Chainage (m), CL RL, Form RL, then L4_off, L4_rl, L3_off, L3_rl, L2_off, L2_rl, L1_off, L1_rl, R1_off, R1_rl, R2_off, R2_rl, R3_off, R3_rl, R4_off, R4_rl
        </p>
        <table className="w-full text-xs font-mono border-collapse">
          <thead>
            <tr className="bg-[var(--bg-tertiary)]">
              <th className="px-2 py-2 text-left border border-[var(--border-color)] text-[var(--text-muted)] font-medium">Ch km</th>
              <th className="px-2 py-2 text-left border border-[var(--border-color)] text-[var(--text-muted)] font-medium">Ch m</th>
              <th className="px-2 py-2 text-left border border-[var(--border-color)] text-[var(--text-muted)] font-medium">CL RL</th>
              <th className="px-2 py-2 text-left border border-[var(--border-color)] text-[var(--text-muted)] font-medium">Form RL</th>
              <th className="px-2 py-2 text-left border border-[var(--border-color)] text-[var(--text-muted)] font-medium" colSpan={8}>Left Shots (outer→CL)</th>
              <th className="px-2 py-2 text-left border border-[var(--border-color)] text-[var(--text-muted)] font-medium" colSpan={8}>Right Shots (CL→outer)</th>
              <th className="px-2 py-2 border border-[var(--border-color)]"></th>
            </tr>
            <tr className="bg-[color-mix(in_srgb,var(--bg-tertiary)_50%,transparent)]">
              <th className="border border-[var(--border-color)]"></th>
              <th className="border border-[var(--border-color)]"></th>
              <th className="border border-[var(--border-color)]"></th>
              <th className="border border-[var(--border-color)]"></th>
              {['L1 Off', 'L1 RL', 'L2 Off', 'L2 RL', 'L3 Off', 'L3 RL', 'L4 Off', 'L4 RL', 'R1 Off', 'R1 RL', 'R2 Off', 'R2 RL', 'R3 Off', 'R3 RL', 'R4 Off', 'R4 RL'].map((h, i) => (
                <th key={`${h}-${i}`} className="px-2 py-1 border border-[var(--border-color)] text-[var(--text-muted)] font-medium text-[10px]">{h}</th>
              ))}
              <th className="border border-[var(--border-color)]"></th>
            </tr>
          </thead>
          <tbody>
            {sections.map((row) => (
              <tr key={row.id} className="hover:bg-[color-mix(in_srgb,var(--bg-tertiary)_30%,transparent)]">
                <td className="px-1 py-1 border border-[color-mix(in_srgb,var(--border-color)_50%,transparent)]"><input aria-label="Ch km" value={row.chainageKm} onChange={e => updateRow(row.id, 'chainageKm', e.target.value)} type="number" min="0" className="w-full px-1 py-1 bg-transparent text-[var(--text-primary)]" /></td>
                <td className="px-1 py-1 border border-[color-mix(in_srgb,var(--border-color)_50%,transparent)]"><input aria-label="Ch m" value={row.chainageM} onChange={e => updateRow(row.id, 'chainageM', e.target.value)} type="number" min="0" className="w-full px-1 py-1 bg-transparent text-[var(--text-primary)]" /></td>
                <td className="px-1 py-1 border border-[color-mix(in_srgb,var(--border-color)_50%,transparent)]"><input aria-label="CL RL" value={row.clRL} onChange={e => updateRow(row.id, 'clRL', e.target.value)} type="number" step="0.001" className="w-full px-1 py-1 bg-transparent text-[var(--text-primary)]" /></td>
                <td className="px-1 py-1 border border-[color-mix(in_srgb,var(--border-color)_50%,transparent)]"><input aria-label="Form RL" value={row.formRL} onChange={e => updateRow(row.id, 'formRL', e.target.value)} type="number" step="0.001" className="w-full px-1 py-1 bg-transparent text-[var(--text-primary)]" /></td>
                {[0, 1, 2, 3].map((i) => (
                  <Fragment key={'ls' + i}>
                    <td className="px-1 py-1 border border-[color-mix(in_srgb,var(--border-color)_50%,transparent)]"><input value={row.leftShots[i]?.off || ''} onChange={e => updateShot(row.id, 'left', i, 'off', e.target.value)} type="number" step="0.001" className="w-14 px-1 py-1 bg-transparent text-[var(--text-primary)]" aria-label="Left offset (m)" placeholder="Off" /></td>
                    <td className="px-1 py-1 border border-[color-mix(in_srgb,var(--border-color)_50%,transparent)]"><input value={row.leftShots[i]?.rl || ''} onChange={e => updateShot(row.id, 'left', i, 'rl', e.target.value)} type="number" step="0.001" className="w-14 px-1 py-1 bg-transparent text-[var(--text-primary)]" aria-label="Left RL (m)" placeholder="RL" /></td>
                  </Fragment>
                ))}
                {[0, 1, 2, 3].map((i) => (
                  <Fragment key={'rs' + i}>
                    <td className="px-1 py-1 border border-[color-mix(in_srgb,var(--border-color)_50%,transparent)]"><input value={row.rightShots[i]?.off || ''} onChange={e => updateShot(row.id, 'right', i, 'off', e.target.value)} type="number" step="0.001" className="w-14 px-1 py-1 bg-transparent text-[var(--text-primary)]" aria-label="Right offset (m)" placeholder="Off" /></td>
                    <td className="px-1 py-1 border border-[color-mix(in_srgb,var(--border-color)_50%,transparent)]"><input value={row.rightShots[i]?.rl || ''} onChange={e => updateShot(row.id, 'right', i, 'rl', e.target.value)} type="number" step="0.001" className="w-14 px-1 py-1 bg-transparent text-[var(--text-primary)]" aria-label="Right RL (m)" placeholder="RL" /></td>
                  </Fragment>
                ))}
                <td className="px-1 py-1 border border-[color-mix(in_srgb,var(--border-color)_50%,transparent)]">
                  <button onClick={() => removeRow(row.id)} className="text-red-400 hover:text-red-300 text-xs px-1">[x]</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Results */}
      {computedSections.length > 0 && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              ['Total Sections', String(computedSections.length)],
              ['Total Cut (End Area)', `${earthworkResult?.totalCutEndArea.toFixed(2) || 0} m³`],
              ['Total Fill (End Area)', `${earthworkResult?.totalFillEndArea.toFixed(2) || 0} m³`],
              ['Adjusted Cut (× Shrinkage)', earthworkResult?.adjustedCut == null ? 'Factor not supplied' : `${earthworkResult.adjustedCut.toFixed(2)} m³`],
              ['Net Balance', `${((earthworkResult?.adjustedCut ?? earthworkResult?.totalCutEndArea ?? 0) - (earthworkResult?.totalFillEndArea ?? 0)).toFixed(2)} m³`],
            ].map(([label, value]) => (
              <div key={label} className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded p-3">
                <p className="text-xs text-[var(--text-muted)]">{label}</p>
                <p className="text-base font-mono text-[var(--text-primary)]">{value}</p>
              </div>
            ))}
          </div>

          {/* Print Header + Print BoQ */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs text-[var(--text-muted)] mb-1" htmlFor="road-name-description">Road Name / Description</label>
                <input id="road-name-description" value={roadName} onChange={e => setRoadName(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm"
 placeholder="e.g. Kitengela Access Road — A104" />
              </div>
              <button onClick={handlePrintBoQ}
                className="px-5 py-2 bg-amber-600 text-black rounded-lg font-medium hover:bg-amber-700 text-sm whitespace-nowrap mt-5">
                 Print Earthworks BoQ
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {([{ key: 'horizontalCrs', label: 'Declared horizontal CRS' }, { key: 'verticalDatum', label: 'Height datum / benchmark reference' }, { key: 'designRevision', label: 'Approved design revision reference' }] as const).map(({ key, label }) => <label key={key} className="text-xs text-[var(--text-muted)]">{label}<input value={references[key]} onChange={event => setReferences(previous => ({ ...previous, [key]: event.target.value }))} className="mt-1 min-h-11 w-full rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 text-[var(--text-primary)]" /></label>)}
            </div>
            <PrintMetaPanel meta={printMeta} onChange={setPrintMeta} />
          </div>

          {/* Section drawings + quantities */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                {computedSections.map((s, i) => (
                  <button key={`${s}-${i}`} onClick={() => setActiveSection(i)}
                    className={`px-3 py-1.5 text-xs rounded whitespace-nowrap ${i === activeSection ? 'bg-[var(--accent)] text-black' : 'border border-[var(--border-color)] text-[var(--text-muted)]'}`}>
                    {fmtCh(s.chainage)}
                  </button>
                ))}
              </div>
              {computedSections[activeSection] && (
                <CrossSectionDrawing section={computedSections[activeSection]} template={template} />
              )}
            </div>

            <div>
              <EarthworkQuantitiesTable result={earthworkResult} sections={computedSections} />
            </div>
          </div>

          {/* Mass Haul Diagram */}
          {earthworkResult && earthworkResult.massOrdinates.length > 1 && (
            <MassHaulDiagram result={earthworkResult} />
          )}
        </>
      )}
    </div>
  )
}
