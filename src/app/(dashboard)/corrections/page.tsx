'use client';

import { useState } from 'react';

interface CorrectionResult {
  fromStation: string;
  toStation: string;
  rawSlopeDistance: number;
  gridDistance: number;
  atmosphericPPM?: number;
  seaLevelPPM?: number;
  lineScaleFactor?: number;
  convergence?: number;
  warnings: string[];
  correctionLog: Array<{ stage: string; input: number; output: number; correction: number; unit: string }>;
}

export default function CorrectionsPage() {
  const [form, setForm] = useState({
    fromStation: 'A',
    toStation: 'B',
    rawSlopeDistance: 500,
    verticalAngle: 90.05,
    edmConstant: 0.003,
    temperature: 22,
    pressure: 840,
    humidity: 60,
    instrumentHeight: 1.55,
    targetHeight: 1.60,
    heightAboveEllipsoid: 1700,
    fromEasting: 250000,
    fromNorthing: 9850000,
    toEasting: 250350,
    toNorthing: 9850350,
    latitude: -1.0,
    longitude: 37.5,
  });
  const [result, setResult] = useState<CorrectionResult | null>(null);
  const [loading, setLoading] = useState(false);

  const runCorrections = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/survey/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observation: form, report: true }),
      });
      const data = await res.json();
      setResult(data.result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>Corrections Pipeline</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
        Apply all P0 corrections to a single observation with full audit trail
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Input Form */}
        <div className="card">
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--accent)' }}>Observation Input</h2>
          <div style={{ display: 'grid', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>From Station</label>
                <input className="input-field" value={form.fromStation} onChange={e => setForm({...form, fromStation: e.target.value})} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>To Station</label>
                <input className="input-field" value={form.toStation} onChange={e => setForm({...form, toStation: e.target.value})} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Raw Slope Distance (m)</label>
                <input className="input-field" type="number" step="0.001" value={form.rawSlopeDistance} onChange={e => setForm({...form, rawSlopeDistance: parseFloat(e.target.value)})} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Vertical Angle (deg)</label>
                <input className="input-field" type="number" step="0.0001" value={form.verticalAngle} onChange={e => setForm({...form, verticalAngle: parseFloat(e.target.value)})} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', fontSize: '13px', color: 'var(--accent)', fontWeight: 500 }}>
              Atmospheric Conditions
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Temp (C)</label>
                <input className="input-field" type="number" value={form.temperature} onChange={e => setForm({...form, temperature: parseFloat(e.target.value)})} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Pressure (hPa)</label>
                <input className="input-field" type="number" value={form.pressure} onChange={e => setForm({...form, pressure: parseFloat(e.target.value)})} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Humidity (%)</label>
                <input className="input-field" type="number" value={form.humidity} onChange={e => setForm({...form, humidity: parseFloat(e.target.value)})} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Instrument Height (m)</label>
                <input className="input-field" type="number" step="0.01" value={form.instrumentHeight} onChange={e => setForm({...form, instrumentHeight: parseFloat(e.target.value)})} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Target Height (m)</label>
                <input className="input-field" type="number" step="0.01" value={form.targetHeight} onChange={e => setForm({...form, targetHeight: parseFloat(e.target.value)})} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Height Above Ellipsoid (m)</label>
                <input className="input-field" type="number" value={form.heightAboveEllipsoid} onChange={e => setForm({...form, heightAboveEllipsoid: parseFloat(e.target.value)})} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Latitude (deg)</label>
                <input className="input-field" type="number" step="0.0001" value={form.latitude} onChange={e => setForm({...form, latitude: parseFloat(e.target.value)})} />
              </div>
            </div>

            <button className="btn-primary" onClick={runCorrections} disabled={loading} style={{ marginTop: '8px' }}>
              {loading ? 'Computing...' : 'Run Correction Pipeline'}
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="card">
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--accent)' }}>
            Correction Result
          </h2>
          {result ? (
            <div>
              {/* Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Raw Distance</div>
                  <div style={{ fontSize: '20px', fontWeight: 700 }}>{result.rawSlopeDistance.toFixed(4)} m</div>
                </div>
                <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Grid Distance</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)' }}>{result.gridDistance.toFixed(4)} m</div>
                </div>
              </div>

              {/* Correction stages */}
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Audit Trail</h3>
              <div style={{ fontSize: '13px' }}>
                {result.correctionLog.map((log, i) => (
                  <div key={i} style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 1fr 1fr 100px',
                    gap: '8px',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--border)',
                    alignItems: 'center',
                  }}>
                    <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{i + 1}. {log.stage}</div>
                    <div style={{ color: 'var(--text-muted)' }}>{log.input.toFixed(6)} → {log.output.toFixed(6)}</div>
                    <div style={{ color: log.correction > 0 ? 'var(--success)' : log.correction < 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                      {log.correction >= 0 ? '+' : ''}{log.correction.toFixed(6)} {log.unit}
                    </div>
                  </div>
                ))}
              </div>

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--warning)', marginBottom: '8px' }}>Warnings</h3>
                  {result.warnings.map((w, i) => (
                    <div key={i} style={{ fontSize: '13px', color: 'var(--warning)', padding: '4px 0' }}>{w}</div>
                  ))}
                </div>
              )}

              {/* PPM Summary */}
              <div style={{ marginTop: '16px', padding: '12px', background: 'var(--accent-muted)', borderRadius: '6px', fontSize: '13px' }}>
                <div style={{ fontWeight: 600, color: 'var(--accent)', marginBottom: '4px' }}>PPM Summary</div>
                {result.atmosphericPPM !== undefined && <div>Atmospheric: {result.atmosphericPPM.toFixed(1)} ppm</div>}
                {result.seaLevelPPM !== undefined && <div>Sea Level: {result.seaLevelPPM.toFixed(1)} ppm</div>}
                {result.lineScaleFactor !== undefined && <div>Scale Factor: {((result.lineScaleFactor - 1) * 1e6).toFixed(1)} ppm</div>}
              </div>
            </div>
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Enter observation data and click &quot;Run Correction Pipeline&quot; to see results
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
