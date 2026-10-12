'use client';

import React, { useState, useMemo, useCallback } from 'react'
import { designPavement, computeLayerQuantities, classifySubgrade } from '@/lib/engineering/pavementDesign'
import type { TrafficData, SubgradeData, PavementDesignResult, PavementLayer } from '@/lib/engineering/pavementDesign'

interface PavementDesignPanelProps {
  roadClass?: string
  carriagewayWidth?: number
  roadLength?: number
  onLayersChange?: (layers: PavementLayer[]) => void
}

interface ValidationErrors {
  aadt?: string
  cbr?: string
  growthRate?: string
  designPeriod?: string
  heavyVehiclePercentage?: string
  directionalSplit?: string
  laneFactor?: string
  numberOfLanes?: string
  vehicleDamageFactor?: string
}

function validate(data: { traffic: TrafficData; subgrade: SubgradeData }): ValidationErrors {
  const errors: ValidationErrors = {}
  const { traffic, subgrade } = data

  if (!Number.isFinite(traffic.aadt) || traffic.aadt <= 0) {
    errors.aadt = 'Enter a finite AADT greater than 0.'
  }
  if (!Number.isFinite(subgrade.cbr) || subgrade.cbr < 2 || subgrade.cbr > 100) {
    errors.cbr = 'Enter a measured/design CBR between 2 and 100.'
  }
  if (!Number.isFinite(traffic.growthRate) || traffic.growthRate < 0) {
    errors.growthRate = 'Enter a finite, non-negative annual growth rate.'
  }
  if (!Number.isFinite(traffic.designPeriod) || traffic.designPeriod < 10 || traffic.designPeriod > 40) {
    errors.designPeriod = 'Enter a design period from 10 to 40 years.'
  }
  if (!Number.isFinite(traffic.heavyVehiclePercentage) || traffic.heavyVehiclePercentage < 0 || traffic.heavyVehiclePercentage > 100) {
    errors.heavyVehiclePercentage = 'Enter a heavy-vehicle percentage from 0 to 100.'
  }
  if (!Number.isFinite(traffic.directionalSplit) || traffic.directionalSplit <= 0 || traffic.directionalSplit > 1) {
    errors.directionalSplit = 'Enter the design-direction share from greater than 0 to 1.'
  }
  if (!Number.isFinite(traffic.laneFactor) || traffic.laneFactor <= 0 || traffic.laneFactor > 1) {
    errors.laneFactor = 'Enter the design-lane factor from greater than 0 to 1.'
  }
  if (!Number.isInteger(traffic.numberOfLanes) || traffic.numberOfLanes <= 0) {
    errors.numberOfLanes = 'Enter a positive whole number of lanes.'
  }
  if (!Number.isFinite(traffic.vehicleDamageFactor) || (traffic.vehicleDamageFactor ?? 0) <= 0) {
    errors.vehicleDamageFactor = 'Enter a finite vehicle damage factor greater than 0.'
  }

  return errors
}

const safeNum = (v: number, fallback: string = '—') =>
  Number.isFinite(v) && !Number.isNaN(v) ? v : fallback

export default function PavementDesignPanel({
  carriagewayWidth: carriagewayWidthProp,
  roadLength: roadLengthProp,
}: PavementDesignPanelProps) {
  const [traffic, setTraffic] = useState<TrafficData>({
    aadt: Number.NaN, heavyVehiclePercentage: Number.NaN, growthRate: Number.NaN, designPeriod: Number.NaN,
    directionalSplit: Number.NaN, laneFactor: Number.NaN, numberOfLanes: Number.NaN, vehicleDamageFactor: Number.NaN,
  })
  const [subgrade, setSubgrade] = useState<SubgradeData>({ cbr: Number.NaN })
  const [roadLength, setRoadLength] = useState(roadLengthProp ?? Number.NaN)
  const [carriagewayWidth, setCarriagewayWidth] = useState(carriagewayWidthProp ?? Number.NaN)
  const [result, setResult] = useState<PavementDesignResult | null>(null)
  const [errors, setErrors] = useState<ValidationErrors>({})

  const quantities = useMemo(() => {
    if (!result || !Number.isFinite(roadLength) || roadLength <= 0 || !Number.isFinite(carriagewayWidth) || carriagewayWidth <= 0) return []
    return computeLayerQuantities(result.layers, roadLength, carriagewayWidth)
  }, [result, roadLength, carriagewayWidth])

  const handleDesign = () => {
    const validationErrors = validate({ traffic, subgrade })
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) {
      setResult(null)
      return
    }

    const r = designPavement(traffic, subgrade)
    setResult(r)
  }

  const updateTraffic = (key: keyof TrafficData, value: string) => {
    const number = value.trim() ? Number(value) : Number.NaN
    setTraffic(current => ({ ...current, [key]: number }))
    setErrors(current => ({ ...current, [key]: undefined }))
    setResult(null)
  }

  const updateDimension = (setter: (value: number) => void, value: string) => {
    setter(value.trim() ? Number(value) : Number.NaN)
    setResult(null)
  }

  const inputValue = (value: number) => Number.isFinite(value) ? value : ''

  const handleExportCSV = useCallback(() => {
    if (!result || quantities.length === 0) return

    const header = 'layer_name,thickness_mm,material,volume_m3,tonnage'
    const rows = quantities.map(q =>
      [
        `"${q.layer}"`,
        q.volumeM3 > 0
          ? result.layers.find(l => l.name === q.layer)?.thicknessMm ?? ''
          : '',
        `"${q.material}"`,
        safeNum(q.volumeM3, ''),
        safeNum(q.tonnage, ''),
      ].join(',')
    )

    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `pavement_layer_report_${Date.now()}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [result, quantities])

  const inputCls =
    'w-full border border-zinc-600 rounded-lg px-3 py-2 text-sm bg-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
  const labelCls = 'block text-xs text-zinc-400 mb-1'
  const errorCls = 'text-xs text-red-400 mt-1'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
        <h3 className="text-lg font-semibold text-white">Preliminary pavement structure screening</h3>
        <p className="mt-1 text-sm text-zinc-400">Enter project traffic and laboratory CBR evidence. Catalog outputs are screening results; verify the current governing manual, traffic method, material specifications and geotechnical design before approval or construction.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Traffic Data */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
          <h4 className="font-medium text-white mb-4">Traffic Data</h4>
          <div className="space-y-3">
            {/* AADT */}
            <div>
              <label className={labelCls} htmlFor="aadt-veh-day">AADT (veh/day)</label>
              <input id="aadt-veh-day" aria-label="Aadt"
                type="number"
                step="any"
                className={`${inputCls}${errors.aadt ? ' border-red-500' : ''}`}
                value={inputValue(traffic.aadt)}
                onChange={e => updateTraffic('aadt', e.target.value)}
              />
              {errors.aadt && <p className={errorCls}>{errors.aadt}</p>}
            </div>

            {/* Heavy Vehicle % */}
            <div>
              <label className={labelCls} htmlFor="heavy-vehicles">Heavy Vehicles (%)</label>
              <input id="heavy-vehicles" aria-label="Heavyvehiclepercentage"
                type="number"
                step="any"
                className={`${inputCls}${errors.heavyVehiclePercentage ? ' border-red-500' : ''}`}
                value={inputValue(traffic.heavyVehiclePercentage)}
                onChange={e => updateTraffic('heavyVehiclePercentage', e.target.value)}
              />
              {errors.heavyVehiclePercentage && <p className={errorCls}>{errors.heavyVehiclePercentage}</p>}
            </div>

            {/* Growth Rate */}
            <div>
              <label className={labelCls} htmlFor="growth-rate-yr">Growth Rate (%/yr)</label>
              <input id="growth-rate-yr" aria-label="Growthrate"
                type="number"
                step="any"
                className={`${inputCls}${errors.growthRate ? ' border-red-500' : ''}`}
                value={inputValue(traffic.growthRate)}
                onChange={e => updateTraffic('growthRate', e.target.value)}
              />
              {errors.growthRate && <p className={errorCls}>{errors.growthRate}</p>}
            </div>

            {/* Design Period */}
            <div>
              <label className={labelCls} htmlFor="design-period-years">Design Period (years)</label>
              <input id="design-period-years" aria-label="Designperiod"
                type="number"
                step="any"
                className={`${inputCls}${errors.designPeriod ? ' border-red-500' : ''}`}
                value={inputValue(traffic.designPeriod)}
                onChange={e => updateTraffic('designPeriod', e.target.value)}
              />
              {errors.designPeriod && <p className={errorCls}>{errors.designPeriod}</p>}
            </div>

            {/* Directional Split */}
            <div>
              <label className={labelCls} htmlFor="directional-split">Directional Split</label>
              <input id="directional-split" aria-label="Directionalsplit"
                type="number"
                step="any"
                className={`${inputCls}${errors.directionalSplit ? ' border-red-500' : ''}`}
                value={inputValue(traffic.directionalSplit)}
                onChange={e => updateTraffic('directionalSplit', e.target.value)}
              />
              {errors.directionalSplit && <p className={errorCls}>{errors.directionalSplit}</p>}
            </div>

            {/* Lane Factor */}
            <div>
              <label className={labelCls} htmlFor="lane-factor">Lane Factor</label>
              <input id="lane-factor" aria-label="Lanefactor"
                type="number"
                step="any"
                className={`${inputCls}${errors.laneFactor ? ' border-red-500' : ''}`}
                value={inputValue(traffic.laneFactor)}
                onChange={e => updateTraffic('laneFactor', e.target.value)}
              />
              {errors.laneFactor && <p className={errorCls}>{errors.laneFactor}</p>}
              <p className="mt-1 text-[11px] text-zinc-500">This user-entered factor is applied to directional traffic in the calculation.</p>
            </div>

            {/* Number of Lanes */}
            <div>
              <label className={labelCls} htmlFor="no-of-lanes">No. of Lanes (reference)</label>
              <input id="no-of-lanes" aria-label="Numberoflanes"
                type="number"
                step="any"
                className={`${inputCls}${errors.numberOfLanes ? ' border-red-500' : ''}`}
                value={inputValue(traffic.numberOfLanes)}
                onChange={e => updateTraffic('numberOfLanes', e.target.value)}
              />
              {errors.numberOfLanes && <p className={errorCls}>{errors.numberOfLanes}</p>}
              <p className="mt-1 text-[11px] text-zinc-500">Recorded for context; it is not separately applied by this calculation.</p>
            </div>

            {/* Vehicle Damage Factor */}
            <div>
              <label className={labelCls} htmlFor="vehicle-damage-factor">Vehicle Damage Factor</label>
              <input id="vehicle-damage-factor" aria-label="Vehicle Damage Factor"
                type="number"
                step="any"
                className={`${inputCls}${errors.vehicleDamageFactor ? ' border-red-500' : ''}`}
                value={inputValue(traffic.vehicleDamageFactor ?? Number.NaN)}
                onChange={e => updateTraffic('vehicleDamageFactor', e.target.value)}
              />
              {errors.vehicleDamageFactor && <p className={errorCls}>{errors.vehicleDamageFactor}</p>}
            </div>
          </div>
        </div>

        {/* Subgrade Data */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
          <h4 className="font-medium text-white mb-4">Subgrade Data</h4>
          <div className="space-y-3">
            {/* CBR */}
            <div>
              <label className={labelCls} htmlFor="subgrade-cbr">Measured/design CBR (%) — {Number.isFinite(subgrade.cbr) && subgrade.cbr >= 2 && subgrade.cbr <= 100 ? classifySubgrade(subgrade.cbr) : 'enter test result'}</label>
              <input aria-label="Cbr"
                id="subgrade-cbr"
                type="number"
                step="any"
                min={2}
                max={100}
                className={`${inputCls}${errors.cbr ? ' border-red-500' : ''}`}
                value={inputValue(subgrade.cbr)}
                onChange={e => {
                  setSubgrade(current => ({ ...current, cbr: e.target.value.trim() ? Number(e.target.value) : Number.NaN }))
                  setErrors(current => ({ ...current, cbr: undefined }))
                  setResult(null)
                }}
              />
              <div className="flex justify-between text-xs text-zinc-500">
                <span>2% minimum</span>
                <span className="font-medium text-zinc-200">{inputValue(subgrade.cbr) || '—'}%</span>
                <span>100% (SG1)</span>
              </div>
              {errors.cbr && <p className={errorCls}>{errors.cbr}</p>}
            </div>

            {/* Soil Type */}
            <div>
              <label className={labelCls} htmlFor="soil-type">Soil Type</label>
              <select id="soil-type"
                className={`${inputCls}${errors.cbr ? ' border-red-500' : ''}`}
                value={subgrade.soilType || ''}
                onChange={e => setSubgrade({ ...subgrade, soilType: e.target.value })}
              >
                <option value="">Select...</option>
                <option value="granular">Granular</option>
                <option value="clay">Clay</option>
                <option value="silt">Silt</option>
                <option value="sand">Sand</option>
                <option value="rock">Rock</option>
              </select>
            </div>

            {/* Road Length — now editable */}
            <div>
              <label className={labelCls} htmlFor="road-length-m">Road Length (m)</label>
              <input  id="road-length-m" aria-label="Road Length (m)"
                type="number"
                className={inputCls}
                value={inputValue(roadLength)}
                onChange={e => updateDimension(setRoadLength, e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="carriageway-width-m">Carriageway width (m)</label>
              <input id="carriageway-width-m" type="number" step="any" min="0" value={inputValue(carriagewayWidth)} onChange={e => updateDimension(setCarriagewayWidth, e.target.value)} className={inputCls} />
            </div>
          </div>

          <button
            onClick={handleDesign}
            className="w-full mt-6 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Design Pavement
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <>
          <p role="note" className="rounded border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200">This catalog lookup is not an approved pavement design. Check the governing project criteria, drainage, climate, materials, construction method and geotechnical report independently.</p>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-950/40 rounded-xl border border-blue-800 p-4">
              <div className="text-xs text-blue-400 uppercase tracking-wider">ESA</div>
              <div className="text-2xl font-bold text-blue-300">
                {safeNum(result.esaMillions, '—') !== '—'
                  ? `${result.esaMillions.toFixed(3)}M`
                  : '—'}
              </div>
            </div>
            <div className="bg-purple-950/40 rounded-xl border border-purple-800 p-4">
              <div className="text-xs text-purple-400 uppercase tracking-wider">Traffic Class</div>
              <div className="text-2xl font-bold text-purple-300">{result.trafficClass}</div>
            </div>
            <div className="bg-amber-950/40 rounded-xl border border-amber-800 p-4">
              <div className="text-xs text-amber-400 uppercase tracking-wider">Subgrade Class</div>
              <div className="text-2xl font-bold text-amber-300">{result.subgradeClass}</div>
            </div>
            <div className="bg-green-950/40 rounded-xl border border-green-800 p-4">
              <div className="text-xs text-green-400 uppercase tracking-wider">Total Thickness</div>
              <div className="text-2xl font-bold text-green-300">
                {safeNum(result.totalThickness, '—') !== '—'
                  ? `${result.totalThickness} mm`
                  : '—'}
              </div>
            </div>
          </div>

          {/* Pavement Structure Diagram */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
            <h4 className="font-medium text-white mb-3">Pavement Structure</h4>
            <PavementStructureDiagram layers={result.layers} />
          </div>

          {/* Layer Table */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-700">
              <h4 className="font-medium text-white">Layer Schedule</h4>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-zinc-800">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">Layer</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">Material</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-zinc-400">Thickness</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">Description</th>
                </tr>
              </thead>
              <tbody>
                {result.layers.map((layer) => (
                  <tr key={layer.name} className="border-t border-zinc-800">
                    <td className="px-4 py-2 font-medium text-white">
                      <span className="inline-block w-3 h-3 rounded-sm mr-2" style={{ backgroundColor: layer.color }} />
                      {layer.name}
                    </td>
                    <td className="px-4 py-2 text-zinc-300">{layer.material}</td>
                    <td className="px-4 py-2 text-right font-mono text-white">{layer.thicknessMm} mm</td>
                    <td className="px-4 py-2 text-zinc-400 text-xs">{layer.description}</td>
                  </tr>
                ))}
                <tr className="bg-zinc-800 font-semibold">
                  <td className="px-4 py-2 text-white" colSpan={2}>Total</td>
                  <td className="px-4 py-2 text-right font-mono text-white">
                    {safeNum(result.totalThickness, '—') !== '—'
                      ? `${result.totalThickness} mm`
                      : '—'}
                  </td>
                  <td className="px-4 py-2"></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Material Quantities */}
          {quantities.length > 0 && (
            <div className="bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-700 flex items-center justify-between">
                <h4 className="font-medium text-white">Estimated quantities using configured material densities (L={roadLength}m × W={carriagewayWidth}m)</h4>
                <button
                  onClick={handleExportCSV}
                  className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg font-medium hover:bg-emerald-700 transition-colors"
                >
                  Download Layer Report
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-zinc-800">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">Layer</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-zinc-400">Volume (m&sup3;)</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-zinc-400">Estimated mass (t)</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-zinc-400">Configured density (kg/m&sup3;)</th>
                  </tr>
                </thead>
                <tbody>
                  {quantities.map((q, i) => (
                    <tr key={`${q}-${i}`} className="border-t border-zinc-800">
                      <td className="px-4 py-2 font-medium text-white">{q.layer}</td>
                      <td className="px-4 py-2 text-right font-mono text-zinc-300">
                        {safeNum(q.volumeM3, '—') !== '—' ? q.volumeM3.toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-zinc-300">
                        {safeNum(q.tonnage, '—') !== '—' ? q.tonnage.toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-2 text-right text-zinc-400">
                        {safeNum(q.density, '—') !== '—' ? q.density : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {quantities.length === 0 && <p role="status" className="rounded border border-zinc-700 p-3 text-sm text-zinc-400">Material quantities are unavailable until actual road length and carriageway width are entered.</p>}
        </>
      )}
    </div>
  )
}

// ─── PAVEMENT STRUCTURE SVG ───────────────────────────────────────────────────

function PavementStructureDiagram({ layers }: { layers: PavementLayer[] }) {
  const width = 400
  const layerHeight = 50
  const subgradeHeight = 60
  const height = layers.length * layerHeight + subgradeHeight + 60
  const padX = 80
  const padY = 30
  const layerWidth = width - padX * 2

  const totalThickness = layers.reduce((s, l) => s + l.thicknessMm, 0)

  let y = padY

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-md mx-auto">
      {layers.map((layer, i) => {
        const currentY = y
        y += layerHeight
        return (
          <g key={layer.name}>
            <rect x={padX} y={currentY} width={layerWidth} height={layerHeight} fill={layer.color} rx={i === 0 ? 6 : 0} />
            {i > 0 && <line x1={padX} y1={currentY} x2={padX + layerWidth} y2={currentY} stroke="rgba(255,255,255,0.3)" strokeWidth={1} />}
            <text x={padX + layerWidth / 2} y={currentY + layerHeight / 2 + 4} textAnchor="middle" fill="white" fontSize="11" fontWeight="500">
              {layer.name}
            </text>
            <text x={padX - 8} y={currentY + layerHeight / 2 + 4} textAnchor="end" fill="#d4d4d8" fontSize="10" fontWeight="500">
              {layer.thicknessMm}
            </text>
          </g>
        )
      })}
      {/* Subgrade */}
      <rect x={padX} y={y} width={layerWidth} height={subgradeHeight} fill="#52525b" rx={0} />
      <text x={padX + layerWidth / 2} y={y + subgradeHeight / 2 + 4} textAnchor="middle" fill="#d4d4d8" fontSize="11">Subgrade</text>
      {/* Total annotation */}
      <text x={padX - 8} y={padY - 10} textAnchor="end" fill="#d4d4d8" fontSize="12" fontWeight="600">
        {Number.isFinite(totalThickness) ? `${totalThickness} mm` : '—'}
      </text>
      <line x1={padX - 25} y1={padY} x2={padX - 25} y2={y} stroke="#d4d4d8" strokeWidth={1.5} />
      <line x1={padX - 30} y1={padY} x2={padX - 20} y2={padY} stroke="#d4d4d8" strokeWidth={1.5} />
      <line x1={padX - 30} y1={y} x2={padX - 20} y2={y} stroke="#d4d4d8" strokeWidth={1.5} />
    </svg>
  )
}
