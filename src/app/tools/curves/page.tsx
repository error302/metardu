'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import SolutionStepsRenderer from '@/components/SolutionStepsRenderer'
import type { SolutionStep } from '@/lib/engine/solution/solutionBuilder'
import { compoundCurveSolved, reverseCurveSolved, simpleCurveSolved } from '@/lib/engine/solution/wrappers/curves'
import { PageHeader } from '@/components/shared/PageHeader'
import { generatePDF, downloadCSV, toCSV } from '@/lib/export/helpers'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface StakePoint { chainage: number; chordLength?: number; totalDeflection?: string; deflectionAngle?: string }
interface RdmValidation { status: string; flags: string[] }
import { SpiralAlignmentTab } from '@/components/tools/SpiralAlignmentTab'
import { SimpleCurveDiagram } from '@/components/tools/SimpleCurveDiagram'
import VerticalCurveCalculator from '@/components/road-design/VerticalCurveCalculator'

type CurveType = 'simple' | 'compound' | 'reverse' | 'vertical' | 'spiral-alignment';

export default function CurvesCalculator() {
  const { t } = useLanguage()
  const [curveType, setCurveType] = useState<CurveType>('simple');
  const [input, setInput] = useState({
    radius: '300',
    defDeg: '20',
    defMin: '00',
    defSec: '00',
    piChain: '2500.00',
    interval: '20',
    r1: '200',
    r2: '400',
    delta1: '15',
    delta2: '15',
    commonChainage: '1000',
    r1_rev: '250',
    r2_rev: '300',
    abDistance: '150'
  });
  const [result, setResult] = useState<null | { type: CurveType; title?: string; steps: SolutionStep[]; stakePoints?: StakePoint[]; stakeout?: import('@/lib/engine/types').CurveStakeoutResult }>(null);
  const [rdmValidation, setRdmValidation] = useState<RdmValidation | null>(null);

  const calculate = async () => {
    if (curveType === 'simple') {
      const R = parseFloat(input.radius);
      const piChainage = parseFloat(input.piChain);
      const interval = parseFloat(input.interval);
      const deflectionDec = (parseFloat(input.defDeg) || 0) + (parseFloat(input.defMin) || 0) / 60 + (parseFloat(input.defSec) || 0) / 3600
      if (isNaN(R) || isNaN(deflectionDec) || isNaN(piChainage) || isNaN(interval)) return;
      const s = simpleCurveSolved({ radius: R, deflectionDeg: deflectionDec, piChainage, interval });
      setResult({ type: 'simple', title: s.solution.title, steps: s.steps, stakePoints: s.result.points, stakeout: s.result });
    } else if (curveType === 'compound') {
      const R1 = parseFloat(input.r1);
      const R2 = parseFloat(input.r2);
      const delta1 = parseFloat(input.delta1);
      const delta2 = parseFloat(input.delta2);
      const commonChainage = parseFloat(input.commonChainage);
      if ([R1, R2, delta1, delta2, commonChainage].some((n) => isNaN(n))) return;
      const s = compoundCurveSolved({ R1, R2, delta1Deg: delta1, delta2Deg: delta2, junctionChainage: commonChainage });
      setResult({ type: 'compound', title: s.solution.title, steps: s.steps });
    } else if (curveType === 'reverse') {
      const R1 = parseFloat(input.r1_rev);
      const R2 = parseFloat(input.r2_rev);
      const AB = parseFloat(input.abDistance);
      if (isNaN(R1) || isNaN(R2) || isNaN(AB)) return;
      const s = reverseCurveSolved({ R1, R2, AB });
      setResult({ type: 'reverse', title: s.solution.title, steps: s.steps });
    }

    try {
      const radius = curveType === 'simple'
        ? parseFloat(input.radius || '0')
        : curveType === 'compound'
        ? Math.min(parseFloat(input.r1 || '0'), parseFloat(input.r2 || '0'))
        : Math.min(parseFloat(input.r1_rev || '0'), parseFloat(input.r2_rev || '0'))
      const rdmRes = await fetch('/api/validate-geometry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ radius, designSpeed: 80, terrain: 'rolling', gradient: 0 })
      });
      const rdmData = await rdmRes.json() as RdmValidation;
      setRdmValidation(rdmData);
    } catch {}
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title={curveType === 'vertical' ? 'Vertical Curve' : t('tools.curves')}
        subtitle={t('tools.curvesDesc')}
        reference={curveType === 'vertical' ? 'Symmetrical parabolic geometry · Criteria and datum not verified' : curveType === 'spiral-alignment' ? 'Symmetric clothoid transitions · Draft design geometry' : 'RDM 1.1 (2025) Geometric Design | Kenya Highway Design Manual'}
      />

      <div className="flex gap-2 mb-6 flex-wrap">
        <button onClick={() => { setCurveType('simple'); setResult(null); }} className={`px-4 py-2 rounded-lg font-medium ${curveType === 'simple' ? 'bg-[var(--accent)] text-black' : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'}`}>Simple Curve</button>
        <button onClick={() => { setCurveType('compound'); setResult(null); }} className={`px-4 py-2 rounded-lg font-medium ${curveType === 'compound' ? 'bg-[var(--accent)] text-black' : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'}`}>Compound Curve</button>
        <button onClick={() => { setCurveType('reverse'); setResult(null); }} className={`px-4 py-2 rounded-lg font-medium ${curveType === 'reverse' ? 'bg-[var(--accent)] text-black' : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'}`}>Reverse Curve</button>
        <button onClick={() => { setCurveType('vertical'); setResult(null); }} className={`px-4 py-2 rounded-lg font-medium ${curveType === 'vertical' ? 'bg-[var(--accent)] text-black' : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'}`}>Vertical Curve</button>
        <button onClick={() => { setCurveType('spiral-alignment'); setResult(null); }} className={`px-4 py-2 rounded-lg font-medium ${curveType === 'spiral-alignment' ? 'bg-[var(--accent)] text-black' : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'}`} title="Clothoid entry and exit transitions with station schedules">Spiral Alignment</button>
      </div>

      {curveType === 'spiral-alignment' ? (
        <SpiralAlignmentTab />
      ) : curveType === 'vertical' ? (
        <div className="min-w-0 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4 sm:p-6"><VerticalCurveCalculator /></div>
      ) : (
      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-[color-mix(in_srgb,var(--bg-secondary)_50%,transparent)] border border-[var(--border-color)] rounded-xl p-6">
            {curveType === 'simple' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div><label htmlFor="cv-radius" className="label">Radius (m)</label><input id="cv-radius" className="input" value={input.radius} onChange={e => setInput({...input, radius: e.target.value})} /></div>
                  <div><div className="label">Deflection (DMS)</div>
                    <div className="grid grid-cols-3 gap-1">
                      <input aria-label="Deflection degrees" className="input" value={input.defDeg} onChange={e => setInput({...input, defDeg: e.target.value})} />
                      <input aria-label="Deflection minutes" className="input" value={input.defMin} onChange={e => setInput({...input, defMin: e.target.value})} />
                      <input aria-label="Deflection seconds" className="input" value={input.defSec} onChange={e => setInput({...input, defSec: e.target.value})} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div><label htmlFor="cv-pi-chain" className="label">PI Chainage (m)</label><input id="cv-pi-chain" className="input" value={input.piChain} onChange={e => setInput({...input, piChain: e.target.value})} /></div>
                  <div><label htmlFor="cv-interval" className="label">Interval (m)</label><input id="cv-interval" className="input" value={input.interval} onChange={e => setInput({...input, interval: e.target.value})} /></div>
                </div>
              </>
            )}
            {curveType === 'compound' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div><label htmlFor="cv-r1" className="label">Radius R1 (m)</label><input id="cv-r1" className="input" value={input.r1} onChange={e => setInput({...input, r1: e.target.value})} /></div>
                  <div><label htmlFor="cv-r2" className="label">Radius R2 (m)</label><input id="cv-r2" className="input" value={input.r2} onChange={e => setInput({...input, r2: e.target.value})} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div><label htmlFor="cv-delta1" className="label">Δ1 (degrees)</label><input id="cv-delta1" className="input" value={input.delta1} onChange={e => setInput({...input, delta1: e.target.value})} /></div>
                  <div><label htmlFor="cv-delta2" className="label">Δ2 (degrees)</label><input id="cv-delta2" className="input" value={input.delta2} onChange={e => setInput({...input, delta2: e.target.value})} /></div>
                </div>
                <div className="mt-4"><label htmlFor="cv-common-chain" className="label">Junction Chainage (m)</label><input id="cv-common-chain" className="input" value={input.commonChainage} onChange={e => setInput({...input, commonChainage: e.target.value})} /></div>
              </>
            )}
            {curveType === 'reverse' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div><label htmlFor="cv-r1-rev" className="label">Radius R1 (m)</label><input id="cv-r1-rev" className="input" value={input.r1_rev} onChange={e => setInput({...input, r1_rev: e.target.value})} /></div>
                  <div><label htmlFor="cv-r2-rev" className="label">Radius R2 (m)</label><input id="cv-r2-rev" className="input" value={input.r2_rev} onChange={e => setInput({...input, r2_rev: e.target.value})} /></div>
                </div>
                <div className="mt-4"><label htmlFor="cv-ab-dist" className="label">Distance AB (m)</label><input id="cv-ab-dist" className="input" value={input.abDistance} onChange={e => setInput({...input, abDistance: e.target.value})} /></div>
              </>
            )}
          </div>
          <div className="space-y-3">
            <button
              onClick={calculate}
              className="w-full px-6 py-4 bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-black font-bold rounded-lg">
              {t('toolUI.calculate')}
            </button>
            {result && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (result && result.steps) {
                      generatePDF(
                        { title: `${curveType.charAt(0).toUpperCase() + curveType.slice(1)} Curve Data Sheet`, reference: 'RDM 1.1 (2025) | Kenya Highway Design Manual' },
                        [
                          { title: 'Computation Steps', rows: result.steps.map((s: SolutionStep) => ({ label: s.label, value: s.result || s.computation || '—' })) },
                        ],
                        result.stakePoints ? [
                          { title: 'Stakeout Table', headers: ['Chainage', 'Chord (m)', 'Deflection'], rows: result.stakePoints.map((p: StakePoint) => [p.chainage.toFixed(3), p.chordLength?.toFixed(3) ?? '—', p.totalDeflection ?? p.deflectionAngle ?? '—']) },
                        ] : [],
                      )
                    }
                  }}
                  className="btn btn-secondary flex-1 inline-flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" /> {t('toolUI.exportPdf')}
                </button>
                <button
                  onClick={() => {
                    if (result) {
                      const csv = toCSV(
                        ['Parameter', 'Value'],
                        result.steps.map((s: SolutionStep) => [s.label, s.result || s.computation || '—']),
                      )
                      downloadCSV(csv, `${curveType}-curve-data`)
                    }
                  }}
                  className="btn btn-secondary flex-1 inline-flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" /> {t('toolUI.exportCsv')}
                </button>
              </div>
            )}
          </div>
        </div>


        {result && (
          <div className="bg-[color-mix(in_srgb,var(--bg-secondary)_50%,transparent)] border border-[var(--border-color)] rounded-xl p-6">
            <SolutionStepsRenderer title={result.title} steps={result.steps} />
            {result.type === 'simple' && result.stakeout?.elements && (
              <div className="mt-6">
                <SimpleCurveDiagram
                  radius={result.stakeout.elements.radius}
                  deflectionDeg={result.stakeout.elements.deflectionAngle}
                  tangentLength={result.stakeout.elements.tangentLength}
                  arcLength={result.stakeout.elements.arcLength}
                  longChord={result.stakeout.elements.longChord}
                  externalDistance={result.stakeout.elements.externalDistance}
                  midOrdinate={result.stakeout.elements.midOrdinate}
                  pcChainage={result.stakeout.pcChainage}
                  piChainage={result.stakeout.piChainage}
                  ptChainage={result.stakeout.ptChainage}
                />
              </div>
            )}
            {result.type === 'simple' && result.stakePoints && result.stakePoints.length > 0 ? (
              <div className="mt-6">
                <h3 className="font-semibold text-[var(--text-primary)] mb-3">Stakeout Table</h3>
                <div className="max-h-56 overflow-y-auto text-sm border border-[var(--border-color)] rounded">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-950/40">
                        <th className="text-left px-3 py-2">Chainage</th>
                        <th className="text-right px-3 py-2">Chord (m)</th>
                        <th className="text-right px-3 py-2">Deflection</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.stakePoints.map((p: StakePoint, i: number) => (
                        <tr key={`item-${i}`} className="border-t border-[var(--border-color)]">
                          <td className="px-3 py-2 font-mono">{p.chainage.toFixed(3)}</td>
                          <td className="px-3 py-2 text-right font-mono">{p.chordLength?.toFixed?.(3) ?? '—'}</td>
                          <td className="px-3 py-2 text-right font-mono">{p.totalDeflection ?? p.deflectionAngle ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            {rdmValidation && (
              <div className="mt-6 p-4 border rounded-lg" style={{ backgroundColor: rdmValidation.status === 'GREEN' ? '#10b98120' : rdmValidation.status === 'YELLOW' ? '#f59e0b20' : '#ef444420' }}>
                <h4 className="font-bold mb-2">RDM 1.3 Compliance: <span style={{ color: rdmValidation.status === 'GREEN' ? '#10b981' : rdmValidation.status === 'YELLOW' ? '#f59e0b' : '#ef4444' }}>{rdmValidation.status}</span></h4>
                {rdmValidation.flags.map((flag: string, i: number) => (
                  <p key={`item-${i}`} className="text-sm mb-1">{flag}</p>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
      )}
    </div>
  );
}
