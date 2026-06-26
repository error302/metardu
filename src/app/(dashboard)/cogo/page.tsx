'use client';

import { useState } from 'react';

type CogoOp = 'inverse' | 'forward' | 'lineLineIntersection';

export default function CogoPage() {
  const [operation, setOperation] = useState<CogoOp>('inverse');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [fromE, setFromE] = useState(250000);
  const [fromN, setFromN] = useState(9850000);
  const [toE, setToE] = useState(250350);
  const [toN, setToN] = useState(9850350);
  const [bearing, setBearing] = useState(45);
  const [distance, setDistance] = useState(500);

  const compute = async () => {
    setLoading(true);
    try {
      const body: any = { operation };
      if (operation === 'inverse') {
        body.from = { easting: fromE, northing: fromN };
        body.to = { easting: toE, northing: toN };
      } else if (operation === 'forward') {
        body.from = { easting: fromE, northing: fromN };
        body.bearing = bearing;
        body.distance = distance;
      }
      const res = await fetch('/api/survey/cogo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setResult(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>COGO Engine</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
        Coordinate geometry computations: inverse, forward, intersections
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="card">
          {/* Operation selector */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            {(['inverse', 'forward'] as CogoOp[]).map(op => (
              <button
                key={op}
                className={operation === op ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setOperation(op)}
                style={{ fontSize: '13px' }}
              >
                {op === 'inverse' ? 'Inverse (Bearing+Distance)' : 'Forward (Coordinates)'}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            <div style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 500 }}>
              {operation === 'inverse' ? 'From Point' : 'Origin Point'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Easting (m)</label>
                <input className="input-field" type="number" value={fromE} onChange={e => setFromE(parseFloat(e.target.value))} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Northing (m)</label>
                <input className="input-field" type="number" value={fromN} onChange={e => setFromN(parseFloat(e.target.value))} />
              </div>
            </div>

            {operation === 'inverse' ? (
              <>
                <div style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 500 }}>To Point</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Easting (m)</label>
                    <input className="input-field" type="number" value={toE} onChange={e => setToE(parseFloat(e.target.value))} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Northing (m)</label>
                    <input className="input-field" type="number" value={toN} onChange={e => setToN(parseFloat(e.target.value))} />
                  </div>
                </div>
              </>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Bearing (deg)</label>
                  <input className="input-field" type="number" step="0.0001" value={bearing} onChange={e => setBearing(parseFloat(e.target.value))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Distance (m)</label>
                  <input className="input-field" type="number" step="0.001" value={distance} onChange={e => setDistance(parseFloat(e.target.value))} />
                </div>
              </div>
            )}

            <button className="btn-primary" onClick={compute} disabled={loading} style={{ marginTop: '8px' }}>
              {loading ? 'Computing...' : 'Compute'}
            </button>
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--accent)' }}>Result</h2>
          {result ? (
            <div style={{ fontSize: '14px' }}>
              {operation === 'inverse' ? (
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Bearing</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)' }}>
                      {result.bearing?.toFixed(6)}°
                    </div>
                  </div>
                  <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Distance</div>
                    <div style={{ fontSize: '24px', fontWeight: 700 }}>
                      {result.distance?.toFixed(4)} m
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Easting</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)' }}>
                      {result.easting?.toFixed(4)}
                    </div>
                  </div>
                  <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Northing</div>
                    <div style={{ fontSize: '24px', fontWeight: 700 }}>
                      {result.northing?.toFixed(4)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Select operation, enter values, and click Compute
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
