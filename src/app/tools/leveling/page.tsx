'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { computeLevelBook } from '@/lib/fieldbook/computeLevelBook';
import { getLevelingClosureStatus } from '@/lib/compute/levelingRunner';
import { trackEvent } from '@/lib/analytics/events';
import type { LevelingInput } from '@/lib/engine/leveling'
import type { LevelingReading, LevelingResult } from '@/lib/engine/types';
import SolutionStepsRenderer from '@/components/SolutionStepsRenderer'
import type { SolutionStep } from '@/lib/engine/solution/solutionBuilder'
import { levelingSolved } from '@/lib/engine/solution/wrappers/leveling'
import { PageHeader } from '@/components/shared/PageHeader'
import { generatePDF, downloadCSV, toCSV } from '@/lib/export/helpers'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface Reading {
  id: number;
  station: string;
  bs: string;
  fs: string;
}

export default function LevelingCalculator() {
  const { t } = useLanguage()
  const [bm, setBm] = useState('');
  const [closingBm, setClosingBm] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [method, setMethod] = useState<'rf' | 'hoc'>('rf');
  const [readings, setReadings] = useState<Reading[]>([
    { id: 1, station: '1', bs: '', fs: '' },
  ]);
  const [result, setResult] = useState<LevelingResult | null>(null);
  const [steps, setSteps] = useState<SolutionStep[] | null>(null)
  const [solutionTitle, setSolutionTitle] = useState<string | undefined>(undefined)
  const [showProfile, setShowProfile] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false)
  const [calculating, setCalculating] = useState(false);
  const closure = result ? getLevelingClosureStatus(result) : null
  const closureLabel = !closure || closure.status === 'unknown' ? 'Closure not assessed'
    : closure.status === 'acceptable' ? 'Within numerical reference' : 'Exceeds numerical reference'
  const misclosureLabel = result?.closingRLProvided ? `${result.misclosure.toFixed(6)} m` : 'Not assessed (closing benchmark required)'
  const clearResult = () => { setResult(null); setSteps(null); setSolutionTitle(undefined); setCalcError(null); setCopied(false); setShowProfile(false) }

  const addReading = () => {
    clearResult()
    setReadings([...readings, { id: Date.now(), station: String(readings.length + 1), bs: '', fs: '' }]);
  };

  const updateReading = (id: number, field: 'bs' | 'fs', value: string) => {
    clearResult()
    setReadings(readings.map((r: Reading) => r.id === id ? { ...r, [field]: value } : r));
  };

  // method label helper — HPC = Height of Plane of Collimation (British/East African convention)
  const methodLabel = method === 'rf' ? 'Rise & Fall' : 'Height of Collimation (HPC)';

  const copyResults = () => {
    if (!result) return
    const lines = [
      `METARDU Levelling — ${methodLabel}`,
      `Opening RL: ${bm} m`,
      `Misclosure: ${misclosureLabel}`,
      result.allowableMisclosure !== undefined
        ? `Allowable (10√K mm, K=${distanceKm} km): ±${(result.allowableMisclosure * 1000).toFixed(3)} mm`
        : 'Allowable: Unverified (route distance required)',
      `Closure: ${closureLabel}`,
      'Numerical reference only; not field verification or project acceptance.',
      '',
      ...result.readings.map((r: LevelingReading) =>
        `${r.station.padEnd(8)} ${r.reducedLevel !== undefined ? r.reducedLevel.toFixed(4) : '      '}${r.adjustedRL !== undefined ? ` (adj ${r.adjustedRL.toFixed(4)})` : ''}`
      ),
    ]
    navigator.clipboard.writeText(lines.join('\n'))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
      .catch(() => {})
  }

  const calculate = () => {
    setCalculating(true);
    clearResult()
    const checked = computeLevelBook({ openingRL: bm, closingRL: closingBm, distanceKm,
      method: method === 'rf' ? 'rise_and_fall' : 'height_of_collimation', rows: readings.map(row => ({ ...row, is: '' })) })
    if (!checked.ok) { setCalcError(checked.errors.join(' ')); setCalculating(false); return }
    const r = checked.calc
    const levelingInput: LevelingInput = { openingRL: Number(bm), closingRL: closingBm.trim() ? Number(closingBm) : undefined,
      distanceKm: distanceKm.trim() ? Number(distanceKm) : undefined, method: r.method,
      readings: readings.map(row => ({ station: row.station, bs: row.bs.trim() ? Number(row.bs) : undefined, fs: row.fs.trim() ? Number(row.fs) : undefined })) }

    // BLOCK RESULTS if arithmetic check fails (Basak rule)
    if (!r.arithmeticCheck) {
      setCalcError(
        'Arithmetic check failed — results cannot be displayed. ' +
        'Per Basak standards: ΣBS − ΣFS must equal ΣRise − ΣFall. ' +
        'Check your readings for entry errors.'
      );
      setResult(null);
      setCalculating(false);
      return;
    }

    setCalcError(null);
    setResult(r);
    trackEvent('tool_used', { tool: 'leveling', method });
    const s = levelingSolved(levelingInput, r)
    setSteps(s.steps)
    setSolutionTitle(s.solution.title)
    setCalculating(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title={t('tools.leveling')}
        subtitle={t('tools.levelingDesc')}
        reference="RDM 1.1 (2025) Table 5.1 | Survey Act Cap 299 | Survey Regulations 1994"
      />

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <label className="label" htmlFor="opening-benchmark-m">Opening Benchmark (m)</label>
          <input id="opening-benchmark-m" aria-label="Opening Benchmark (m)" className="input" value={bm} onChange={e => { clearResult(); setBm(e.target.value) }} />
        </div>
        <div className="card p-4">
          <label className="label" htmlFor="closing-benchmark-m">Closing Benchmark (m)</label>
          <input id="closing-benchmark-m" className="input" value={closingBm} onChange={e => { clearResult(); setClosingBm(e.target.value) }} placeholder="Optional" />
        </div>
        <div className="card p-4">
          <label className="label" htmlFor="distance-km-for-allowable-error">Distance (km) for allowable error</label>
          <input id="distance-km-for-allowable-error" className="input" value={distanceKm} onChange={e => { clearResult(); setDistanceKm(e.target.value) }} placeholder="Unknown until entered" />
        </div>
        <div className="card p-4">
          <div className="label">Method</div>
          <div className="flex gap-2 mt-2">
            <button onClick={() => { setMethod('rf'); setResult(null); setSteps(null); setSolutionTitle(undefined); setCalcError(null); }} className={`flex-1 btn text-xs ${method === 'rf' ? 'btn-primary' : 'btn-secondary'}`}>
              Rise &amp; Fall
            </button>
            {/* "Height of Collimation" = HPC method; British/East African convention */}
            <button onClick={() => { setMethod('hoc'); setResult(null); setSteps(null); setSolutionTitle(undefined); setCalcError(null); }} className={`flex-1 btn text-xs ${method === 'hoc' ? 'btn-primary' : 'btn-secondary'}`}>
              Height of Collimation
            </button>
          </div>
        </div>
      </div>

      {calcError && (
        <div role="alert" className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          <p className="font-semibold mb-1">Review the leveling inputs</p>
          <p>{calcError}</p>
        </div>
      )}

      <div className="card mb-6">
        <div className="card-header">
          <span className="label">Level Book — {methodLabel}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm tabular-nums [&_th]:px-3 [&_th]:py-3 [&_th]:text-left [&_td]:px-3 [&_td]:py-2 [&_td]:whitespace-nowrap">
            <thead className="border-b border-[var(--border-color)] text-[var(--text-secondary)]">
              <tr>
                <th>Station</th>
                <th>BS (m)</th>
                <th>FS (m)</th>
                <th>Rise (m)</th>
                <th>Fall (m)</th>
                <th>RL (m)</th>
                {result && <th>Adj RL (m)</th>}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-left font-semibold">BM</td>
                  <td colSpan={2} className="text-left text-[var(--text-muted)]">Opening benchmark</td>
                <td></td>
                <td></td>
                <td className="font-mono">{bm || '—'}</td>
                {result && <td className="font-mono">{bm || '—'}</td>}
              </tr>
              {readings.map((r, i) => (
                <tr key={r.id}>
                  <td className="text-left">{r.station}</td>
                  <td><input className="input" value={r.bs} onChange={e => updateReading(r.id, 'bs', e.target.value)} aria-label="Backsight (m)" placeholder="0.000" /></td>
                  <td><input className="input" value={r.fs} onChange={e => updateReading(r.id, 'fs', e.target.value)} aria-label="Foresight (m)" placeholder="0.000" /></td>
                  {result ? (
                    <>
                      <td className="font-mono">{result.readings[i + 1]?.rise?.toFixed(4) || '—'}</td>
                      <td className="font-mono">{result.readings[i + 1]?.fall?.toFixed(4) || '—'}</td>
                      <td className="font-mono">{result.readings[i + 1]?.reducedLevel?.toFixed(4) || '—'}</td>
                      <td className="font-mono">{result.readings[i + 1]?.adjustedRL?.toFixed(4) || '—'}</td>
                    </>
                  ) : (
                    <td colSpan={3}></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4">
          <button onClick={addReading} className="btn btn-secondary">{t('toolUI.addReading')}</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <button onClick={calculate} disabled={calculating} className="btn btn-primary disabled:opacity-60 disabled:cursor-not-allowed">
          {calculating ? (
            <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>{t('toolUI.calculating')}</>
          ) : t('toolUI.calculate')}
        </button>
        {result && (
          <>
            <button
              onClick={() => {
                if (!result) return
                generatePDF(
                  { title: 'Levelling Computation Sheet', reference: 'RDM 1.1 (2025) Table 5.1 | Survey Act Cap 299' },
                  [
                    { title: 'Computation Summary', rows: [
                      { label: 'Method', value: methodLabel },
                      { label: 'Opening RL', value: `${bm} m` },
                      { label: 'Misclosure', value: misclosureLabel },
                      { label: 'Reference (10 x sqrt(K) mm)', value: result.allowableMisclosure !== undefined ? `±${(result.allowableMisclosure * 1000).toFixed(3)} mm` : 'Unverified' },
                      { label: 'Arithmetic Check', value: result.arithmeticCheck ? 'PASS' : 'FAIL' },
                      { label: 'Status', value: closureLabel === 'Closure not assessed' ? 'Not assessed' : closureLabel },
                      { label: 'Evidence', value: 'Numerical reference only; not field verification or professional approval.' },
                    ]},
                  ],
                  [
                    { title: 'Level Book Observations', headers: ['Station', 'BS (m)', 'FS (m)', 'Rise (m)', 'Fall (m)', 'RL (m)', 'Adj RL (m)'], rows: result.readings.map((r: LevelingReading) => [
                      r.station || '—', r.bs?.toFixed(4) || '—', r.fs?.toFixed(4) || '—',
                      r.rise?.toFixed(4) || '—', r.fall?.toFixed(4) || '—',
                      r.reducedLevel?.toFixed(4) || '—', r.adjustedRL?.toFixed(4) || '—',
                    ]) },
                  ],
                )
              }}
              className="btn btn-secondary inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> {t('toolUI.exportPdf')}
            </button>
            <button
              onClick={() => {
                if (!result) return
                const csv = toCSV(
                  ['Station', 'BS (m)', 'FS (m)', 'Rise (m)', 'Fall (m)', 'RL (m)', 'Adj RL (m)', 'Remarks'],
                  result.readings.map((r: LevelingReading) => [
                    r.station || '', r.bs?.toFixed(4) || '', r.fs?.toFixed(4) || '',
                    r.rise?.toFixed(4) || '', r.fall?.toFixed(4) || '',
                    r.reducedLevel?.toFixed(4) || '', r.adjustedRL?.toFixed(4) || '', '',
                  ]),
                )
                downloadCSV(csv, 'levelling-observations')
              }}
              className="btn btn-secondary inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> {t('toolUI.exportCsv')}
            </button>
          </>
        )}
      </div>

      {result && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="card">
            <div className="card-header flex justify-between items-center">
              <span className="label">Results — {methodLabel}</span>
              <div className="flex items-center gap-2">
                <span className={`badge ${closure?.status === 'unknown' ? '' : closure?.status === 'acceptable' ? 'badge-success' : 'badge-error'}`}>
                  {closureLabel}
                </span>
                <button
                  onClick={copyResults}
                  className="text-xs text-[var(--accent)] hover:text-[var(--accent-dim)] transition-colors"
                >
                  {copied ? t('toolUI.copied') : 'Copy'}
                </button>
              </div>
            </div>
            <div className="card-body space-y-3">
              <ResultRow label="Method" value={methodLabel} />
              <ResultRow label="Misclosure" value={misclosureLabel} />
              <p className="text-sm text-[var(--text-muted)]">{closure?.message}. Numerical results do not establish field verification, adopted project criteria or professional approval.</p>
              <ResultRow
                label="Allowable (C = 10√K mm)"
                value={result.allowableMisclosure !== undefined ? `±${(result.allowableMisclosure * 1000).toFixed(3)} mm` : 'Unverified (route length required)'}
              />
              <ResultRow
                label="Arithmetic Check (ΣBS − ΣFS = Last RL − First RL)"
                value={result.arithmeticCheck ? 'PASS ' : 'FAIL [x]'}
                highlight={result.arithmeticCheck}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="label">Summary</span>
            </div>
            <div className="card-body space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b border-[var(--border-color)]">
                <span className="text-[var(--text-secondary)]">Opening RL</span>
                <span className="font-mono">{bm} m</span>
              </div>
              {result.readings.length > 0 && (
                <div className="flex justify-between py-2 border-b border-[var(--border-color)]">
                  <span className="text-[var(--text-secondary)]">Final RL (Raw)</span>
                  <span className="font-mono">{result.readings[result.readings.length - 1]?.reducedLevel?.toFixed(4)} m</span>
                </div>
              )}
              {result.readings.some((r: LevelingReading) => r.adjustedRL !== undefined) && (
                <div className="flex justify-between py-2 border-b border-[var(--border-color)]">
                  <span className="text-[var(--text-secondary)]">Final RL (Adjusted)</span>
                  <span className="font-mono result-accent">
                    {result.readings[result.readings.length - 1]?.adjustedRL?.toFixed(4)} m
                  </span>
                </div>
              )}
            </div>
          </div>

          {steps ? (
            <div className="md:col-span-2">
              <SolutionStepsRenderer title={solutionTitle} steps={steps} />
            </div>
          ) : null}

          {result && result.readings.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowProfile(!showProfile)}
                className="w-full px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-hover)] text-[var(--text-primary)] rounded"
              >
                {showProfile ? 'Hide Profile' : 'View Longitudinal Profile'}
              </button>

              {showProfile && (
                <div className="mt-4 bg-[color-mix(in_srgb,var(--bg-secondary)_50%,transparent)] border border-[var(--border-color)] rounded-xl p-4">
                  <h3 className="font-semibold text-[var(--text-primary)] mb-4">Longitudinal Profile</h3>
                  <LevelingProfile readings={result.readings} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-[var(--border-color)]">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      <span className={`font-mono ${highlight !== undefined ? (highlight ? 'result-positive' : 'result-negative') : ''}`}>
        {value}
      </span>
    </div>
  );
}

function LevelingProfile({ readings }: { readings: LevelingReading[] }) {
  const width = 600;
  const height = 250;
  const padding = 50;

  const validReadings = readings.filter((r): r is LevelingReading & { reducedLevel: number } => r.reducedLevel !== undefined);
  if (validReadings.length === 0) return null;

  const rls = validReadings.map((r) => (r.adjustedRL !== undefined ? r.adjustedRL : r.reducedLevel));
  const minRL = Math.min(...rls) - 0.5;
  const maxRL = Math.max(...rls) + 0.5;
  const maxIdx = validReadings.length - 1;

  const toX = (idx: number) => maxIdx > 0 ? padding + (idx / maxIdx) * (width - padding * 2) : width / 2;
  const toY = (rl: number) => height - padding - ((rl - minRL) / (maxRL - minRL)) * (height - padding * 2);

  const pathData = validReadings.map((r, i) => {
    const rl = r.adjustedRL ?? r.reducedLevel;
    return `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(rl)}`;
  }).join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="bg-[var(--bg-secondary)] rounded border border-amber-500/30">
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5"/>
        </pattern>
      </defs>
      <rect width={width} height={height} fill="url(#grid)"/>
      <path d={pathData} stroke="#D17B47" strokeWidth={2} fill="none"/>
      {validReadings.map((r, i) => {
        const rl = r.adjustedRL ?? r.reducedLevel;
        return (
          <g key={r.station}>
            <circle cx={toX(i)} cy={toY(rl)} r={4} fill="#D17B47"/>
            <text x={toX(i)} y={height - 10} fill="white" fontSize={9} textAnchor="middle">{r.station}</text>
            <text x={toX(i)} y={toY(rl) - 8} fill="white" fontSize={7} textAnchor="middle">{rl.toFixed(2)}</text>
          </g>
        );
      })}
      <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="white" strokeWidth={1}/>
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="white" strokeWidth={1}/>
      <text x={width/2} y={height - 2} fill="gray" fontSize={9} textAnchor="middle">Station</text>
      <text x={12} y={height/2} fill="gray" fontSize={9} textAnchor="middle" transform={`rotate(-90, 12, ${height/2})`}>Reduced Level (m)</text>
    </svg>
  );
}
