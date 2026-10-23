'use client';

import { useEffect, useRef, useState } from 'react';
import SolutionStepsRenderer from '@/components/SolutionStepsRenderer'
import type { SolutionStep } from '@/lib/engine/solution/solutionBuilder'
import { compoundCurveSolved, reverseCurveSolved, simpleCurveSolved } from '@/lib/engine/solution/wrappers/curves'
import { PageHeader } from '@/components/shared/PageHeader'
import { curvePlanDraftCsv, type CurvePlanSnapshot } from '@/lib/engineering/curvePlanDraftCsv'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface StakePoint { chainage: number; chordLength?: number; totalDeflection?: string; deflectionAngle?: string }
import { SpiralAlignmentTab } from '@/components/tools/SpiralAlignmentTab'
import { SimpleCurveDiagram } from '@/components/tools/SimpleCurveDiagram'
import VerticalCurveCalculator from '@/components/road-design/VerticalCurveCalculator'

type CurveType = 'simple' | 'compound' | 'reverse' | 'vertical' | 'spiral-alignment';

export default function CurvesCalculator() {
  const { t } = useLanguage()
  const [curveType, setCurveType] = useState<CurveType>('simple');
  const [input, setInput] = useState({
    radius: '',
    defDeg: '',
    defMin: '00',
    defSec: '00',
    piChain: '',
    interval: '20',
    r1: '',
    r2: '',
    delta1: '',
    delta2: '',
    commonChainage: '',
    r1_rev: '',
    r2_rev: '',
    revDelta1: '', revDelta2: '',
    abDistance: ''
  });
  const [result, setResult] = useState<null | { snapshot: CurvePlanSnapshot; type: CurveType; title?: string; steps: SolutionStep[]; stakePoints?: StakePoint[]; stakeout?: import('@/lib/engine/types').CurveStakeoutResult }>(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const revision = useRef(0);
  useEffect(() => () => { revision.current++ }, []);
  function clear() { revision.current++; setResult(null); setError(''); setExporting(false); }
  function edit(values: typeof input) { clear(); setInput(values); }
  function numeric(text: string, name: string) {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text.trim()) || !Number.isFinite(Number(text))) throw new Error(`${name} requires a finite number.`);
    return Number(text);
  }
  const calculate = () => {
    clear();
    try {
      if (curveType === 'simple') {
        const radius = numeric(input.radius, 'Radius'), piChainage = numeric(input.piChain, 'PI chainage'), interval = numeric(input.interval, 'Interval');
        const degrees = numeric(input.defDeg, 'Degrees'), minutes = numeric(input.defMin, 'Minutes'), seconds = numeric(input.defSec, 'Seconds');
        if (!Number.isInteger(degrees) || degrees < 0 || degrees >= 180 || !Number.isInteger(minutes) || minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) throw new Error('Supply valid DMS: integer degrees 0–179, minutes 0–59, seconds 0 to less than 60.');
        const deflectionDeg = degrees + minutes / 60 + seconds / 3600;
        const supplied = { radius, piChainage, interval, deflectionDeg };
        const s = simpleCurveSolved(supplied), r = s.result, e = r.elements;
        setResult({ type: 'simple', title: s.solution.title, steps: s.steps, stakePoints: r.points, stakeout: r,
          snapshot: { kind: 'simple', input: supplied, values: { tangent_m: e.tangentLength, arc_m: e.arcLength, long_chord_m: e.longChord,
            external_m: e.externalDistance, mid_ordinate_m: e.midOrdinate, PC_m: r.pcChainage, PI_m: r.piChainage, PT_m: r.ptChainage }, points: r.points } });
      } else if (curveType === 'compound') {
        const supplied = { R1: numeric(input.r1, 'First radius'), R2: numeric(input.r2, 'Second radius'), delta1Deg: numeric(input.delta1, 'First deflection'),
          delta2Deg: numeric(input.delta2, 'Second deflection'), junctionChainage: numeric(input.commonChainage, 'PCC chainage') };
        const s = compoundCurveSolved(supplied), r = s.result;
        setResult({ type: 'compound', title: s.solution.title, steps: s.steps,
          snapshot: { kind: 'compound', input: supplied, values: { first_tangent_m: r.t1, second_tangent_m: r.t2, first_arc_m: r.l1, second_arc_m: r.l2, total_arc_m: r.totalLength, PC_m: r.chainT1, PCC_m: r.chainJ, PT_m: r.chainT2 } } });
      } else if (curveType === 'reverse') {
        const supplied = { R1: numeric(input.r1_rev, 'First radius'), R2: numeric(input.r2_rev, 'Second radius'), AB: numeric(input.abDistance, 'PI distance'),
          delta1: numeric(input.revDelta1, 'First deflection'), delta2: numeric(input.revDelta2, 'Second deflection') };
        const s = reverseCurveSolved(supplied), r = s.result;
        setResult({ type: 'reverse', title: s.solution.title, steps: s.steps,
          snapshot: { kind: 'reverse', input: supplied, values: { first_tangent_m: r.t1, second_tangent_m: r.t2, first_arc_m: r.l1, second_arc_m: r.l2,
            intervening_tangent_m: r.commonTangent, arc_sum_m: r.arcLength, total_path_m: r.totalLength } } });
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to calculate this geometry.'); }
  };
  async function exportDraft(format: 'pdf' | 'csv') {
    if (!result) return;
    const snapshot = result.snapshot, current = revision.current;
    setExporting(true); setError('');
    try {
      let content: string | Uint8Array;
      if (format === 'csv') content = curvePlanDraftCsv(snapshot);
      else {
        const renderer = await import('@/lib/engineering/curvePlanDraftPdf');
        if (current !== revision.current) return;
        content = renderer.curvePlanDraftPdf(snapshot);
      }
      const url = URL.createObjectURL(new Blob([typeof content === 'string' ? content : new Uint8Array(content).buffer], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/pdf' }));
      const anchor = document.createElement('a');
      try { anchor.href = url; anchor.download = `${snapshot.kind}-curve-local-draft.${format}`; document.body.appendChild(anchor); anchor.click(); }
      finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (cause) { if (current === revision.current) setError(cause instanceof Error ? cause.message : 'Unable to export this calculation.'); }
    finally { if (current === revision.current) setExporting(false); }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title={curveType === 'vertical' ? 'Vertical Curve' : t('tools.curves')}
        subtitle={t('tools.curvesDesc')}
        reference={curveType === 'vertical' ? 'Symmetrical parabolic geometry · Criteria and datum not verified' : curveType === 'spiral-alignment' ? 'Symmetric clothoid transitions · Draft design geometry' : 'Declared circular geometry · Standard compliance and project placement not assessed'}
      />

      <div className="flex gap-2 mb-6 flex-wrap">
        <button onClick={() => { setCurveType('simple'); clear(); }} className={`px-4 py-2 rounded-lg font-medium ${curveType === 'simple' ? 'bg-[var(--accent)] text-black' : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'}`}>Simple Curve</button>
        <button onClick={() => { setCurveType('compound'); clear(); }} className={`px-4 py-2 rounded-lg font-medium ${curveType === 'compound' ? 'bg-[var(--accent)] text-black' : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'}`}>Compound Curve</button>
        <button onClick={() => { setCurveType('reverse'); clear(); }} className={`px-4 py-2 rounded-lg font-medium ${curveType === 'reverse' ? 'bg-[var(--accent)] text-black' : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'}`}>Reverse Curve</button>
        <button onClick={() => { setCurveType('vertical'); clear(); }} className={`px-4 py-2 rounded-lg font-medium ${curveType === 'vertical' ? 'bg-[var(--accent)] text-black' : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'}`}>Vertical Curve</button>
        <button onClick={() => { setCurveType('spiral-alignment'); clear(); }} className={`px-4 py-2 rounded-lg font-medium ${curveType === 'spiral-alignment' ? 'bg-[var(--accent)] text-black' : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'}`} title="Clothoid entry and exit transitions with station schedules">Spiral Alignment</button>
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
                  <div><label htmlFor="cv-radius" className="label">Radius (m)</label><input id="cv-radius" className="input" value={input.radius} onChange={e => edit({...input, radius: e.target.value})} /></div>
                  <div><div className="label">Deflection (DMS)</div>
                    <div className="grid grid-cols-3 gap-1">
                      <input aria-label="Deflection degrees" className="input" value={input.defDeg} onChange={e => edit({...input, defDeg: e.target.value})} />
                      <input aria-label="Deflection minutes" className="input" value={input.defMin} onChange={e => edit({...input, defMin: e.target.value})} />
                      <input aria-label="Deflection seconds" className="input" value={input.defSec} onChange={e => edit({...input, defSec: e.target.value})} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div><label htmlFor="cv-pi-chain" className="label">PI Chainage (m)</label><input id="cv-pi-chain" className="input" value={input.piChain} onChange={e => edit({...input, piChain: e.target.value})} /></div>
                  <div><label htmlFor="cv-interval" className="label">Interval (m)</label><input id="cv-interval" className="input" value={input.interval} onChange={e => edit({...input, interval: e.target.value})} /></div>
                </div>
              </>
            )}
            {curveType === 'compound' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div><label htmlFor="cv-r1" className="label">Radius R1 (m)</label><input id="cv-r1" className="input" value={input.r1} onChange={e => edit({...input, r1: e.target.value})} /></div>
                  <div><label htmlFor="cv-r2" className="label">Radius R2 (m)</label><input id="cv-r2" className="input" value={input.r2} onChange={e => edit({...input, r2: e.target.value})} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div><label htmlFor="cv-delta1" className="label">Δ1 (degrees)</label><input id="cv-delta1" className="input" value={input.delta1} onChange={e => edit({...input, delta1: e.target.value})} /></div>
                  <div><label htmlFor="cv-delta2" className="label">Δ2 (degrees)</label><input id="cv-delta2" className="input" value={input.delta2} onChange={e => edit({...input, delta2: e.target.value})} /></div>
                </div>
                <div className="mt-4"><label htmlFor="cv-common-chain" className="label">Junction Chainage (m)</label><p className="text-xs text-[var(--text-muted)]">PCC station where the two same-direction arcs join; PC = PCC - first arc, PT = PCC + second arc.</p><input id="cv-common-chain" className="input" value={input.commonChainage} onChange={e => edit({...input, commonChainage: e.target.value})} /></div>
              </>
            )}
            {curveType === 'reverse' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div><label htmlFor="cv-r1-rev" className="label">Radius R1 (m)</label><input id="cv-r1-rev" className="input" value={input.r1_rev} onChange={e => edit({...input, r1_rev: e.target.value})} /></div>
                  <div><label htmlFor="cv-r2-rev" className="label">Radius R2 (m)</label><input id="cv-r2-rev" className="input" value={input.r2_rev} onChange={e => edit({...input, r2_rev: e.target.value})} /></div>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-3">Opposite-turn arcs. AB is the distance from PI1 to PI2 measured along their shared tangent. The intervening gap is AB - T1 - T2; transitions and banking are not assessed.</p>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div><label htmlFor="cv-rev-delta1" className="label">Δ1 (degrees)</label><input id="cv-rev-delta1" className="input" value={input.revDelta1} onChange={e => edit({...input, revDelta1: e.target.value})} /></div>
                  <div><label htmlFor="cv-rev-delta2" className="label">Δ2 (degrees)</label><input id="cv-rev-delta2" className="input" value={input.revDelta2} onChange={e => edit({...input, revDelta2: e.target.value})} /></div>
                </div>
                <div className="mt-4"><label htmlFor="cv-ab-dist" className="label">Distance AB (m)</label><input id="cv-ab-dist" className="input" value={input.abDistance} onChange={e => edit({...input, abDistance: e.target.value})} /></div>
              </>
            )}
          </div>
          <div className="space-y-3">
            <button
              onClick={calculate}
              className="w-full px-6 py-4 bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-black font-bold rounded-lg">
              {t('toolUI.calculate')}
            </button>
            {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
            {result && <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={exporting} onClick={() => void exportDraft('pdf')} className="btn btn-secondary">Export Local Draft PDF</button>
                <button type="button" disabled={exporting} onClick={() => void exportDraft('csv')} className="btn btn-secondary">Export Local Draft CSV</button>
              </div>
              <p role="status" className="text-xs text-[var(--text-muted)]">Local calculation draft. Standard compliance, sight distance, transition design and CRS placement are NOT ASSESSED.</p>
            </div>}
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
                        <th className="text-right px-3 py-2">Chord from PC (m)</th>
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

          </div>
        )}

      </div>
      )}
    </div>
  );
}
