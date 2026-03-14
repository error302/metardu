'use client';

import { useState } from 'react';
import { curveElements, curveStakeout } from '@/lib/engine/curves';
import { dmsToDecimal, decimalToDMS } from '@/lib/engine/angles';

export default function CurvesCalculator() {
  const [input, setInput] = useState({
    radius: '300',
    defDeg: '20',
    defMin: '00',
    defSec: '00',
    piChain: '2500.00',
    interval: '20'
  });
  const [result, setResult] = useState<any>(null);

  const calculate = () => {
    const R = parseFloat(input.radius);
    const deflectionDec = dmsToDecimal({
      degrees: parseInt(input.defDeg) || 0,
      minutes: parseInt(input.defMin) || 0,
      seconds: parseFloat(input.defSec) || 0,
      direction: 'N'
    });
    const piChainage = parseFloat(input.piChain);
    const interval = parseFloat(input.interval);

    if (isNaN(R) || isNaN(deflectionDec)) return;

    const deltaRad = deflectionDec * Math.PI / 180;
    const halfDelta = deltaRad / 2;
    const PI = 3.14159265;

    // Full precision calculations
    const T = R * Math.tan(halfDelta);  // Tangent length
    const L = (PI * R * deflectionDec) / 180;  // Curve length
    const C = 2 * R * Math.sin(halfDelta);  // Long chord
    const M = R * (1 - Math.cos(halfDelta));  // Mid-ordinate
    const E = R * (1 / Math.cos(halfDelta) - 1);  // Apex distance
    
    // Chainages
    const chainT1 = piChainage - T;
    const chainT2 = chainT1 + L;

    // Generate offsets table (every 5m from center)
    const offsets: { x: number; ox: number }[] = [];
    const halfChord = C / 2;
    for (let x = 0; x <= halfChord; x += 5) {
      const ox = Math.sqrt(R * R - x * x) - Math.sqrt(R * R - halfChord * halfChord);
      offsets.push({ x: x, ox: ox < 0 ? 0 : ox });
    }

    // Generate stakeout table
    const stakePoints = [];
    const numPoints = Math.floor(L / interval);
    for (let i = 0; i <= numPoints; i++) {
      const chord = i * interval;
      const cumulativeDefl = (1718.873 * chord / R);  // Rankine's formula in minutes
      const deflAngle = cumulativeDefl / 60;  // Convert to degrees
      stakePoints.push({
        chainage: chainT1 + chord,
        chord: chord,
        deflMinutes: cumulativeDefl.toFixed(2),
        cumulativeDefl: cumulativeDefl.toFixed(2)
      });
    }

    setResult({
      R,
      deflection: deflectionDec,
      deflectionDMS: decimalToDMS(deflectionDec, false),
      T, L, C, M, E,
      chainT1, chainT2,
      offsets,
      stakePoints,
      formulas: {
        T: `T = R × tan(Δ/2) = ${R} × tan(${deflectionDec.toFixed(4)}°/2)`,
        L: `l = πRΔ/180 = π × ${R} × ${deflectionDec.toFixed(4)} / 180`,
        C: `L = 2R × sin(Δ/2) = 2 × ${R} × sin(${halfDelta.toFixed(6)})`,
        M: `M = R(1 - cos(Δ/2)) = ${R}(1 - cos(${halfDelta.toFixed(6)}))`,
        E: `E = R(sec(Δ/2) - 1) = ${R}(sec(${halfDelta.toFixed(6)}) - 1)`,
        def: `δ = 1718.87 × chord/R (minutes)`
      },
      steps: {
        T: `tan(${halfDelta.toFixed(6)}) = ${Math.tan(halfDelta).toFixed(6)}\nT = ${R} × ${Math.tan(halfDelta).toFixed(6)} = ${T.toFixed(4)} m`,
        L: `${PI} × ${R} × ${deflectionDec.toFixed(4)} / 180 = ${L.toFixed(4)} m`,
        C: `2 × ${R} × ${Math.sin(halfDelta).toFixed(6)} = ${C.toFixed(4)} m`,
        M: `${R} × (1 - ${Math.cos(halfDelta).toFixed(6)}) = ${M.toFixed(4)} m`,
        E: `${R} × (${(1/Math.cos(halfDelta)).toFixed(6)} - 1) = ${E.toFixed(4)} m`
      }
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Horizontal Curve Calculator</h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">Basak standards — full working shown</p>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="card">
            <div className="card-header"><span className="label">Curve Parameters</span></div>
            <div className="card-body space-y-4">
              <div>
                <label className="label">Radius R (m)</label>
                <input className="input" value={input.radius} onChange={e => setInput({...input, radius: e.target.value})} placeholder="300.0000" />
              </div>
              <div>
                <label className="label">Deflection Angle Δ (DMS)</label>
                <div className="grid grid-cols-3 gap-2">
                  <input className="input" value={input.defDeg} onChange={e => setInput({...input, defDeg: e.target.value})} placeholder="20" />
                  <input className="input" value={input.defMin} onChange={e => setInput({...input, defMin: e.target.value})} placeholder="00" />
                  <input className="input" value={input.defSec} onChange={e => setInput({...input, defSec: e.target.value})} placeholder="00" />
                </div>
              </div>
              <div>
                <label className="label">PI Chainage (m)</label>
                <input className="input" value={input.piChain} onChange={e => setInput({...input, piChain: e.target.value})} placeholder="2500.000" />
              </div>
              <div>
                <label className="label">Stakeout Interval (m)</label>
                <input className="input" value={input.interval} onChange={e => setInput({...input, interval: e.target.value})} placeholder="20" />
              </div>
            </div>
          </div>
          <button onClick={calculate} className="btn btn-primary w-full">Calculate</button>
        </div>

        {result && (
          <div className="space-y-6">
            {/* Curve Elements */}
            <div className="card">
              <div className="card-header"><span className="label">Curve Elements (Basak Formula)</span></div>
              <div className="card-body space-y-3">
                <ResultRow label="Radius (R)" value={`${result.R.toFixed(4)} m`} />
                <ResultRow label="Deflection Angle (Δ)" value={`${result.deflectionDMS}`} />
                <div className="border-t border-gray-700 pt-2 mt-2">
                  <ResultRow label="Tangent Length T" value={`${result.T.toFixed(4)} m`} />
                  <div className="text-xs text-gray-500 font-mono pl-2">{result.formulas.T}</div>
                  <div className="text-xs text-gray-400 font-mono pl-2">{result.steps.T}</div>
                </div>
                <ResultRow label="Curve Length l" value={`${result.L.toFixed(4)} m`} />
                <ResultRow label="Long Chord L" value={`${result.C.toFixed(4)} m`} />
                <ResultRow label="Mid-Ordinate M" value={`${result.M.toFixed(4)} m`} />
                <ResultRow label="Apex Distance E" value={`${result.E.toFixed(4)} m`} />
                <div className="border-t border-gray-700 pt-2 mt-2">
                  <ResultRow label="Chainage T1" value={`${result.chainT1.toFixed(2)} m`} />
                  <ResultRow label="Chainage T2" value={`${result.chainT2.toFixed(2)} m`} />
                </div>
              </div>
            </div>

            {/* Offsets Table */}
            <div className="card">
              <div className="card-header"><span className="label">Offsets from Long Chord (Basak)</span></div>
              <div className="card-body">
                <p className="text-xs text-gray-500 mb-2">Formula: Ox = √(R² - x²) - √(R² - (L/2)²)</p>
                <table className="table text-xs">
                  <thead>
                    <tr><th>x (m)</th><th>Ox (m)</th></tr>
                  </thead>
                  <tbody>
                    {result.offsets.map((o: any, i: number) => (
                      <tr key={i}><td>{o.x.toFixed(2)}</td><td>{o.ox.toFixed(4)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Stakeout Table */}
            <div className="card">
              <div className="card-header"><span className="label">Deflection Angles (Rankine)</span></div>
              <div className="card-body">
                <p className="text-xs text-gray-500 mb-2">Formula: δ = 1718.87 × chord/R (minutes)</p>
                <table className="table text-xs">
                  <thead>
                    <tr><th>Chainage</th><th>Chord</th><th>Defl (min)</th></tr>
                  </thead>
                  <tbody>
                    {result.stakePoints.map((p: any, i: number) => (
                      <tr key={i}>
                        <td>{p.chainage.toFixed(2)}</td>
                        <td>{p.chord.toFixed(2)}</td>
                        <td>{p.cumulativeDefl}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-sm text-gray-300">{label}</span>
      <span className="font-mono text-[var(--accent)]">{value}</span>
    </div>
  );
}
