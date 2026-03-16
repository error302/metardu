'use client';

import { useState } from 'react';
import SolutionRenderer from '@/components/SolutionRenderer'
import type { Solution } from '@/lib/solution/schema'
import { distanceBearingSolutionFromCoords } from '@/lib/engine/solution/wrappers/distance'

export default function MissingLineCalculator() {
  const [pointA, setPointA] = useState({ e: '', n: '' });
  const [pointB, setPointB] = useState({ e: '', n: '' });
  const [result, setResult] = useState<Solution | null>(null);

  const calculate = () => {
    const e1 = parseFloat(pointA.e);
    const n1 = parseFloat(pointA.n);
    const e2 = parseFloat(pointB.e);
    const n2 = parseFloat(pointB.n);

    if (isNaN(e1) || isNaN(n1) || isNaN(e2) || isNaN(n2)) return;

    setResult(distanceBearingSolutionFromCoords({ e1, n1, e2, n2 }));
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Missing Line</h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">Calculate distance and bearing between two points</p>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="card">
          <div className="card-header"><span className="label">Point A → Point B</span></div>
          <div className="card-body space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Point A Easting (m)</label>
                <input className="input" value={pointA.e} onChange={e => setPointA({...pointA, e: e.target.value})} placeholder="500000.0000" />
              </div>
              <div>
                <label className="label">Point A Northing (m)</label>
                <input className="input" value={pointA.n} onChange={e => setPointA({...pointA, n: e.target.value})} placeholder="9500000.0000" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Point B Easting (m)</label>
                <input className="input" value={pointB.e} onChange={e => setPointB({...pointB, e: e.target.value})} placeholder="500050.0000" />
              </div>
              <div>
                <label className="label">Point B Northing (m)</label>
                <input className="input" value={pointB.n} onChange={e => setPointB({...pointB, n: e.target.value})} placeholder="9500030.0000" />
              </div>
            </div>
            <button onClick={calculate} className="btn btn-primary w-full">Calculate Missing Line</button>
          </div>
        </div>

        {result ? <SolutionRenderer solution={result} /> : null}
      </div>
    </div>
  );
}
