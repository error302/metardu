'use client'

import { useState } from 'react'
import { printGNSSObservationLog, type GNSSLogInput, type GNSSObservationEntry, type GNSSBaselineEntry } from '@/lib/print/gnssObservationLog'
import { PrintMetaPanel, defaultPrintMeta, type PrintMeta } from '@/components/shared/PrintMetaPanel'

const FIX_TYPES: GNSSObservationEntry['fixType'][] = ['RTK_FIX', 'FIX', 'RTK_FLOAT', 'FLOAT', 'DGNSS', 'AUTONOMOUS']
const ANT_METHODS: GNSSObservationEntry['antennaMeasurement'][] = ['VERTICAL', 'SLANT', 'ARP']
const BASE_SOURCES: GNSSLogInput['baseStationSource'][] = ['CORS', 'OWN_BASE', 'VRS', 'THIRD_PARTY']
const SOLUTIONS: GNSSBaselineEntry['solution'][] = ['FIX', 'FLOAT', 'DGNSS']

function nowIso() { return new Date().toISOString() }
function nowPlus(mins: number) { return new Date(Date.now() + mins * 60000).toISOString() }

function emptyObs(id: number): GNSSObservationEntry {
  return {
    pointId: `PT${String(id).padStart(3, '0')}`,
    startTime: nowIso(),
    endTime: nowPlus(15),
    durationMin: 15,
    satellites: 8,
    pdop: 1.8,
    hdop: 1.2,
    vdop: 1.5,
    fixType: 'RTK_FIX',
    antennaHeight: 1.800,
    antennaMeasurement: 'VERTICAL',
  }
}

function emptyBaseline(idx: number): GNSSBaselineEntry {
  return {
    from: 'BASE',
    to: `PT${String(idx + 1).padStart(3, '0')}`,
    deltaE: 0,
    deltaN: 0,
    deltaU: 0,
    distance: 0,
    azimuth: 0,
    solution: 'FIX',
    ratio: 4.5,
    rms: 0.005,
  }
}

export default function GNSSLogBuilder() {
  const [printMeta, setPrintMeta]       = useState<PrintMeta>(defaultPrintMeta)
  const [observations, setObs]          = useState<GNSSObservationEntry[]>([emptyObs(1)])
  const [baselines, setBsl]             = useState<GNSSBaselineEntry[]>([])
  const [showBaselines, setShowBsl]     = useState(false)
  const [printMetaOpen, setPrintMetaOpen] = useState(false)

  // Equipment state
  const [receiverModel, setReceiverModel]   = useState('')
  const [receiverSerial, setReceiverSerial] = useState('')
  const [antennaModel, setAntennaModel]     = useState('')
  const [antennaSerial, setAntennaSerial]   = useState('')
  const [baseStationId, setBaseStationId]   = useState('KenCORS')
  const [baseStationSource, setBaseSrc]     = useState<GNSSLogInput['baseStationSource']>('CORS')
  const [datum, setDatum]                   = useState('Arc 1960')
  const [projection, setProjection]         = useState('UTM Zone 37S')
  const [geoidModel, setGeoidModel]         = useState('EGM2008')
  const [elevationMask, setElevMask]        = useState('15')
  const [epochInterval, setEpoch]           = useState('1')
  const [processingSoftware, setProcessing] = useState('')

  // ── Observation helpers ───────────────────────────────────────────────────

  function updateObs(i: number, field: keyof GNSSObservationEntry, value: unknown) {
    setObs(prev => prev.map((o, idx) => idx === i ? { ...o, [field]: value } : o))
  }

  function addObs() {
    setObs(prev => [...prev, emptyObs(prev.length + 1)])
  }

  function removeObs(i: number) {
    setObs(prev => prev.filter((_, idx) => idx !== i))
  }

  // Auto-calculate duration when times change
  function handleTimeChange(i: number, field: 'startTime' | 'endTime', value: string) {
    setObs(prev => {
      const updated = prev.map((o, idx) => idx === i ? { ...o, [field]: value } : o)
      const obs = updated[i]
      try {
        const start = new Date(obs.startTime).getTime()
        const end   = new Date(obs.endTime).getTime()
        if (!isNaN(start) && !isNaN(end) && end > start) {
          updated[i] = { ...updated[i], durationMin: Math.round((end - start) / 60000) }
        }
      } catch {}
      return updated
    })
  }

  // ── Baseline helpers ──────────────────────────────────────────────────────

  function updateBsl(i: number, field: keyof GNSSBaselineEntry, value: unknown) {
    setBsl(prev => prev.map((b, idx) => idx === i ? { ...b, [field]: value } : b))
  }

  function addBsl() {
    setBsl(prev => [...prev, emptyBaseline(prev.length)])
  }

  function removeBsl(i: number) {
    setBsl(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── Print ─────────────────────────────────────────────────────────────────

  function handlePrint() {
    const inp: GNSSLogInput = {
      observations,
      baselines,
      receiverModel: receiverModel || '—',
      receiverSerial,
      antennaModel: antennaModel || '—',
      antennaSerial,
      baseStationId: baseStationId || 'KenCORS',
      baseStationSource,
      datum,
      projection,
      geoidModel,
      elevationMask: parseFloat(elevationMask) || 15,
      epochInterval: parseFloat(epochInterval) || 1,
      processingSoftware: processingSoftware || undefined,
      meta: { ...printMeta, title: 'GNSS Observation Log' },
    }
    printGNSSObservationLog(inp)
  }

  const fixCount = observations.filter(o => o.fixType === 'FIX' || o.fixType === 'RTK_FIX').length

  return (
    <div className="space-y-6 text-sm">

      {/* ── EQUIPMENT ──────────────────────────────────────────────────────── */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold text-[var(--text-primary)]">Equipment & Session Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Receiver Model</label>
            <input value={receiverModel} onChange={e => setReceiverModel(e.target.value)}
              className="input w-full" placeholder="Trimble R12i" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Receiver S/N</label>
            <input value={receiverSerial} onChange={e => setReceiverSerial(e.target.value)}
              className="input w-full" placeholder="5012345678" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Antenna Model</label>
            <input value={antennaModel} onChange={e => setAntennaModel(e.target.value)}
              className="input w-full" placeholder="Zephyr 3" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Antenna S/N</label>
            <input value={antennaSerial} onChange={e => setAntennaSerial(e.target.value)}
              className="input w-full" placeholder="00123456" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Base Station ID</label>
            <input value={baseStationId} onChange={e => setBaseStationId(e.target.value)}
              className="input w-full" placeholder="KenCORS_NBI" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Base Source</label>
            <select value={baseStationSource} onChange={e => setBaseSrc(e.target.value as GNSSLogInput['baseStationSource'])}
              className="input w-full">
              {BASE_SOURCES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Datum</label>
            <input value={datum} onChange={e => setDatum(e.target.value)}
              className="input w-full" placeholder="Arc 1960" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Projection</label>
            <input value={projection} onChange={e => setProjection(e.target.value)}
              className="input w-full" placeholder="UTM Zone 37S" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Geoid Model</label>
            <input value={geoidModel} onChange={e => setGeoidModel(e.target.value)}
              className="input w-full" placeholder="EGM2008" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Elevation Mask (°)</label>
            <input value={elevationMask} onChange={e => setElevMask(e.target.value)}
              type="number" className="input w-full" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Epoch Interval (s)</label>
            <input value={epochInterval} onChange={e => setEpoch(e.target.value)}
              type="number" className="input w-full" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Processing Software</label>
            <input value={processingSoftware} onChange={e => setProcessing(e.target.value)}
              className="input w-full" placeholder="Trimble Business Center" />
          </div>
        </div>
      </div>

      {/* ── OBSERVATIONS ───────────────────────────────────────────────────── */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[var(--text-primary)]">
            Occupation Schedule
            <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
              {observations.length} pts · {fixCount} fixed
            </span>
          </h3>
          <button onClick={addObs}
            className="px-3 py-1.5 bg-[var(--accent)] text-black text-xs rounded font-medium">
            + Add Point
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-[var(--bg-tertiary)]">
                {['Point ID', 'Start Time', 'End Time', 'Min', 'Sats', 'PDOP', 'HDOP', 'Fix Type', 'Ant H (m)', 'Meas', 'E (m)', 'N (m)', 'Ell Ht', 'RMS H', 'Notes', ''].map(h => (
                  <th key={h} className="px-2 py-2 text-left border border-[var(--border-color)] text-[var(--text-muted)] font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {observations.map((obs, i) => (
                <tr key={i} className={i % 2 === 0 ? '' : 'bg-[var(--bg-tertiary)]/20'}>
                  <td className="px-1 py-1 border border-[var(--border-color)]/40">
                    <input value={obs.pointId} onChange={e => updateObs(i, 'pointId', e.target.value)}
                      className="w-20 px-1 py-1 bg-transparent text-[var(--text-primary)] font-bold" />
                  </td>
                  <td className="px-1 py-1 border border-[var(--border-color)]/40">
                    <input type="datetime-local" value={obs.startTime.slice(0, 16)}
                      onChange={e => handleTimeChange(i, 'startTime', e.target.value + ':00Z')}
                      className="w-36 px-1 py-1 bg-transparent text-[var(--text-primary)]" />
                  </td>
                  <td className="px-1 py-1 border border-[var(--border-color)]/40">
                    <input type="datetime-local" value={obs.endTime.slice(0, 16)}
                      onChange={e => handleTimeChange(i, 'endTime', e.target.value + ':00Z')}
                      className="w-36 px-1 py-1 bg-transparent text-[var(--text-primary)]" />
                  </td>
                  <td className="px-1 py-1 border border-[var(--border-color)]/40">
                    <span className="px-1 text-[var(--accent)] font-bold">{obs.durationMin}</span>
                  </td>
                  <td className="px-1 py-1 border border-[var(--border-color)]/40">
                    <input type="number" value={obs.satellites} onChange={e => updateObs(i, 'satellites', parseInt(e.target.value) || 0)}
                      className="w-10 px-1 py-1 bg-transparent text-[var(--text-primary)]" />
                  </td>
                  <td className="px-1 py-1 border border-[var(--border-color)]/40">
                    <input type="number" step="0.1" value={obs.pdop} onChange={e => updateObs(i, 'pdop', parseFloat(e.target.value) || 0)}
                      className="w-12 px-1 py-1 bg-transparent text-[var(--text-primary)]" />
                  </td>
                  <td className="px-1 py-1 border border-[var(--border-color)]/40">
                    <input type="number" step="0.1" value={obs.hdop} onChange={e => updateObs(i, 'hdop', parseFloat(e.target.value) || 0)}
                      className="w-12 px-1 py-1 bg-transparent text-[var(--text-primary)]" />
                  </td>
                  <td className="px-1 py-1 border border-[var(--border-color)]/40">
                    <select value={obs.fixType} onChange={e => updateObs(i, 'fixType', e.target.value)}
                      className={`bg-transparent text-xs ${obs.fixType === 'RTK_FIX' || obs.fixType === 'FIX' ? 'text-green-400' : obs.fixType === 'FLOAT' || obs.fixType === 'RTK_FLOAT' ? 'text-yellow-400' : 'text-red-400'}`}>
                      {FIX_TYPES.map(f => <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1 border border-[var(--border-color)]/40">
                    <input type="number" step="0.001" value={obs.antennaHeight} onChange={e => updateObs(i, 'antennaHeight', parseFloat(e.target.value) || 0)}
                      className="w-16 px-1 py-1 bg-transparent text-[var(--text-primary)]" />
                  </td>
                  <td className="px-1 py-1 border border-[var(--border-color)]/40">
                    <select value={obs.antennaMeasurement} onChange={e => updateObs(i, 'antennaMeasurement', e.target.value)}
                      className="bg-transparent text-[var(--text-secondary)] text-xs">
                      {ANT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1 border border-[var(--border-color)]/40">
                    <input type="number" step="0.001" value={obs.easting ?? ''} placeholder="—"
                      onChange={e => updateObs(i, 'easting', e.target.value ? parseFloat(e.target.value) : undefined)}
                      className="w-24 px-1 py-1 bg-transparent text-[var(--text-secondary)]" />
                  </td>
                  <td className="px-1 py-1 border border-[var(--border-color)]/40">
                    <input type="number" step="0.001" value={obs.northing ?? ''} placeholder="—"
                      onChange={e => updateObs(i, 'northing', e.target.value ? parseFloat(e.target.value) : undefined)}
                      className="w-24 px-1 py-1 bg-transparent text-[var(--text-secondary)]" />
                  </td>
                  <td className="px-1 py-1 border border-[var(--border-color)]/40">
                    <input type="number" step="0.001" value={obs.ellHeight ?? ''} placeholder="—"
                      onChange={e => updateObs(i, 'ellHeight', e.target.value ? parseFloat(e.target.value) : undefined)}
                      className="w-20 px-1 py-1 bg-transparent text-[var(--text-secondary)]" />
                  </td>
                  <td className="px-1 py-1 border border-[var(--border-color)]/40">
                    <input type="number" step="0.001" value={obs.rmsH ?? ''} placeholder="—"
                      onChange={e => updateObs(i, 'rmsH', e.target.value ? parseFloat(e.target.value) : undefined)}
                      className="w-14 px-1 py-1 bg-transparent text-[var(--text-secondary)]" />
                  </td>
                  <td className="px-1 py-1 border border-[var(--border-color)]/40">
                    <input value={obs.notes ?? ''} onChange={e => updateObs(i, 'notes', e.target.value || undefined)}
                      placeholder="field note"
                      className="w-28 px-1 py-1 bg-transparent text-[var(--text-muted)]" />
                  </td>
                  <td className="px-1 py-1 border border-[var(--border-color)]/40">
                    <button onClick={() => removeObs(i)} className="text-red-400 hover:text-red-300 text-lg leading-none px-1">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── BASELINES (collapsible) ─────────────────────────────────────────── */}
      <div className="card">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-left"
          onClick={() => setShowBsl(v => !v)}
        >
          <span className="font-semibold text-sm">
            Baseline Vectors
            <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
              {baselines.length > 0 ? `${baselines.length} baseline${baselines.length !== 1 ? 's' : ''}` : 'optional'}
            </span>
          </span>
          <span className="text-[var(--text-muted)] text-xs">{showBaselines ? '▲ collapse' : '▼ expand'}</span>
        </button>
        {showBaselines && (
          <div className="border-t border-[var(--border-color)] p-4 space-y-3">
            <div className="flex justify-end">
              <button onClick={addBsl}
                className="px-3 py-1.5 bg-[var(--accent)] text-black text-xs rounded font-medium">
                + Add Baseline
              </button>
            </div>
            {baselines.length === 0 && (
              <p className="text-xs text-[var(--text-muted)] text-center py-4">
                No baselines — add if you have post-processed baselines to include in the log.
              </p>
            )}
            {baselines.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-[var(--bg-tertiary)]">
                      {['From', 'To', 'ΔE (m)', 'ΔN (m)', 'ΔU (m)', 'Dist (m)', 'Azimuth (°)', 'Solution', 'Ratio', 'RMS (m)', ''].map(h => (
                        <th key={h} className="px-2 py-2 text-left border border-[var(--border-color)] text-[var(--text-muted)] font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {baselines.map((b, i) => (
                      <tr key={i} className={i % 2 === 0 ? '' : 'bg-[var(--bg-tertiary)]/20'}>
                        <td className="px-1 py-1 border border-[var(--border-color)]/40"><input value={b.from} onChange={e => updateBsl(i, 'from', e.target.value)} className="w-16 px-1 py-1 bg-transparent text-[var(--text-primary)] font-bold" /></td>
                        <td className="px-1 py-1 border border-[var(--border-color)]/40"><input value={b.to} onChange={e => updateBsl(i, 'to', e.target.value)} className="w-16 px-1 py-1 bg-transparent text-[var(--text-primary)] font-bold" /></td>
                        <td className="px-1 py-1 border border-[var(--border-color)]/40"><input type="number" step="0.001" value={b.deltaE} onChange={e => updateBsl(i, 'deltaE', parseFloat(e.target.value) || 0)} className="w-20 px-1 py-1 bg-transparent text-[var(--text-primary)]" /></td>
                        <td className="px-1 py-1 border border-[var(--border-color)]/40"><input type="number" step="0.001" value={b.deltaN} onChange={e => updateBsl(i, 'deltaN', parseFloat(e.target.value) || 0)} className="w-20 px-1 py-1 bg-transparent text-[var(--text-primary)]" /></td>
                        <td className="px-1 py-1 border border-[var(--border-color)]/40"><input type="number" step="0.001" value={b.deltaU} onChange={e => updateBsl(i, 'deltaU', parseFloat(e.target.value) || 0)} className="w-20 px-1 py-1 bg-transparent text-[var(--text-primary)]" /></td>
                        <td className="px-1 py-1 border border-[var(--border-color)]/40"><input type="number" step="0.001" value={b.distance} onChange={e => updateBsl(i, 'distance', parseFloat(e.target.value) || 0)} className="w-20 px-1 py-1 bg-transparent text-[var(--text-primary)]" /></td>
                        <td className="px-1 py-1 border border-[var(--border-color)]/40"><input type="number" step="0.001" value={b.azimuth} onChange={e => updateBsl(i, 'azimuth', parseFloat(e.target.value) || 0)} className="w-20 px-1 py-1 bg-transparent text-[var(--text-secondary)]" /></td>
                        <td className="px-1 py-1 border border-[var(--border-color)]/40">
                          <select value={b.solution} onChange={e => updateBsl(i, 'solution', e.target.value)}
                            className={`bg-transparent text-xs ${b.solution === 'FIX' ? 'text-green-400' : b.solution === 'FLOAT' ? 'text-yellow-400' : 'text-red-400'}`}>
                            {SOLUTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-1 py-1 border border-[var(--border-color)]/40"><input type="number" step="0.1" value={b.ratio ?? ''} placeholder="—" onChange={e => updateBsl(i, 'ratio', e.target.value ? parseFloat(e.target.value) : undefined)} className="w-12 px-1 py-1 bg-transparent text-[var(--text-secondary)]" /></td>
                        <td className="px-1 py-1 border border-[var(--border-color)]/40"><input type="number" step="0.0001" value={b.rms} onChange={e => updateBsl(i, 'rms', parseFloat(e.target.value) || 0)} className="w-16 px-1 py-1 bg-transparent text-[var(--text-primary)]" /></td>
                        <td className="px-1 py-1 border border-[var(--border-color)]/40"><button onClick={() => removeBsl(i)} className="text-red-400 hover:text-red-300 text-lg leading-none px-1">×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── PRINT HEADER ─────────────────────────────────────────────────────── */}
      <div className="card">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-left"
          onClick={() => setPrintMetaOpen(v => !v)}
        >
          <span className="font-semibold text-sm">Print Header Details</span>
          <span className="text-[var(--text-muted)] text-xs">{printMetaOpen ? '▲ collapse' : '▼ fill in for formal submission'}</span>
        </button>
        {printMetaOpen && (
          <div className="border-t border-[var(--border-color)] p-4">
            <PrintMetaPanel meta={printMeta} onChange={setPrintMeta} />
          </div>
        )}
      </div>

      {/* ── WHAT'S INCLUDED ──────────────────────────────────────────────────── */}
      <div className="p-3 bg-[var(--bg-tertiary)]/50 rounded border border-[var(--border-color)] text-xs space-y-1 text-[var(--text-muted)]">
        <p className="font-semibold text-[var(--text-primary)] mb-1.5">Log will include:</p>
        <p>✓ Equipment details — receiver, antenna, base station, epoch/mask settings</p>
        <p>✓ Table 1: Occupation Schedule — start/end, duration, satellites, PDOP, HDOP, fix type, antenna height</p>
        {observations.some(o => o.easting) && <p>✓ Table 2: Coordinate Results — Easting, Northing, Ellipsoidal/Orthometric heights, RMS H/V</p>}
        {baselines.length > 0 && <p>✓ Table 3: Baseline Vectors — ΔE/ΔN/ΔU, distance, azimuth, solution, ratio, RMS</p>}
        <p>✓ Quality Assessment — fix rate, avg PDOP, avg satellites, baseline RMS, overall quality rating</p>
        <p>✓ Surveyor's Certificate — Survey Regulations 1994, Reg. 21</p>
        <p className="font-mono mt-1">Reference: Survey Act Cap 299 | Survey Regulations 1994 Reg. 21 | ISK GNSS Guidelines 2019 | ISO 17123-8</p>
      </div>

      {/* ── PRINT BUTTON ─────────────────────────────────────────────────────── */}
      <button
        onClick={handlePrint}
        disabled={observations.length === 0}
        className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-dim)] disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded text-sm transition-colors"
      >
        Print GNSS Observation Log — {observations.length} point{observations.length !== 1 ? 's' : ''}
        {baselines.length > 0 ? ` · ${baselines.length} baseline${baselines.length !== 1 ? 's' : ''}` : ''}
      </button>

    </div>
  )
}
