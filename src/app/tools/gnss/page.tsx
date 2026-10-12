'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import GNSSProcessingPanel from '@/components/gnss/GNSSProcessingPanel'
import { 
  geodeticToECEF,
  ecefToENU, 
  computeBaseline, 
  processGNSSNetwork,
} from '@/lib/geodesy/gnss';
import type { BaselineResult, GNSSBaseStation, GNSSNetworkResult } from '@/lib/geodesy/gnss';

interface Observation {
  id: number;
  name: string;
  lat: string;
  lon: string;
  h: string;
  sigma: string;
}

interface GNSSResult {
  baseline?: BaselineResult
  enu?: { easting: number; northing: number; up: number }
  baseECEF?: GNSSBaseStation
  obsECEF?: GNSSBaseStation
  points?: GNSSNetworkResult['points']
  adjustmentStats?: GNSSNetworkResult['adjustmentStats']
}

export default function GNSSProcessor() {
  const { t } = useLanguage()
  const [baseStation, setBaseStation] = useState({
    name: '',
    lat: '',
    lon: '',
    h: '',
  });
  
  const [origin, setOrigin] = useState({
    lat: '',
    lon: '',
    h: '',
  });
  
  const [observations, setObservations] = useState<Observation[]>([]);
  
  const [result, setResult] = useState<GNSSResult | null>(null);
  const [mode, setMode] = useState<'baseline' | 'network' | 'rinex'>('baseline');
  const [error, setError] = useState('')

  const addObservation = () => {
    setObservations([
      ...observations,
      { id: Date.now(), name: `POINT${observations.length + 1}`, lat: '', lon: '', h: '', sigma: '' }
    ]);
    setResult(null)
    setError('')
  };

  const updateObservation = (id: number, field: keyof Observation, value: string) => {
    setObservations(observations.map((o) => o.id === id ? { ...o, [field]: value } : o));
    setResult(null)
    setError('')
  };

  const removeObservation = (id: number) => {
    setObservations(observations.filter((o) => o.id !== id));
    setResult(null)
    setError('')
  };

  const calculate = () => {
    setResult(null)
    setError('')
    if (mode === 'rinex') return

    const numeric = (value: string) => value.trim() === '' ? Number.NaN : Number(value)
    const baseLat = numeric(baseStation.lat)
    const baseLon = numeric(baseStation.lon)
    const baseHeight = numeric(baseStation.h)
    const originLat = numeric(origin.lat)
    const originLon = numeric(origin.lon)
    const originHeight = numeric(origin.h)
    const issues: string[] = []
    if (!baseStation.name.trim()) issues.push('Enter a base station name.')
    if (!Number.isFinite(baseLat) || baseLat < -90 || baseLat > 90) issues.push('Enter a valid base latitude from -90° to 90°.')
    if (!Number.isFinite(baseLon) || baseLon < -180 || baseLon > 180) issues.push('Enter a valid base longitude from -180° to 180°.')
    if (!Number.isFinite(baseHeight)) issues.push('Enter the base ellipsoidal height in metres.')
    if (!Number.isFinite(originLat) || originLat < -90 || originLat > 90) issues.push('Enter a valid local-origin latitude from -90° to 90°.')
    if (!Number.isFinite(originLon) || originLon < -180 || originLon > 180) issues.push('Enter a valid local-origin longitude from -180° to 180°.')
    if (!Number.isFinite(originHeight)) issues.push('Enter the local-origin ellipsoidal height in metres.')
    const selectedObservations = mode === 'baseline' ? observations.slice(0, 1) : observations
    if (selectedObservations.length < (mode === 'baseline' ? 1 : 2)) {
      issues.push(mode === 'baseline' ? 'Add one rover coordinate for the baseline.' : 'Add at least two rover coordinates for a network adjustment.')
    }
    selectedObservations.forEach((observation, index) => {
      const label = observation.name.trim() || `Rover point ${index + 1}`
      const lat = numeric(observation.lat)
      const lon = numeric(observation.lon)
      const height = numeric(observation.h)
      const sigma = numeric(observation.sigma)
      if (!observation.name.trim()) issues.push(`${label}: enter a point name.`)
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) issues.push(`${label}: enter latitude from -90° to 90°.`)
      if (!Number.isFinite(lon) || lon < -180 || lon > 180) issues.push(`${label}: enter longitude from -180° to 180°.`)
      if (!Number.isFinite(height)) issues.push(`${label}: enter ellipsoidal height in metres.`)
      if (!Number.isFinite(sigma) || sigma <= 0) issues.push(`${label}: enter a positive coordinate uncertainty in metres.`)
    })
    if (issues.length > 0) {
      setError(issues.join(' '))
      return
    }

    try {
      const baseECEF = geodeticToECEF(
        baseLat,
        baseLon,
        baseHeight,
      );
      baseECEF.name = baseStation.name;

      if (mode === 'baseline') {
        const obs = selectedObservations[0];
        const obsECEF = geodeticToECEF(
          numeric(obs.lat),
          numeric(obs.lon),
          numeric(obs.h),
        );
        obsECEF.name = obs.name;
        const baseline = computeBaseline(
          { pointName: baseStation.name, ...baseECEF },
          { pointName: obs.name, x: obsECEF.x, y: obsECEF.y, z: obsECEF.z, sigmaX: numeric(obs.sigma) }
        );
        const enu = ecefToENU(obsECEF.x, obsECEF.y, obsECEF.z, originLat, originLon, originHeight);
        setResult({ baseline, enu, baseECEF, obsECEF });
      } else {
        const obsData = selectedObservations.map((o) => ({
          pointName: o.name,
          x: 0, y: 0, z: 0,
          sigmaX: numeric(o.sigma)
        })).map((o, i) => {
          const ecef = geodeticToECEF(
            numeric(selectedObservations[i].lat),
            numeric(selectedObservations[i].lon),
            numeric(selectedObservations[i].h),
          );
          return { ...o, x: ecef.x, y: ecef.y, z: ecef.z };
        });
        const network = processGNSSNetwork(
          baseECEF,
          obsData,
          originLat,
          originLon,
          originHeight,
        );
        setResult(network);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'GNSS coordinate calculation failed.')
    }
  };

  const updateBaseStation = (field: keyof typeof baseStation, value: string) => {
    setBaseStation(current => ({ ...current, [field]: value }))
    setResult(null)
    setError('')
  }

  const updateOrigin = (field: keyof typeof origin, value: string) => {
    setOrigin(current => ({ ...current, [field]: value }))
    setResult(null)
    setError('')
  }

  const visibleObservations = mode === 'baseline' ? observations.slice(0, 1) : observations

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader title={t('tools.gnss')} subtitle={t('tools.gnssDesc')} reference="WGS 84 geographic coordinates and ellipsoidal heights; no projected-grid transformation is applied here." />

      <div className="mb-6 flex flex-wrap gap-3" role="group" aria-label="GNSS tool mode">
        <button type="button" aria-pressed={mode === 'baseline'} onClick={() => { setMode('baseline'); setResult(null); setError(''); }} className={`btn transition-colors ${mode === 'baseline' ? 'btn-primary' : 'btn-secondary'}`}>
          Coordinate baseline
        </button>
        <button type="button" aria-pressed={mode === 'network'} onClick={() => { setMode('network'); setResult(null); setError(''); }} className={`btn transition-colors ${mode === 'network' ? 'btn-primary' : 'btn-secondary'}`}>
          Network Adjustment
        </button>
        <button type="button" aria-pressed={mode === 'rinex'} onClick={() => { setMode('rinex'); setResult(null); setError(''); }} className={`btn transition-colors ${mode === 'rinex' ? 'btn-primary' : 'btn-secondary'}`}>
          RINEX baseline processing
        </button>
      </div>

      {mode === 'rinex' ? <GNSSProcessingPanel /> : <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <h3 className="mb-1 font-semibold">Base station coordinates</h3>
            <p className="mb-4 text-xs leading-5 text-[var(--text-secondary)]">Enter known WGS 84 latitude, longitude, and ellipsoidal height. This coordinate calculator does not derive a GNSS position from raw observations.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1" htmlFor="name">Name</label>
                <input id="name" type="text" value={baseStation.name} onChange={e => updateBaseStation('name', e.target.value)} className="input w-full" autoComplete="off" />
              </div>
              <div>
                <label className="block text-sm mb-1" htmlFor="ellipsoidal-height-m">Ellipsoidal Height (m)</label>
                <input id="ellipsoidal-height-m" type="number" step="0.001" value={baseStation.h} onChange={e => updateBaseStation('h', e.target.value)} className="input w-full" />
              </div>
              <div>
                <label className="block text-sm mb-1" htmlFor="latitude-decimal">Latitude (decimal °)</label>
                <input id="latitude-decimal" type="number" min="-90" max="90" step="any" value={baseStation.lat} onChange={e => updateBaseStation('lat', e.target.value)} className="input w-full" />
              </div>
              <div>
                <label className="block text-sm mb-1" htmlFor="longitude-decimal">Longitude (decimal °)</label>
                <input id="longitude-decimal" type="number" min="-180" max="180" step="any" value={baseStation.lon} onChange={e => updateBaseStation('lon', e.target.value)} className="input w-full" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <h3 className="mb-1 font-semibold">Local origin for ENU</h3>
            <p className="mb-4 text-xs leading-5 text-[var(--text-secondary)]">All three coordinates, including ellipsoidal height, are required; the tool does not assume a zero-height origin.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm" htmlFor="origin-latitude">Latitude (decimal °)</label>
                <input id="origin-latitude" type="number" min="-90" max="90" step="any" value={origin.lat} onChange={e => updateOrigin('lat', e.target.value)} className="input w-full" />
              </div>
              <div>
                <label className="mb-1 block text-sm" htmlFor="origin-longitude">Longitude (decimal °)</label>
                <input id="origin-longitude" type="number" min="-180" max="180" step="any" value={origin.lon} onChange={e => updateOrigin('lon', e.target.value)} className="input w-full" />
              </div>
              <div>
                <label className="mb-1 block text-sm" htmlFor="origin-height">Ellipsoidal height (m)</label>
                <input id="origin-height" type="number" step="0.001" value={origin.h} onChange={e => updateOrigin('h', e.target.value)} className="input w-full" />
              </div>
            </div>
          </div>

          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-semibold">Rover coordinates</h3>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">One rover is used for a coordinate baseline; add at least two for network adjustment.</p>
              </div>
              <button onClick={addObservation} className="btn btn-secondary text-sm">{t('toolUI.addPoint')}</button>
            </div>
            <div className="space-y-3">
              {visibleObservations.map((obs) => (
                <div key={obs.id} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-3 xl:grid-cols-6">
                  <div className="col-span-1">
                    <label className="mb-1 block text-xs" htmlFor={`rover-${obs.id}-name`}>Name</label>
                    <input id={`rover-${obs.id}-name`} type="text" value={obs.name} onChange={e => updateObservation(obs.id, 'name', e.target.value)} className="input w-full text-sm" autoComplete="off" />
                  </div>
                  <div className="col-span-1">
                    <label className="mb-1 block text-xs" htmlFor={`rover-${obs.id}-latitude`}>Latitude (°)</label>
                    <input id={`rover-${obs.id}-latitude`} type="number" min="-90" max="90" step="any" value={obs.lat} onChange={e => updateObservation(obs.id, 'lat', e.target.value)} className="input w-full text-sm" />
                  </div>
                  <div className="col-span-1">
                    <label className="mb-1 block text-xs" htmlFor={`rover-${obs.id}-longitude`}>Longitude (°)</label>
                    <input id={`rover-${obs.id}-longitude`} type="number" min="-180" max="180" step="any" value={obs.lon} onChange={e => updateObservation(obs.id, 'lon', e.target.value)} className="input w-full text-sm" />
                  </div>
                  <div className="col-span-1">
                    <label className="mb-1 block text-xs" htmlFor={`rover-${obs.id}-height`}>Ellipsoidal height (m)</label>
                    <input id={`rover-${obs.id}-height`} type="number" step="0.001" value={obs.h} onChange={e => updateObservation(obs.id, 'h', e.target.value)} className="input w-full text-sm" />
                  </div>
                  <div className="col-span-1">
                    <label className="mb-1 block text-xs" htmlFor={`rover-${obs.id}-sigma`}>Coordinate σ (m)</label>
                    <input id={`rover-${obs.id}-sigma`} type="number" min="0.000001" step="any" value={obs.sigma} onChange={e => updateObservation(obs.id, 'sigma', e.target.value)} className="input w-full text-sm" />
                  </div>
                  <button type="button" aria-label={`Remove ${obs.name || 'rover point'}`} onClick={() => removeObservation(obs.id)} className="mb-1 min-h-9 rounded border border-[var(--border)] px-2 text-sm text-red-500 hover:bg-red-950/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">Remove</button>
                </div>
              ))}
              {visibleObservations.length === 0 && <p className="rounded-md border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-secondary)]">No rover coordinates entered yet. Add a point to begin.</p>}
            </div>
          </div>

          {error && <p role="alert" className="rounded-lg border border-red-700 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}

          <button type="button" onClick={calculate} className="btn btn-primary min-h-11 w-full">
            Calculate {mode === 'baseline' ? 'Baseline' : 'Network'}
          </button>
        </div>

        <div>
          {result && (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
              <h3 className="font-semibold mb-4">Results</h3>
              
              {mode === 'baseline' && result.baseline && result.enu && result.obsECEF && (
                <div className="space-y-4">
                  <div className="bg-[var(--bg)] p-3 rounded">
                    <h4 className="text-sm font-medium mb-2">Baseline Vector</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-[var(--text-secondary)]">From:</span> {result.baseline.from}</div>
                      <div><span className="text-[var(--text-secondary)]">To:</span> {result.baseline.to}</div>
                      <div><span className="text-[var(--text-secondary)]">ΔX:</span> {result.baseline.deltaX.toFixed(4)} m</div>
                      <div><span className="text-[var(--text-secondary)]">ΔY:</span> {result.baseline.deltaY.toFixed(4)} m</div>
                      <div><span className="text-[var(--text-secondary)]">ΔZ:</span> {result.baseline.deltaZ.toFixed(4)} m</div>
                      <div><span className="text-[var(--text-secondary)]">Distance 3D:</span> {result.baseline.distance3D.toFixed(4)} m</div>
                      <div><span className="text-[var(--text-secondary)]">Distance 2D:</span> {result.baseline.distance2D.toFixed(4)} m</div>
                      <div><span className="text-[var(--text-secondary)]">Azimuth:</span> {result.baseline.azimuth.toFixed(4)}°</div>
                      <div><span className="text-[var(--text-secondary)]">Elev. Angle:</span> {result.baseline.elevationAngle.toFixed(4)}°</div>
                      <div><span className="text-[var(--text-secondary)]">Sigma:</span> ±{result.baseline.sigma.toFixed(4)} m</div>
                    </div>
                  </div>
                  <div className="bg-[var(--bg)] p-3 rounded">
                    <h4 className="text-sm font-medium mb-2">Local ENU Coordinates</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-[var(--text-secondary)]">Easting:</span> {result.enu.easting.toFixed(4)} m</div>
                      <div><span className="text-[var(--text-secondary)]">Northing:</span> {result.enu.northing.toFixed(4)} m</div>
                      <div><span className="text-[var(--text-secondary)]">Up:</span> {result.enu.up.toFixed(4)} m</div>
                    </div>
                  </div>
                  <div className="bg-[var(--bg)] p-3 rounded">
                    <h4 className="text-sm font-medium mb-2">ECEF Coordinates</h4>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div><span className="text-[var(--text-secondary)]">X:</span> {result.obsECEF.x.toFixed(4)} m</div>
                      <div><span className="text-[var(--text-secondary)]">Y:</span> {result.obsECEF.y.toFixed(4)} m</div>
                      <div><span className="text-[var(--text-secondary)]">Z:</span> {result.obsECEF.z.toFixed(4)} m</div>
                    </div>
                  </div>
                </div>
              )}

              {mode === 'network' && result.points && result.adjustmentStats && (
                <div className="space-y-4">
                  <div className="bg-[var(--bg)] p-3 rounded">
                    <h4 className="text-sm font-medium mb-2">Adjusted Points</h4>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[var(--text-secondary)]">
                          <th className="pb-2">Name</th>
                          <th className="pb-2">Easting</th>
                          <th className="pb-2">Northing</th>
                          <th className="pb-2">Elev</th>
                          <th className="pb-2">σ (m)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.points.map((p, i: number) => (
                          <tr key={`item-${i}`} className="border-t border-[var(--border)]">
                            <td className="py-2">{p.name}</td>
                            <td>{p.easting.toFixed(4)}</td>
                            <td>{p.northing.toFixed(4)}</td>
                            <td>{p.elevation.toFixed(4)}</td>
                            <td>±{p.sigmaEasting.toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-[var(--bg)] p-3 rounded">
                    <h4 className="text-sm font-medium mb-2">Adjustment Statistics</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-[var(--text-secondary)]">RMS:</span> {result.adjustmentStats.rms.toFixed(4)} m</div>
                      <div><span className="text-[var(--text-secondary)]">Max Residual:</span> {result.adjustmentStats.maxResidual.toFixed(4)} m</div>
                      <div><span className="text-[var(--text-secondary)]">DoF:</span> {result.adjustmentStats.degreesOfFreedom}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>}
    </div>
  );
}
