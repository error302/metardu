'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { downloadCSV } from '@/lib/export/helpers'
import {
  checkDeviations,
  TOLERANCE_SCREENING_PRESETS,
  getStatusColor,
  getStatusLabel,
  type DesignStation,
  type AsBuiltPoint,
  type DeviationReport,
} from '@/lib/compute/asBuiltDeviation'
import {
  deviationReportToCsv,
  makeAsBuiltPointsCsvTemplate,
  makeDesignProfileCsvTemplate,
  MAX_AS_BUILT_CSV_BYTES,
  parseAsBuiltPointsCsv,
  parseDesignProfileCsv,
} from '@/lib/compute/asBuiltDeviationCsv'

const SAMPLE_DESIGN: DesignStation[] = [
  { chainage: 0, elevation: 1520.0 },
  { chainage: 20, elevation: 1520.15 },
  { chainage: 40, elevation: 1520.3 },
  { chainage: 60, elevation: 1520.45 },
  { chainage: 80, elevation: 1520.6 },
]

const SAMPLE_AS_BUILT: AsBuiltPoint[] = [
  { id: 'TRAIN-01', chainage: 0, elevation: 1520.002, description: 'Centreline' },
  { id: 'TRAIN-02', chainage: 20, elevation: 1520.148, description: 'Centreline' },
  { id: 'TRAIN-03', chainage: 40, elevation: 1520.312, description: 'Centreline' },
  { id: 'TRAIN-04', chainage: 60, elevation: 1520.441, description: 'Centreline' },
  { id: 'TRAIN-05', chainage: 80, elevation: 1520.615, description: 'Centreline' },
]

interface DesignRow {
  id: number
  chainage: string
  elevation: string
}

interface AsBuiltRow {
  id: number
  pointId: string
  chainage: string
  elevation: string
  description: string
}

const blankDesignRows = (): DesignRow[] => [
  { id: 1, chainage: '', elevation: '' },
  { id: 2, chainage: '', elevation: '' },
]
const blankAsBuiltRows = (): AsBuiltRow[] => [
  { id: 1, pointId: '', chainage: '', elevation: '', description: '' },
]
const strictNumber = (value: string) => value.trim() === '' ? Number.NaN : Number(value)
const format = (value: number | null, decimals: number) => value !== null && Number.isFinite(value) ? value.toFixed(decimals) : '—'
const RESULT_PAGE_SIZE = 100

export default function AsBuiltDeviationPage() {
  const [toleranceIdx, setToleranceIdx] = useState(TOLERANCE_SCREENING_PRESETS.length - 1)
  const [customPass, setCustomPass] = useState('')
  const [customMarginal, setCustomMarginal] = useState('')
  const [report, setReport] = useState<DeviationReport | null>(null)
  const [inputError, setInputError] = useState('')
  const [importStatus, setImportStatus] = useState('')
  const [verticalReference, setVerticalReference] = useState('')
  const [toleranceSource, setToleranceSource] = useState('')
  const [resultPage, setResultPage] = useState(0)
  const [exampleDesignLoaded, setExampleDesignLoaded] = useState(false)
  const [exampleObservationsLoaded, setExampleObservationsLoaded] = useState(false)
  const [designRows, setDesignRows] = useState<DesignRow[]>(blankDesignRows)
  const [asBuiltRows, setAsBuiltRows] = useState<AsBuiltRow[]>(blankAsBuiltRows)

  const selectedPreset = TOLERANCE_SCREENING_PRESETS[toleranceIdx]
  const tolerance = toleranceIdx === TOLERANCE_SCREENING_PRESETS.length - 1
    ? { label: 'Custom project values', passLimit: strictNumber(customPass), marginalLimit: strictNumber(customMarginal) }
    : selectedPreset
  const usingExample = exampleDesignLoaded || exampleObservationsLoaded

  const setDesignField = (id: number, field: keyof DesignRow, value: string) => {
    setDesignRows(rows => rows.map(row => row.id === id ? { ...row, [field]: value } : row))
    setReport(null)
    setInputError('')
    setImportStatus('')
  }
  const setAsBuiltField = (id: number, field: keyof AsBuiltRow, value: string) => {
    setAsBuiltRows(rows => rows.map(row => row.id === id ? { ...row, [field]: value } : row))
    setReport(null)
    setInputError('')
    setImportStatus('')
  }

  const importCsv = async (kind: 'design' | 'observations', file: File) => {
    setInputError('')
    setImportStatus('')
    if (file.size > MAX_AS_BUILT_CSV_BYTES) {
      setInputError(`CSV exceeds the ${Math.round(MAX_AS_BUILT_CSV_BYTES / (1024 * 1024))} MB page limit; split the file and import each portion.`)
      return
    }
    try {
      const contents = await file.text()
      if (kind === 'design') {
        const parsed = parseDesignProfileCsv(contents)
        setDesignRows(parsed.map((point, index) => ({ id: index + 1, chainage: String(point.chainage), elevation: String(point.elevation) })))
        setImportStatus(`Loaded ${parsed.length.toLocaleString()} design station(s) from ${file.name}. Existing design rows were replaced.`)
        setExampleDesignLoaded(false)
      } else {
        const parsed = parseAsBuiltPointsCsv(contents)
        setAsBuiltRows(parsed.map((point, index) => ({ id: index + 1, pointId: point.id, chainage: String(point.chainage), elevation: String(point.elevation), description: point.description ?? '' })))
        setImportStatus(`Loaded ${parsed.length.toLocaleString()} observation(s) from ${file.name}. Existing observation rows were replaced.`)
        setExampleObservationsLoaded(false)
      }
      setVerticalReference('')
      setToleranceSource('')
      setCustomPass('')
      setCustomMarginal('')
      setToleranceIdx(TOLERANCE_SCREENING_PRESETS.length - 1)
      setReport(null)
      setResultPage(0)
    } catch (error) {
      setInputError(`${kind === 'design' ? 'Design' : 'Observation'} CSV was not loaded: ${error instanceof Error ? error.message : 'The file could not be read.'}`)
    }
  }

  const loadExample = () => {
    setDesignRows(SAMPLE_DESIGN.map((point, index) => ({ id: index + 1, chainage: String(point.chainage), elevation: point.elevation.toFixed(3) })))
    setAsBuiltRows(SAMPLE_AS_BUILT.map((point, index) => ({ id: index + 1, pointId: point.id, chainage: String(point.chainage), elevation: point.elevation.toFixed(3), description: point.description ?? '' })))
    setVerticalReference('TRAINING ONLY — fictional benchmark BM-T01; no real datum or control used')
    setToleranceSource('TRAINING ONLY — illustrative values, not a project specification')
    setExampleDesignLoaded(true)
    setExampleObservationsLoaded(true)
    setImportStatus('')
    setReport(null)
    setInputError('')
  }

  const clearData = () => {
    setDesignRows(blankDesignRows())
    setAsBuiltRows(blankAsBuiltRows())
    setVerticalReference('')
    setToleranceSource('')
    setCustomPass('')
    setCustomMarginal('')
    setExampleDesignLoaded(false)
    setExampleObservationsLoaded(false)
    setImportStatus('')
    setReport(null)
    setInputError('')
  }

  const runCheck = () => {
    setReport(null)
    setInputError('')
    if (!verticalReference.trim()) {
      setInputError('Enter the vertical datum and benchmark/control reference shared by the design and observations.')
      return
    }
    if (!toleranceSource.trim()) {
      setInputError('Enter the tolerance source, or state that this is preliminary screening without an acceptance criterion.')
      return
    }
    const design = designRows
      .filter(row => row.chainage.trim() !== '' || row.elevation.trim() !== '')
      .map(row => ({ chainage: strictNumber(row.chainage), elevation: strictNumber(row.elevation) }))
    const asBuilt = asBuiltRows
      .filter(row => row.pointId.trim() !== '' || row.chainage.trim() !== '' || row.elevation.trim() !== '' || row.description.trim() !== '')
      .map(row => ({
        id: row.pointId.trim() || `P${row.id}`,
        chainage: strictNumber(row.chainage),
        elevation: strictNumber(row.elevation),
        description: row.description.trim() || undefined,
      }))

    if (design.filter(point => Number.isFinite(point.chainage) && Number.isFinite(point.elevation)).length < 2) {
      setInputError('Enter at least two complete design stations with finite chainage and RL values.')
      return
    }
    if (asBuilt.length === 0) {
      setInputError('Enter at least one as-built observation. Partially completed rows are reported as not assessed.')
      return
    }

    try {
      setReport(checkDeviations(design, asBuilt, tolerance))
      setResultPage(0)
    } catch (error) {
      setInputError(error instanceof Error ? error.message : 'Check the tolerance values and try again.')
    }
  }

  const verdict = !report
    ? ''
    : report.stats.total === 0
      ? 'No observations supplied'
      : report.stats.unassessed > 0
        ? `Incomplete — ${report.stats.unassessed} point(s) not assessed`
        : report.stats.fail > 0
          ? 'Outside selected screening band'
          : report.stats.marginal > 0
            ? 'Near selected screening limit'
            : 'Within selected screening band'

  const pageCount = report ? Math.max(1, Math.ceil(report.results.length / RESULT_PAGE_SIZE)) : 1
  const visibleResults = report
    ? report.results.slice(resultPage * RESULT_PAGE_SIZE, (resultPage + 1) * RESULT_PAGE_SIZE)
    : []

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 md:py-10">
      <PageHeader
        title="As-built deviation review"
        subtitle="Compare observed reduced levels with an entered design profile. Results screen the supplied observations only; acceptance must follow the approved project specification and survey control."
        reference="Use project-approved design, control and tolerance values"
        badge="Engineering"
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={loadExample} className="btn btn-secondary">Load fictional training example</button>
        <button type="button" onClick={clearData} className="btn btn-secondary">Clear entered data</button>
        {usingExample && <span className="text-sm font-semibold text-[var(--warning)]">EXAMPLE DATA — fictional training values, not field observations or acceptance evidence.</span>}
      </div>
      {importStatus && <p role="status" className="mb-4 text-sm text-[var(--success)]">{importStatus}</p>}

      <section className="card mb-6" aria-labelledby="references-heading">
        <div className="card-header"><h2 id="references-heading" className="label">Survey and specification references</h2></div>
        <div className="card-body grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-[var(--text-muted)]">Vertical datum and benchmark/control reference
            <input className="input mt-1 text-sm" value={verticalReference} onChange={event => { setVerticalReference(event.target.value); setReport(null) }} aria-label="Vertical datum and benchmark/control reference" placeholder="Datum · benchmark ID · approved source" />
          </label>
          <label className="text-xs text-[var(--text-muted)]">Tolerance source or screening note
            <input className="input mt-1 text-sm" value={toleranceSource} onChange={event => { setToleranceSource(event.target.value); setReport(null) }} aria-label="Tolerance source or screening note" placeholder="Contract clause, drawing revision, or preliminary screening" />
          </label>
          <p className="sm:col-span-2 text-xs text-[var(--text-muted)]">These notes are operator-declared provenance, not independently verified control or approval. Design and observed RLs must use the same vertical reference.</p>
        </div>
      </section>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
        <div className="space-y-4">
          <section className="card" aria-labelledby="tolerance-heading">
            <div className="card-header"><h2 id="tolerance-heading" className="label">Screening limits</h2></div>
            <div className="card-body">
              <label className="sr-only" htmlFor="tolerance-band">Tolerance screening preset</label>
              <select id="tolerance-band" aria-label="Tolerance screening preset" value={toleranceIdx} onChange={event => { setToleranceIdx(Number(event.target.value)); setReport(null) }} className="input text-sm mb-2">
                {TOLERANCE_SCREENING_PRESETS.map((option, index) => <option key={option.label} value={index}>{option.label}</option>)}
              </select>
              {toleranceIdx === TOLERANCE_SCREENING_PRESETS.length - 1 && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-[var(--text-muted)]">Within-band limit (mm)
                    <input aria-label="Within-band limit (mm)" className="input font-mono text-sm mt-1" type="number" min="0" step="any" value={customPass} onChange={event => { setCustomPass(event.target.value); setReport(null) }} />
                  </label>
                  <label className="text-xs text-[var(--text-muted)]">Review-band limit (mm)
                    <input aria-label="Review-band limit (mm)" className="input font-mono text-sm mt-1" type="number" min="0" step="any" value={customMarginal} onChange={event => { setCustomMarginal(event.target.value); setReport(null) }} />
                  </label>
                </div>
              )}
              <p className="mt-3 text-xs text-[var(--text-muted)]">Preset values are illustrative screening examples, not verified Kenyan or universal acceptance criteria. Confirm limits against the contract and approved specification.</p>
              {Number.isFinite(tolerance.passLimit) && Number.isFinite(tolerance.marginalLimit) && (
                <p className="mt-2 text-xs font-mono">Within band ≤ {tolerance.passLimit} mm · Review band ≤ {tolerance.marginalLimit} mm · Outside &gt; {tolerance.marginalLimit} mm</p>
              )}
            </div>
          </section>

          <section className="card" aria-labelledby="design-heading">
            <div className="card-header flex flex-wrap items-center justify-between gap-3">
              <h2 id="design-heading" className="label">Design profile stations</h2>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => downloadCSV(makeDesignProfileCsvTemplate(), 'metardu-design-profile-template.csv')} className="btn btn-secondary text-xs">CSV template</button>
                <label className="btn btn-secondary text-xs cursor-pointer">Import design CSV
                  <input className="sr-only" type="file" accept=".csv,text/csv" aria-label="Import design profile CSV" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void importCsv('design', file) }} />
                </label>
              </div>
            </div>
            <div className="card-body space-y-2">
              <p className="text-xs text-[var(--text-muted)]">Chainage is in metres; RL is in metres. Values between stations are linearly interpolated. No extrapolation is made beyond the supplied range.</p>
              <div className="grid grid-cols-[28px_1fr_1fr_32px] gap-2 items-center font-mono text-[10px] text-[var(--text-muted)] uppercase"><span>#</span><span>Chainage (m)</span><span>Design RL (m)</span><span /></div>
              {designRows.map(row => (
                <div key={row.id} className="grid grid-cols-[28px_1fr_1fr_32px] gap-2 items-center">
                  <span className="font-mono text-xs text-[var(--text-muted)]">{row.id}</span>
                  <input className="input font-mono text-xs px-2 py-2" type="number" step="any" value={row.chainage} onChange={event => setDesignField(row.id, 'chainage', event.target.value)} aria-label={`Design chainage row ${row.id} (m)`} />
                  <input className="input font-mono text-xs px-2 py-2" type="number" step="any" value={row.elevation} onChange={event => setDesignField(row.id, 'elevation', event.target.value)} aria-label={`Design RL row ${row.id} (m)`} />
                  <button type="button" aria-label={`Remove design station ${row.id}`} onClick={() => { setDesignRows(rows => rows.filter(item => item.id !== row.id)); setReport(null) }} className="text-[var(--text-muted)] hover:text-[var(--error)] text-lg">×</button>
                </div>
              ))}
              <button type="button" onClick={() => { setDesignRows(rows => [...rows, { id: Math.max(0, ...rows.map(row => row.id)) + 1, chainage: '', elevation: '' }]); setReport(null) }} className="font-mono text-xs text-[var(--accent)]">+ Add station</button>
            </div>
          </section>

          <section className="card" aria-labelledby="observations-heading">
            <div className="card-header flex flex-wrap items-center justify-between gap-3">
              <h2 id="observations-heading" className="label">As-built observations</h2>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => downloadCSV(makeAsBuiltPointsCsvTemplate(), 'metardu-as-built-observations-template.csv')} className="btn btn-secondary text-xs">CSV template</button>
                <label className="btn btn-secondary text-xs cursor-pointer">Import observations CSV
                  <input className="sr-only" type="file" accept=".csv,text/csv" aria-label="Import as-built observations CSV" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void importCsv('observations', file) }} />
                </label>
              </div>
            </div>
            <div className="card-body space-y-2">
              <p className="text-xs text-[var(--text-muted)]">Enter measured levels from the project survey. Partially completed rows stay visible in the results as not assessed.</p>
              <div className="overflow-x-auto pb-1">
                <div className="grid grid-cols-[60px_1fr_1fr_1fr_32px] gap-2 items-center font-mono text-[10px] text-[var(--text-muted)] uppercase min-w-[620px]"><span>Point ID</span><span>Chainage (m)</span><span>Observed RL (m)</span><span>Description</span><span /></div>
                {asBuiltRows.map(row => (
                  <div key={row.id} className="grid grid-cols-[60px_1fr_1fr_1fr_32px] gap-2 items-center min-w-[620px]">
                    <input className="input font-mono text-xs px-2 py-2" value={row.pointId} onChange={event => setAsBuiltField(row.id, 'pointId', event.target.value)} aria-label={`Point ID row ${row.id}`} />
                    <input className="input font-mono text-xs px-2 py-2" type="number" step="any" value={row.chainage} onChange={event => setAsBuiltField(row.id, 'chainage', event.target.value)} aria-label={`Observed chainage row ${row.id} (m)`} />
                    <input className="input font-mono text-xs px-2 py-2" type="number" step="any" value={row.elevation} onChange={event => setAsBuiltField(row.id, 'elevation', event.target.value)} aria-label={`Observed RL row ${row.id} (m)`} />
                    <input className="input text-xs px-2 py-2" value={row.description} onChange={event => setAsBuiltField(row.id, 'description', event.target.value)} aria-label={`Observation description row ${row.id}`} />
                    <button type="button" aria-label={`Remove as-built point ${row.id}`} onClick={() => { setAsBuiltRows(rows => rows.filter(item => item.id !== row.id)); setReport(null) }} className="text-[var(--text-muted)] hover:text-[var(--error)] text-lg">×</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => { setAsBuiltRows(rows => [...rows, { id: Math.max(0, ...rows.map(row => row.id)) + 1, pointId: '', chainage: '', elevation: '', description: '' }]); setReport(null) }} className="font-mono text-xs text-[var(--accent)]">+ Add observation</button>
            </div>
          </section>

          {inputError && <p role="alert" className="rounded-md border border-[var(--error)] p-3 text-sm text-[var(--error)]">{inputError}</p>}
          <button type="button" onClick={runCheck} className="btn btn-primary w-full">Run screening comparison</button>
        </div>

        <div aria-live="polite">
          {!report ? (
            <div className="card"><div className="card-body text-center py-16"><p className="text-sm text-[var(--text-muted)]">Enter project design and observed levels, then run the comparison.</p></div></div>
          ) : (
            <div className="space-y-4">
              <section className="card" aria-labelledby="summary-heading">
                <div className="card-header"><h2 id="summary-heading" className="label">Screening summary</h2></div>
                <div className="card-body grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    ['Within band', report.stats.pass, 'var(--success)'],
                    ['Near limit', report.stats.marginal, 'var(--warning)'],
                    ['Outside band', report.stats.fail, 'var(--error)'],
                    ['Not assessed', report.stats.unassessed, 'var(--text-muted)'],
                  ].map(([label, count, color]) => <div key={String(label)} className="text-center"><div className="font-mono text-[10px] text-[var(--text-muted)] uppercase mb-1">{label}</div><div className="font-display text-2xl" style={{ color: String(color) }}>{count}</div></div>)}
                </div>
                <div className="card-body border-t border-[var(--border-color)] grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div><div className="font-mono text-[10px] text-[var(--text-muted)] uppercase mb-1">Within-band share of all rows</div><div className="font-display text-xl">{report.stats.passRate.toFixed(1)}%</div></div>
                  <div><div className="font-mono text-[10px] text-[var(--text-muted)] uppercase mb-1">Maximum assessed deviation</div><div className="font-display text-xl">{format(report.stats.maxDeviationMm, 1)} mm</div></div>
                  <div><div className="font-mono text-[10px] text-[var(--text-muted)] uppercase mb-1">Mean assessed deviation</div><div className="font-display text-xl">{format(report.stats.avgDeviationMm, 1)} mm</div></div>
                </div>
                <div className="card-body border-t border-[var(--border-color)] grid gap-2 text-xs">
                  <p><span className="text-[var(--text-muted)]">Vertical reference: </span>{verticalReference}</p>
                  <p><span className="text-[var(--text-muted)]">Tolerance source: </span>{toleranceSource}</p>
                </div>
              </section>

              <section className="card" aria-labelledby="screening-result-heading">
                <div className="card-body">
                  <h2 id="screening-result-heading" className="font-display text-xl">{verdict}</h2>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{report.stats.pass} of {report.stats.total} entered point(s) are within the selected screening band. This is not a compliance certificate or release for construction.</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">Selected limits: {report.tolerance.label} · within {report.tolerance.passLimit} mm · review through {report.tolerance.marginalLimit} mm</p>
                  {report.issues.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm text-[var(--text-muted)]">{report.issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul>}
                </div>
              </section>

              <section className="card" aria-labelledby="results-heading">
                <div className="card-header flex flex-wrap items-center justify-between gap-3">
                  <h2 id="results-heading" className="label">Point-by-point results</h2>
                  <button type="button" onClick={() => downloadCSV(deviationReportToCsv(report, verticalReference, toleranceSource), 'metardu-as-built-screening-results.csv')} className="btn btn-secondary text-xs">Download screening CSV</button>
                </div>
                <div className="card-body overflow-x-auto">
                  <table className="w-full min-w-[600px] text-xs">
                    <thead><tr className="text-[var(--text-muted)] border-b border-[var(--border-color)]"><th className="text-left py-2">ID</th><th className="text-right py-2">Chainage (m)</th><th className="text-right py-2">Observed RL (m)</th><th className="text-right py-2">Design RL (m)</th><th className="text-right py-2">ΔZ (mm)</th><th className="text-center py-2">Screening</th></tr></thead>
                    <tbody>{visibleResults.map((result, index) => <tr key={`${result.pointId}-${resultPage * RESULT_PAGE_SIZE + index}`} className="border-b border-[color-mix(in_srgb,var(--border-color)_50%,transparent)]">
                      <td className="py-2 font-mono text-[var(--accent)]">{result.pointId}</td>
                      <td className="py-2 text-right font-mono">{format(result.chainage, 2)}</td>
                      <td className="py-2 text-right font-mono">{format(result.asBuiltElevation, 3)}</td>
                      <td className="py-2 text-right font-mono">{format(result.designElevation, 3)}</td>
                      <td className="py-2 text-right font-mono" style={{ color: getStatusColor(result.status) }}>{result.deltaZ === null ? '—' : `${result.deltaZ >= 0 ? '+' : ''}${(result.deltaZ * 1000).toFixed(1)}`}</td>
                      <td className="py-2 text-center"><span className="inline-block px-2 py-0.5 font-mono text-[9px]" style={{ background: `${getStatusColor(result.status)}20`, color: getStatusColor(result.status) }}>{getStatusLabel(result.status)}</span>{result.assessmentNote && <div className="mt-1 max-w-48 text-left text-[10px] text-[var(--text-muted)]">{result.assessmentNote}</div>}</td>
                    </tr>)}</tbody>
                  </table>
                  {report.results.length > 0 && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                    <span>Showing {resultPage * RESULT_PAGE_SIZE + 1}–{Math.min((resultPage + 1) * RESULT_PAGE_SIZE, report.results.length)} of {report.results.length.toLocaleString()} observations</span>
                    {pageCount > 1 && <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setResultPage(page => Math.max(0, page - 1))} disabled={resultPage === 0} className="btn btn-secondary text-xs disabled:opacity-50">Previous</button>
                      <span>Page {resultPage + 1} of {pageCount}</span>
                      <button type="button" onClick={() => setResultPage(page => Math.min(pageCount - 1, page + 1))} disabled={resultPage >= pageCount - 1} className="btn btn-secondary text-xs disabled:opacity-50">Next</button>
                    </div>}
                  </div>}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
