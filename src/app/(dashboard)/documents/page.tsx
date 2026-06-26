'use client';

import { useState } from 'react';

export default function DocumentsPage() {
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');

  const generateDeedPlan = async () => {
    setGenerating(true);
    setMessage('');
    try {
      const res = await fetch('/api/documents/deed-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [
            { easting: 250000, northing: 9850000, label: 'A', beaconType: 'beacon' },
            { easting: 250100, northing: 9850000, label: 'B', beaconType: 'beacon' },
            { easting: 250100, northing: 9850100, label: 'C', beaconType: 'beacon' },
            { easting: 250000, northing: 9850100, label: 'D', beaconType: 'beacon' },
          ],
          boundaries: [
            { fromIndex: 0, toIndex: 1, type: 'parcel', bearing: '90° 00\' 00"', distance: '100.000m' },
            { fromIndex: 1, toIndex: 2, type: 'parcel', bearing: '00° 00\' 00"', distance: '100.000m' },
            { fromIndex: 2, toIndex: 3, type: 'parcel', bearing: '270° 00\' 00"', distance: '100.000m' },
            { fromIndex: 3, toIndex: 0, type: 'parcel', bearing: '180° 00\' 00"', distance: '100.000m' },
          ],
          paperSize: 'A2',
          scale: 1000,
          titleData: {
            lrNumber: 'Nairobi/Block 22/123',
            area: '1.0000 Ha',
            scale: 1000,
            surveyorName: 'Demo Surveyor',
            surveyorLicense: 'LSK/1234',
            date: new Date().toISOString().split('T')[0],
            county: 'Nairobi',
            projection: 'UTM37S',
            datum: 'Arc 1960',
          },
          metadata: {
            title: 'Deed Plan - Demo Plot',
            surveyorName: 'Demo Surveyor',
            surveyorLicense: 'LSK/1234',
            projectReference: 'DEMO-001',
            date: new Date().toISOString(),
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`Deed plan generated: ${data.filename} (${(data.size / 1024).toFixed(1)} KB)`);
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      setMessage('Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>Documents</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
        Generate Kenya-standard survey documents (vector PDF)
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {/* Deed Plan */}
        <div className="card">
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>📄</div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Deed Plan</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Vector PDF with coordinate grid, title block, beacon symbols, and scale bar. Kenya standard format.
          </p>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
            <div>Paper: A1 or A2</div>
            <div>Scale: 1:500, 1:1000, 1:2500</div>
            <div>Line weights: 0.1–0.7mm</div>
          </div>
          <button className="btn-primary" onClick={generateDeedPlan} disabled={generating}>
            {generating ? 'Generating...' : 'Generate Demo'}
          </button>
          {message && <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--success)' }}>{message}</div>}
        </div>

        {/* Traverse Sheet */}
        <div className="card">
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>📊</div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Traverse Sheet</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Computation sheet with all corrections, adjusted coordinates, and misclosure ratio.
          </p>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
            <div>Paper: A4 Landscape</div>
            <div>Includes: All 7 correction stages</div>
          </div>
          <button className="btn-secondary" disabled>Coming Soon</button>
        </div>

        {/* Form C-22 */}
        <div className="card">
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>📋</div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Form C-22</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Kenya Land Registration form for deed plan submission.
          </p>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
            <div>Paper: A4 Portrait</div>
            <div>For Ardhi House submission</div>
          </div>
          <button className="btn-secondary" disabled>Coming Soon</button>
        </div>

        {/* Beacon Certificate */}
        <div className="card">
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>🏛️</div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Beacon Certificate</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Beacon preservation certificate with coordinates and description.
          </p>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
            <div>Paper: A4 Portrait</div>
          </div>
          <button className="btn-secondary" disabled>Coming Soon</button>
        </div>
      </div>
    </div>
  );
}
