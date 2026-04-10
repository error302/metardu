'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  computeStockpileVolume,
  computeGridVolume,
  parseDEMCSV,
  stockpileResultToCSV,
  type DEMPoint,
  type StockpileResult,
  type DEMVolumeResult,
} from '@/lib/engine/miningVolume'
import { usePrint, PrintButton, PrintHeader } from '@/hooks/usePrint'

type Tab = 'stockpile' | 'dem'

// Sample data for demonstration
const SAMPLE_STOCKPILE_CSV = `easting,northing,elevation
100.0,200.0,102.5
105.0,200.0,103.8
110.0,200.0,104.2
115.0,200.0,103.5
120.0,200.0,102.0
100.0,205.0,103.2
105.0,205.0,105.1
110.0,205.0,105.8
115.0,205.0,104.9
120.0,205.0,102.8
100.0,210.0,103.0
105.0,210.0,104.6
110.0,210.0,105.3
115.0,210.0,104.2
120.0,210.0,102.2
100.0,215.0,102.1
105.0,215.0,103.0
110.0,215.0,103.5
115.0,215.0,102.8
120.0,215.0,101.5`

const SAMPLE_DEM_CSV = `easting,northing,elevation
100.0,100.0,105.2
105.0,100.0,104.8
110.0,100.0,106.1
115.0,100.0,105.5
120.0,100.0,104.0
100.0,105.0,103.9
105.0,105.0,104.5
110.0,105.0,105.8
115.0,105.0,104.2
120.0,105.0,103.5
100.0,110.0,103.2
105.0,110.0,104.0
110.0,110.0,104.9
115.0,110.0,103.8
120.0,110.0,102.8
100.0,115.0,102.5
105.0,115.0,103.2
110.0,115.0,104.0
115.0,115.0,103.5
120.0,115.0,102.0
100.0,120.0,102.0
105.0,120.0,102.8
110.0,120.0,103.5
115.0,120.0,103.0
120.0,120.0,101.5`

export function StockpileReport() {
  const [activeTab, setActiveTab] = useState<Tab>('stockpile')
  const [csvInput, setCsvInput] = useState('')
  const [baseElevation, setBaseElevation] = useState(101.0)
  const [bulkDensity, setBulkDensity] = useState(1.6)
  const [gridSize, setGridSize] = useState(5)
  const [designLevel, setDesignLevel] = useState(103.0)
  const [error, setError] = useState<string | null>(null)
  const { print, isPrinting, paperSize, setPaperSize, orientation, setOrientation } = usePrint({
    title: 'Mining Volume & Stockpile Report',
    subtitle: 'DEM-based cut/fill volume computation and stockpile tonnage reporting',
  })

  // Stockpile computation
  const stockpileResult = useMemo((): StockpileResult | null => {
    if (activeTab !== 'stockpile' || !csvInput.trim()) return null
    setError(null)
    try {
      const points = parseDEMCSV(csvInput)
      if (points.length < 3) {
        setError('At least 3 points required for stockpile computation.')
        return null
      }
      return computeStockpileVolume(points, baseElevation, bulkDensity)
    } catch (e: any) {
      setError(e.message)
      return null
    }
  }, [csvInput, baseElevation, bulkDensity, activeTab])

  // DEM grid volume computation
  const gridResult = useMemo((): DEMVolumeResult | null => {
    if (activeTab !== 'dem' || !csvInput.trim()) return null
    setError(null)
    try {
      const points = parseDEMCSV(csvInput)
      if (points.length < 3) {
        setError('At least 3 points required for DEM volume computation.')
        return null
      }
      return computeGridVolume(points, designLevel, gridSize)
    } catch (e: any) {
      setError(e.message)
      return null
    }
  }, [csvInput, designLevel, gridSize, activeTab])

  const parsedPointCount = useMemo(() => {
    if (!csvInput.trim()) return 0
    return parseDEMCSV(csvInput).length
  }, [csvInput])

  const loadSample = useCallback(() => {
    setCsvInput(activeTab === 'stockpile' ? SAMPLE_STOCKPILE_CSV : SAMPLE_DEM_CSV)
    if (activeTab === 'stockpile') {
      setBaseElevation(101.0)
    } else {
      setDesignLevel(103.0)
    }
    setError(null)
  }, [activeTab])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCsvInput(ev.target?.result as string)
      setError(null)
    }
    reader.readAsText(file)
  }, [])

  const exportCSV = useCallback(() => {
    let csv: string
    if (activeTab === 'stockpile' && stockpileResult) {
      csv = stockpileResultToCSV(stockpileResult, bulkDensity)
    } else if (activeTab === 'dem' && gridResult) {
      csv = [
        'Parameter,Value,Unit',
        `Total Volume,${gridResult.totalVolumeM3.toFixed(3)},m³`,
        `Cut Volume,${gridResult.cutVolumeM3.toFixed(3)},m³`,
        `Fill Volume,${gridResult.fillVolumeM3.toFixed(3)},m³`,
        `Net Volume,${gridResult.netVolumeM3.toFixed(3)},m³`,
        `Area,${gridResult.areaM2.toFixed(3)},m²`,
        `Average Elevation,${gridResult.averageElevation.toFixed(3)},m`,
        `Design Level,${designLevel.toFixed(3)},m`,
        `Method,${gridResult.method},`,
      ].join('\n')
    } else {
      return
    }

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = activeTab === 'stockpile' ? 'stockpile_report.csv' : 'dem_volume_report.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [activeTab, stockpileResult, gridResult, bulkDensity, designLevel])

  return (
    <div className="space-y-6">
      {/* Print header (only visible during print) */}
      <PrintHeader
        title={activeTab === 'stockpile' ? 'Stockpile Volume Report' : 'DEM Cut/Fill Volume Report'}
        subtitle="METARDU — Mining Volume Module"
      />

      {/* Header */}
      <div className="flex items-start justify-between no-print print-hide">
        <div>
          <h2 className="text-xl font-bold text-[#1B3A5C]">Mining Volume &amp; Stockpile Report</h2>
          <p className="text-sm text-gray-500 mt-1">
            DEM-based cut/fill volume computation and stockpile tonnage reporting.
            <br />
            <span className="text-xs text-gray-400">
              Ref: Basak Ch.8 — End Area &amp; Prismoidal methods · RDM 1.1 §8 — Earthwork accuracy
            </span>
          </p>
        </div>
        {(stockpileResult || gridResult) && (
          <PrintButton
            print={print}
            isPrinting={isPrinting}
            paperSize={paperSize}
            setPaperSize={setPaperSize}
            orientation={orientation}
            setOrientation={setOrientation}
            printTitle={activeTab === 'stockpile' ? 'Stockpile Volume Report' : 'DEM Cut/Fill Volume Report'}
            printSubtitle="METARDU — Mining Volume Module"
          />
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['stockpile', 'dem'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setError(null) }}
            className={`px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === tab
                ? 'border-[#1B3A5C] text-[#1B3A5C]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'stockpile' ? 'Stockpile Volume' : 'DEM Cut/Fill'}
          </button>
        ))}
      </div>

      {/* Parameters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeTab === 'stockpile' ? (
          <>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Base Elevation (RL)
              </label>
              <input
                type="number"
                step="0.1"
                value={baseElevation}
                onChange={e => setBaseElevation(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#1B3A5C]/30 focus:border-[#1B3A5C] outline-none"
              />
              <span className="text-[10px] text-gray-400">Ground surface level beneath the pile</span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Bulk Density (t/m³)
              </label>
              <input
                type="number"
                step="0.1"
                value={bulkDensity}
                onChange={e => setBulkDensity(parseFloat(e.target.value) || 1.6)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#1B3A5C]/30 focus:border-[#1B3A5C] outline-none"
              />
              <span className="text-[10px] text-gray-400">Default 1.6 for loose alluvial material</span>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Design Level (RL)
              </label>
              <input
                type="number"
                step="0.1"
                value={designLevel}
                onChange={e => setDesignLevel(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#1B3A5C]/30 focus:border-[#1B3A5C] outline-none"
              />
              <span className="text-[10px] text-gray-400">Formation / target level</span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Grid Size (m)
              </label>
              <input
                type="number"
                step="1"
                min="1"
                value={gridSize}
                onChange={e => setGridSize(parseFloat(e.target.value) || 5)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#1B3A5C]/30 focus:border-[#1B3A5C] outline-none"
              />
              <span className="text-[10px] text-gray-400">RDM 1.1: ≤ 1/5 terrain feature size</span>
            </div>
          </>
        )}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            DEM Points
          </label>
          <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
            {parsedPointCount} points loaded
          </div>
        </div>
      </div>

      {/* CSV Input */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-700">DEM Point Data</h3>
          <button
            onClick={loadSample}
            className="text-xs text-[#1B3A5C] hover:underline font-medium"
          >
            Load Sample Data
          </button>
          <label className="text-xs text-[#1B3A5C] hover:underline font-medium cursor-pointer">
            Upload CSV
            <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
        <textarea
          value={csvInput}
          onChange={e => { setCsvInput(e.target.value); setError(null) }}
          placeholder={`Paste CSV: easting,northing,elevation\n100.0,200.0,102.5\n105.0,200.0,103.8\n...`}
          rows={8}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-[#1B3A5C]/30 focus:border-[#1B3A5C] outline-none resize-y"
        />
        <p className="text-[10px] text-gray-400">
          Format: easting,northing,elevation — header row optional, comments with # supported
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Stockpile Results */}
      {activeTab === 'stockpile' && stockpileResult && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-[#1B3A5C] px-4 py-3">
              <h3 className="text-white font-semibold text-sm">Stockpile Volume Report</h3>
              <p className="text-[#1B3A5C]/60 text-[10px] mt-0.5">
                TIN-based triangular prism method · Basak Ch.8
              </p>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Volume', value: `${stockpileResult.volumeM3.toFixed(2)} m³`, color: 'text-[#1B3A5C]' },
                  { label: 'Tonnage', value: `${stockpileResult.tonnage.toFixed(2)} t`, color: 'text-[#1B3A5C]' },
                  { label: 'Max Height', value: `${stockpileResult.maxHeight.toFixed(2)} m`, color: 'text-gray-700' },
                  { label: 'Triangles', value: `${stockpileResult.triangleCount}`, color: 'text-gray-500' },
                  { label: 'Surface Area', value: `${stockpileResult.surfaceAreaM2.toFixed(2)} m²`, color: 'text-gray-700' },
                  { label: 'Base Area', value: `${stockpileResult.baseAreaM2.toFixed(2)} m²`, color: 'text-gray-700' },
                  { label: 'Centroid E', value: `${stockpileResult.centroidEasting.toFixed(2)}`, color: 'text-gray-500' },
                  { label: 'Centroid N', value: `${stockpileResult.centroidNorthing.toFixed(2)}`, color: 'text-gray-500' },
                ].map(item => (
                  <div key={item.label} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{item.label}</p>
                    <p className={`text-sm font-bold mt-1 font-['Calibri',sans-serif] ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Computation Details Table */}
              <div className="mt-4 overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Parameter</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Value</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Volume', stockpileResult.volumeM3.toFixed(3), 'm³'],
                      ['Tonnage', stockpileResult.tonnage.toFixed(3), 't'],
                      ['Bulk Density', bulkDensity.toFixed(2), 't/m³'],
                      ['Base Elevation', baseElevation.toFixed(3), 'm RL'],
                      ['Max Height', stockpileResult.maxHeight.toFixed(3), 'm'],
                      ['Surface Area (3D)', stockpileResult.surfaceAreaM2.toFixed(3), 'm²'],
                      ['Base Area (2D)', stockpileResult.baseAreaM2.toFixed(3), 'm²'],
                      ['Triangle Count', stockpileResult.triangleCount.toString(), ''],
                      ['Centroid Easting', stockpileResult.centroidEasting.toFixed(3), 'm'],
                      ['Centroid Northing', stockpileResult.centroidNorthing.toFixed(3), 'm'],
                    ].map(([param, val, unit], i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-3 py-1.5 text-gray-600">{param}</td>
                        <td className="px-3 py-1.5 text-right font-mono font-semibold">{val}</td>
                        <td className="px-3 py-1.5 text-gray-400">{unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 text-[10px] text-gray-400 border-t border-gray-100 pt-2">
                Method: Triangular Prism (TIN) — V = Σ(Ai/3)(h1+h2+h3) · Ref: Basak Surveying Ch.8
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DEM Grid Volume Results */}
      {activeTab === 'dem' && gridResult && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-[#1B3A5C] px-4 py-3">
              <h3 className="text-white font-semibold text-sm">DEM Cut/Fill Volume Report</h3>
              <p className="text-[#1B3A5C]/60 text-[10px] mt-0.5">
                Grid IDW method · Ghilani §15-9 · RDM 1.1 §8
              </p>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Cut Volume', value: `${gridResult.cutVolumeM3.toFixed(2)} m³`, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: 'Fill Volume', value: `${gridResult.fillVolumeM3.toFixed(2)} m³`, color: 'text-amber-600', bg: 'bg-amber-50' },
                  { label: 'Net Volume', value: `${gridResult.netVolumeM3.toFixed(2)} m³`, color: gridResult.netVolumeM3 >= 0 ? 'text-emerald-700' : 'text-amber-700', bg: gridResult.netVolumeM3 >= 0 ? 'bg-emerald-50' : 'bg-amber-50' },
                  { label: 'Total Volume', value: `${gridResult.totalVolumeM3.toFixed(2)} m³`, color: 'text-[#1B3A5C]', bg: 'bg-gray-50' },
                  { label: 'Area', value: `${gridResult.areaM2.toFixed(1)} m²`, color: 'text-gray-700', bg: 'bg-gray-50' },
                  { label: 'Avg Elevation', value: `${gridResult.averageElevation.toFixed(2)} m`, color: 'text-gray-700', bg: 'bg-gray-50' },
                ].map(item => (
                  <div key={item.label} className={`${item.bg} rounded-lg p-3`}>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{item.label}</p>
                    <p className={`text-sm font-bold mt-1 font-['Calibri',sans-serif] ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Parameter</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Value</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Cut Volume', gridResult.cutVolumeM3.toFixed(3), 'm³'],
                      ['Fill Volume', gridResult.fillVolumeM3.toFixed(3), 'm³'],
                      ['Net Volume (Cut − Fill)', gridResult.netVolumeM3.toFixed(3), 'm³'],
                      ['Total Volume', gridResult.totalVolumeM3.toFixed(3), 'm³'],
                      ['Computation Area', gridResult.areaM2.toFixed(3), 'm²'],
                      ['Average Ground RL', gridResult.averageElevation.toFixed(3), 'm'],
                      ['Design Level', designLevel.toFixed(3), 'm RL'],
                      ['Grid Size', gridSize.toFixed(1), 'm'],
                      ['Method', gridResult.method, ''],
                    ].map(([param, val, unit], i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-3 py-1.5 text-gray-600">{param}</td>
                        <td className="px-3 py-1.5 text-right font-mono font-semibold">{val}</td>
                        <td className="px-3 py-1.5 text-gray-400">{unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 text-[10px] text-gray-400 border-t border-gray-100 pt-2">
                Method: Grid IDW — V = Σ(designLevel − zCell) × cellArea · Ref: Ghilani &amp; Wolf §15-9
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export */}
      {(stockpileResult || gridResult) && (
        <div className="flex gap-3 no-print print-hide">
          <button
            onClick={exportCSV}
            className="px-5 py-2.5 bg-[#1B3A5C] text-white rounded-lg text-sm font-semibold hover:bg-[#1B3A5C]/90 transition-colors"
          >
            Export Report CSV
          </button>
          <button
            onClick={() => print({
              paperSize,
              orientation,
              title: activeTab === 'stockpile' ? 'Stockpile Volume Report' : 'DEM Cut/Fill Volume Report',
              subtitle: 'METARDU — Mining Volume Module',
            })}
            className="px-5 py-2.5 border border-[#1B3A5C] text-[#1B3A5C] rounded-lg text-sm font-semibold hover:bg-[#1B3A5C]/5 transition-colors"
          >
            Print Report
          </button>
        </div>
      )}
    </div>
  )
}
