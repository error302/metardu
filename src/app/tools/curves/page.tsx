'use client';

import { useState } from 'react';
import { curveStakeout } from '@/lib/engine/curves';

type CurveType = 'simple' | 'compound' | 'reverse';

export default function CurvesCalculator() {
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
  const [result, setResult] = useState<any>(null);

  const dmsToDecimal = (d: number, m: number, s: number) => d + m/60 + s/3600;

  const calculate = () => {
    if (curveType === 'simple') {
      const R = parseFloat(input.radius);
      const deflectionDec = dmsToDecimal(parseInt(input.defDeg)||0, parseInt(input.defMin)||0, parseFloat(input.defSec)||0);
      const piChainage = parseFloat(input.piChain);
      const interval = parseFloat(input.interval);

      if (isNaN(R) || isNaN(deflectionDec)) return;

      const deltaRad = deflectionDec * Math.PI / 180;
      const halfDelta = deltaRad / 2;
      const PI = 3.14159265;

      const T = R * Math.tan(halfDelta);
      const L = (PI * R * deflectionDec) / 180;
      const C = 2 * R * Math.sin(halfDelta);
      const M = R * (1 - Math.cos(halfDelta));
      const E = R * (1 / Math.cos(halfDelta) - 1);
      const chainT1 = piChainage - T;
      const chainT2 = chainT1 + L;
      const stakePoints = curveStakeout(R, deflectionDec, chainT1, interval);

      setResult({ type: 'simple', T: T.toFixed(4), L: L.toFixed(4), C: C.toFixed(4), M: M.toFixed(4), E: E.toFixed(4), chainT1: chainT1.toFixed(3), chainPI: piChainage.toFixed(3), chainT2: chainT2.toFixed(3), stakePoints });
    } else if (curveType === 'compound') {
      const R1 = parseFloat(input.r1);
      const R2 = parseFloat(input.r2);
      const delta1 = parseFloat(input.delta1);
      const delta2 = parseFloat(input.delta2);
      const commonChainage = parseFloat(input.commonChainage);

      if (isNaN(R1) || isNaN(R2)) return;

      const t1 = R1 * Math.tan((delta1 * Math.PI / 180) / 2);
      const t2 = R2 * Math.tan((delta2 * Math.PI / 180) / 2);
      const l1 = (Math.PI * R1 * delta1) / 180;
      const l2 = (Math.PI * R2 * delta2) / 180;
      const totalLength = l1 + l2;
      const chainJ = commonChainage;
      const chainT1 = chainJ - t1;
      const chainT2 = chainJ + t2;

      setResult({ type: 'compound', R1, R2, delta1, delta2, t1: t1.toFixed(4), t2: t2.toFixed(4), l1: l1.toFixed(4), l2: l2.toFixed(4), totalLength: totalLength.toFixed(4), chainT1: chainT1.toFixed(3), chainJ: chainJ.toFixed(3), chainT2: chainT2.toFixed(3) });
    } else if (curveType === 'reverse') {
      const R1 = parseFloat(input.r1_rev);
      const R2 = parseFloat(input.r2_rev);
      const AB = parseFloat(input.abDistance);

      if (isNaN(R1) || isNaN(R2) || isNaN(AB)) return;

      const commonTangent = Math.sqrt(AB * AB - Math.pow(R2 - R1, 2));
      const totalLength = (Math.PI * R1) + (Math.PI * R2);

      setResult({ type: 'reverse', R1, R2, AB, commonTangent: commonTangent.toFixed(4), totalLength: totalLength.toFixed(4) });
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Curve Calculator</h1>
      <p className="text-sm text-gray-500 mb-8">Horizontal curve calculations</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        <button onClick={() => { setCurveType('simple'); setResult(null); }} className={`px-4 py-2 rounded-lg font-medium ${curveType === 'simple' ? 'bg-[#E8841A] text-black' : 'bg-gray-800 text-gray-300'}`}>Simple Curve</button>
        <button onClick={() => { setCurveType('compound'); setResult(null); }} className={`px-4 py-2 rounded-lg font-medium ${curveType === 'compound' ? 'bg-[#E8841A] text-black' : 'bg-gray-800 text-gray-300'}`}>Compound Curve</button>
        <button onClick={() => { setCurveType('reverse'); setResult(null); }} className={`px-4 py-2 rounded-lg font-medium ${curveType === 'reverse' ? 'bg-[#E8841A] text-black' : 'bg-gray-800 text-gray-300'}`}>Reverse Curve</button>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            {curveType === 'simple' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="label">Radius (m)</label><input className="input" value={input.radius} onChange={e => setInput({...input, radius: e.target.value})} /></div>
                  <div><label className="label">Deflection (° ' ")</label>
                    <div className="grid grid-cols-3 gap-1">
                      <input className="input" value={input.defDeg} onChange={e => setInput({...input, defDeg: e.target.value})} />
                      <input className="input" value={input.defMin} onChange={e => setInput({...input, defMin: e.target.value})} />
                      <input className="input" value={input.defSec} onChange={e => setInput({...input, defSec: e.target.value})} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div><label className="label">PI Chainage (m)</label><input className="input" value={input.piChain} onChange={e => setInput({...input, piChain: e.target.value})} /></div>
                  <div><label className="label">Interval (m)</label><input className="input" value={input.interval} onChange={e => setInput({...input, interval: e.target.value})} /></div>
                </div>
              </>
            )}
            {curveType === 'compound' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="label">Radius R1 (m)</label><input className="input" value={input.r1} onChange={e => setInput({...input, r1: e.target.value})} /></div>
                  <div><label className="label">Radius R2 (m)</label><input className="input" value={input.r2} onChange={e => setInput({...input, r2: e.target.value})} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div><label className="label">Δ1 (degrees)</label><input className="input" value={input.delta1} onChange={e => setInput({...input, delta1: e.target.value})} /></div>
                  <div><label className="label">Δ2 (degrees)</label><input className="input" value={input.delta2} onChange={e => setInput({...input, delta2: e.target.value})} /></div>
                </div>
                <div className="mt-4"><label className="label">Junction Chainage (m)</label><input className="input" value={input.commonChainage} onChange={e => setInput({...input, commonChainage: e.target.value})} /></div>
              </>
            )}
            {curveType === 'reverse' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="label">Radius R1 (m)</label><input className="input" value={input.r1_rev} onChange={e => setInput({...input, r1_rev: e.target.value})} /></div>
                  <div><label className="label">Radius R2 (m)</label><input className="input" value={input.r2_rev} onChange={e => setInput({...input, r2_rev: e.target.value})} /></div>
                </div>
                <div className="mt-4"><label className="label">Distance AB (m)</label><input className="input" value={input.abDistance} onChange={e => setInput({...input, abDistance: e.target.value})} /></div>
              </>
            )}
          </div>
          <button onClick={calculate} className="w-full px-6 py-4 bg-[#E8841A] hover:bg-[#d67715] text-black font-bold rounded-lg">Calculate</button>
        </div>

        {result && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            {result.type === 'simple' && (
              <>
                <h3 className="font-semibold text-gray-200 mb-4">Simple Curve Results</h3>
                <ResultRow label="Tangent T" value={`${result.T} m`} />
                <ResultRow label="Length L" value={`${result.L} m`} />
                <ResultRow label="Chord C" value={`${result.C} m`} />
                <ResultRow label="Mid-ord M" value={`${result.M} m`} />
                <ResultRow label="Apex E" value={`${result.E} m`} />
                <div className="border-t border-gray-700 my-3"></div>
                <ResultRow label="Chainage T1" value={result.chainT1} />
                <ResultRow label="Chainage PI" value={result.chainPI} />
                <ResultRow label="Chainage T2" value={result.chainT2} />
                <div className="border-t border-gray-700 my-3"></div>
                <div className="max-h-48 overflow-y-auto text-sm">
                  <table className="w-full"><thead><tr><th className="text-left">Chain</th><th className="text-right">Chord</th></tr></thead>
                    <tbody>{result.stakePoints?.map((p: any, i: number) => (<tr key={i}><td>{p.chainage.toFixed(2)}</td><td className="text-right">{p.chord.toFixed(2)}</td></tr>))}</tbody>
                  </table>
                </div>
              </>
            )}
            {result.type === 'compound' && (
              <>
                <h3 className="font-semibold text-gray-200 mb-4">Compound Curve</h3>
                <ResultRow label="R1" value={`${result.R1} m`} />
                <ResultRow label="R2" value={`${result.R2} m`} />
                <ResultRow label="Δ1" value={`${result.delta1}°`} />
                <ResultRow label="Δ2" value={`${result.delta2}°`} />
                <div className="border-t border-gray-700 my-3"></div>
                <ResultRow label="t1" value={`${result.t1} m`} />
                <ResultRow label="t2" value={`${result.t2} m`} />
                <ResultRow label="Total" value={`${result.totalLength} m`} />
                <div className="border-t border-gray-700 my-3"></div>
                <ResultRow label="T1" value={result.chainT1} />
                <ResultRow label="J" value={result.chainJ} />
                <ResultRow label="T2" value={result.chainT2} />
              </>
            )}
            {result.type === 'reverse' && (
              <>
                <h3 className="font-semibold text-gray-200 mb-4">Reverse Curve</h3>
                <ResultRow label="R1" value={`${result.R1} m`} />
                <ResultRow label="R2" value={`${result.R2} m`} />
                <ResultRow label="AB" value={`${result.AB} m`} />
                <div className="border-t border-gray-700 my-3"></div>
                <ResultRow label="Tangent" value={`${result.commonTangent} m`} />
                <ResultRow label="Total" value={`${result.totalLength} m`} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between py-1"><span className="text-gray-300 text-sm">{label}</span><span className="font-mono text-[#E8841A]">{value}</span></div>;
}
