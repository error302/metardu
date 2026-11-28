'use client'

import { useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, FileText, RotateCcw } from 'lucide-react'
import type { NamedPoint2D } from '@/lib/engine/types'
import { CLOSING_SHOT, CONTROL, CRS, MIN_PRECISION, metres, ratio, sampleObservations, sampleTraverse } from './survey'
import styles from './survey.module.css'

const steps = [
  { label: 'Set up', title: 'Establish survey control', detail: 'Start with the known station, confirm the coordinate system, and plan to close the traverse back on the same mark.' },
  { label: 'Field book', title: 'Inspect the field observations', detail: 'Follow the observations from MB1 back to MB1. Select a leg to match its bearing and distance to the traverse sketch.' },
  { label: 'Compute', title: 'Check the traverse closure', detail: 'Compare the calculated endpoint with the known control. Check the discrepancy before distributing any corrections.' },
  { label: 'Review plan', title: 'Review the adjusted boundary', detail: 'Match the adjusted coordinates to the beacon labels and check that the boundary closes back on MB1.' },
  { label: 'Deliver', title: 'Hand over the survey package', detail: 'Download the drawing and schedules generated from the same five adjusted coordinates.' },
]

const firstTraverse = sampleTraverse(false)
const repeatedTraverse = sampleTraverse(true)
const firstClosingDistance = sampleObservations(false)[CLOSING_SHOT].distance
const sketch = [CONTROL, ...firstTraverse.raw.legs.slice(0, -1).map(leg => ({
  name: leg.to, easting: leg.easting, northing: leg.northing,
}))]
const files = [
  { format: 'pdf', title: 'Survey plan', detail: 'A4 plot at 1:2,000 with north arrow, scale, coordinate schedule and closure summary.' },
  { format: 'dxf', title: 'Boundary drawing', detail: 'Editable metre-grid boundary, beacon points and labels on separate CAD layers.' },
  { format: 'csv', title: 'Coordinate schedule', detail: 'Five adjusted eastings and northings in the project CRS, ready for a spreadsheet.' },
] as const

function Plan({ points, adjusted, selected }: { points: NamedPoint2D[]; adjusted: boolean; selected?: number }) {
  const xy = ({ easting, northing }: NamedPoint2D) => [
    107 + (easting - CONTROL.easting) * 1.04,
    108 - (northing - CONTROL.northing) * 1.04,
  ] as const
  const plot = points.map(xy)
  const labelOffsets = [[-13, -14], [9, -13], [12, 4], [11, 13], [-17, 14]]
  const datum = adjusted ? 'Adjusted boundary' : 'Traverse sketch'
  return (
    <figure className={styles.plan}>
      <figcaption className={styles.planHeader}>
        <div><span className={styles.eyebrow}>Sample parcel 01</span><strong>{datum}</strong></div>
        <span className={styles.planTag}>{adjusted ? 'Bowditch adjusted' : 'Field reference'}</span>
      </figcaption>
      <svg viewBox="0 0 410 338" role="img" aria-label={`${datum}. Stations MB1 through MB5 form a loop back to MB1.`} className={styles.plot}>
        <defs>
          <pattern id="practice-grid" width="26" height="26" patternUnits="userSpaceOnUse">
            <path d="M26 0H0V26" fill="none" stroke="#c9d9d1" strokeWidth=".75" />
          </pattern>
        </defs>
        <rect width="410" height="338" fill="#eaf1eb" />
        <rect x="16" y="15" width="378" height="307" fill="url(#practice-grid)" stroke="#a9c2b5" />
        <path d="M357 79V49M352 57L357 49L362 57" fill="none" stroke="#21473a" strokeWidth="1.6" />
        <text x="357" y="41" textAnchor="middle">N</text>
        <polygon points={plot.map(point => point.join(',')).join(' ')} fill="#b6d2bd" fillOpacity=".66" stroke="#286653" strokeWidth="1.8" strokeDasharray={adjusted ? undefined : '5 4'} />
        {selected !== undefined && (
          <line x1={plot[selected][0]} y1={plot[selected][1]} x2={plot[(selected + 1) % plot.length][0]} y2={plot[(selected + 1) % plot.length][1]} stroke="#9c4c21" strokeWidth="4" strokeLinecap="round" />
        )}
        <text x="187" y="188" textAnchor="middle" className={styles.parcelLabel}>PARCEL 01</text>
        {plot.map(([x, y], index) => (
          <g key={points[index].name}>
            <circle cx={x} cy={y} r={index === 0 ? 5.4 : 3.8} fill="#1c5d4a" stroke="#eff7ee" strokeWidth="1.4" />
            <text x={x + labelOffsets[index][0]} y={y + labelOffsets[index][1]} textAnchor={labelOffsets[index][0] < 0 ? 'end' : 'start'}>{points[index].name}</text>
          </g>
        ))}
        <path d="M34 288V295H86V288M60 288V295" fill="none" stroke="#21473a" strokeWidth="1.4" />
        <text x="34" y="309">0</text>
        <text x="86" y="309" textAnchor="end">50 m</text>
      </svg>
      <div className={styles.planFooter}>
        <span><i /> MB1 · Start and close</span>
        <span>EPSG:21037</span>
      </div>
    </figure>
  )
}

function Evidence({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.evidence}><h3>{title}</h3>{children}</section>
}

export default function SurveyGuide() {
  const [step, setStep] = useState(0)
  const [furthest, setFurthest] = useState(0)
  const [selected, setSelected] = useState(0)
  const [reobserved, setReobserved] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const titleRef = useRef<HTMLHeadingElement>(null)
  const survey = reobserved ? repeatedTraverse : firstTraverse
  const observations = sampleObservations(reobserved)
  const current = steps[step]

  function goTo(next: number) {
    setStep(next)
    setFurthest(Math.max(furthest, next))
    titleRef.current?.focus({ preventScroll: true })
    titleRef.current?.scrollIntoView({ block: 'nearest' })
  }

  function restart() {
    setFurthest(0)
    setReobserved(false)
    setSelected(0)
    setMessage('')
    setStep(0)
    titleRef.current?.focus({ preventScroll: true })
    titleRef.current?.scrollIntoView({ block: 'nearest' })
  }

  async function download(format: 'pdf' | 'dxf' | 'csv') {
    setExporting(format)
    setMessage('')
    try {
      const { exportSample } = await import('./exports')
      await exportSample(format, survey)
      setMessage(`${format.toUpperCase()} download requested.`)
    } catch {
      setMessage(`Couldn’t generate the ${format.toUpperCase()}. Try again.`)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero} aria-labelledby="demo-title">
          <div>
            <p className={styles.eyebrow}>Guided practice survey</p>
            <h1 id="demo-title">From field book to survey plan.</h1>
            <p>Work a five-beacon boundary traverse. Check your measurements, resolve a closure issue, and leave with a survey package you can open.</p>
          </div>
          <p className={styles.scope}>Synthetic training data<br /><span>No account required</span></p>
        </section>

        <nav aria-label="Survey stages" className={styles.journey}>
          <ol>{steps.map(({ label }, index) => (
            <li key={label}>
              <button type="button" disabled={index > furthest} aria-current={index === step ? 'step' : undefined} onClick={() => goTo(index)}>
                <span aria-hidden>{index < furthest ? <Check size={13} /> : index + 1}</span>{label}
              </button>
            </li>
          ))}</ol>
        </nav>

        <section className={styles.workspace} aria-labelledby="stage-title" data-field-book={step === 1}>
          <div className={styles.guide}>
            <p className={styles.eyebrow}>Step {step + 1} of {steps.length} <span> / </span> {current.label}</p>
            <h2 id="stage-title" ref={titleRef} tabIndex={-1}>{current.title}</h2>
            <p className={styles.instructions}>{current.detail}</p>

            {step === 0 && (
              <Evidence title="Control card · MB1">
                <dl className={styles.control}>
                  <div><dt>Easting</dt><dd>{metres(CONTROL.easting)} m</dd></div>
                  <div><dt>Northing</dt><dd>{metres(CONTROL.northing)} m</dd></div>
                  <div><dt>Coordinate system</dt><dd>{CRS}</dd></div>
                </dl>
                <p className={styles.note}>On site, verify the control record and mark, then orient the instrument to a known backsight. This exercise starts with grid bearings and horizontal distances already reduced from field readings.</p>
              </Evidence>
            )}

            {step === 1 && (
              <Evidence title="Reduced observations">
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th scope="col">Leg</th><th scope="col">Grid bearing</th><th scope="col">Distance (m)</th></tr></thead>
                    <tbody>{observations.map((shot, index) => (
                      <tr key={shot.to} data-selected={selected === index}>
                        <th scope="row"><button type="button" aria-pressed={selected === index} onClick={() => setSelected(index)}>{shot.from} → {shot.to}</button></th>
                        <td>{shot.bearingDms}</td><td>{metres(shot.distance)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <p className={styles.note}>{selected === CLOSING_SHOT
                  ? reobserved
                    ? `The repeat reading replaces the original ${metres(firstClosingDistance)} m in the computation. Keep both in the field record.`
                    : 'This is the closing sight to MB1. Its endpoint can be compared with known control.'
                  : `The highlighted leg runs from ${observations[selected].from} to ${observations[selected].to}. Keep the station sequence intact when importing observations.`}</p>
              </Evidence>
            )}

            {step === 2 && (
              <Evidence title="Linear closure · before adjustment">
                <div className={styles.metrics}>
                  <div><span>Misclosure</span><strong>{metres(survey.misclosure)} m</strong></div>
                  <div><span>Relative precision</span><strong>{ratio(survey.precision)}</strong></div>
                </div>
                <div className={styles.result} data-pass={Boolean(survey.adjustment)} role="status">
                  <strong>{survey.adjustment ? 'Meets the practice target' : 'Below the practice target'} of {ratio(MIN_PRECISION)}</strong>
                  <p>{survey.adjustment
                    ? `The closing distance changed from ${metres(firstClosingDistance)} m to ${metres(observations[CLOSING_SHOT].distance)} m. Apply Bowditch to distribute the remaining east and north discrepancy in proportion to leg length.`
                    : 'The closing shot is flagged in the crew’s notes for a repeat reading. Reobserve MB5 → MB1 and recalculate before accepting an adjustment.'}</p>
                </div>
                <details className={styles.details}>
                  <summary>Inspect the closure calculation</summary>
                  <p>Computed minus known control gives ΔE {metres(survey.deltaE)} m and ΔN {metres(survey.deltaN)} m. Relative precision divides the {metres(survey.raw.totalDistance)} m observed length by the linear misclosure.</p>
                  <p>This reduced dataset supports a linear check. Independent angular closure requires observed angles.</p>
                </details>
              </Evidence>
            )}

            {step === 3 && survey.area && survey.adjustment && (
              <Evidence title="Adjusted coordinate schedule">
                <div className={styles.metrics}>
                  <div><span>Grid area</span><strong>{survey.area.areaHa.toFixed(4)} ha</strong></div>
                  <div><span>Boundary length</span><strong>{metres(survey.area.perimeter)} m</strong></div>
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th scope="col">Beacon</th><th scope="col">Easting (m)</th><th scope="col">Northing (m)</th></tr></thead>
                    <tbody>{survey.points.map(point => (
                      <tr key={point.name}><th scope="row">{point.name}</th><td>{metres(point.easting)}</td><td>{metres(point.northing)}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                <details className={styles.details}>
                  <summary>Inspect Bowditch corrections</summary>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead><tr><th scope="col">Leg</th><th scope="col">ΔE correction (mm)</th><th scope="col">ΔN correction (mm)</th></tr></thead>
                      <tbody>{survey.adjustment.legs.map(leg => (
                        <tr key={leg.to}><th scope="row">{leg.from} → {leg.to}</th><td>{(leg.correctionE * 1000).toFixed(1)}</td><td>{(leg.correctionN * 1000).toFixed(1)}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </details>
              </Evidence>
            )}

            {step === 4 && (
              <Evidence title="Download sample files">
                <ul className={styles.files}>{files.map(({ format, title, detail }) => (
                  <li key={format}>
                    <FileText size={21} aria-hidden />
                    <div><strong>{title}</strong><p>{detail}</p></div>
                    <button type="button" disabled={exporting !== null} onClick={() => void download(format)} aria-label={`Download ${format.toUpperCase()}`}>
                      <ArrowDownToLine size={15} aria-hidden /> {exporting === format ? 'Preparing…' : format.toUpperCase()}
                    </button>
                  </li>
                ))}</ul>
                <p className={styles.note}>The files are marked for practice use only.</p>
                <div className={styles.downloadStatus} role="status">{message}</div>
              </Evidence>
            )}

            <div className={styles.actions}>
              {step === 4
                ? <Link href="/register" className={styles.primary}>Create an account <ArrowRight size={17} aria-hidden /></Link>
                : step === 2 && !survey.adjustment
                  ? <button type="button" className={styles.primary} onClick={() => setReobserved(true)}>Use repeat reading <RotateCcw size={16} aria-hidden /></button>
                  : <button type="button" className={styles.primary} onClick={() => goTo(step + 1)}>
                    {['Confirm control', 'Compute closure', 'Apply Bowditch', 'Accept sample plan'][step]} <ArrowRight size={17} aria-hidden />
                  </button>}
              {step > 0 && <button type="button" className={styles.back} onClick={() => goTo(step - 1)}><ArrowLeft size={15} aria-hidden /> Back</button>}
            </div>
          </div>

          <Plan
            adjusted={step >= 3}
            points={step >= 3 ? survey.points : sketch}
            selected={step === 1 ? selected : step === 2 ? CLOSING_SHOT : undefined}
          />
        </section>
        <footer className={styles.footer}>
          <span>METARDU practice workspace</span>
          {furthest > 0 && <button type="button" onClick={restart} disabled={exporting !== null}><RotateCcw size={14} aria-hidden /> Restart practice</button>}
        </footer>
      </div>
    </div>
  )
}
