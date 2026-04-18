'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/api-client/client'
import { reduceSoundings } from '@/lib/hydro/tidalReduction'
import type { RawSounding, TideObservation, ReducedSounding, RosData, HydroSurveyRecord } from '@/lib/hydro/types'
import { buildBathymetricSurface } from '@/lib/hydro/bathymetricSurface'
import { generateBathymetricFairSheet } from '@/lib/hydro/bathymetricDXF'
import { buildReportOfSurveyContent } from '@/lib/hydro/reportOfSurvey'
import { getActiveSurveyorProfile } from '@/lib/submission/surveyorProfileClient'
import dynamic from 'next/dynamic'
import { generateContours } from '@/lib/topo/contourGenerator'
import type { ContourLine } from '@/lib/topo/contourGenerator'
import type { SpotHeight } from '@/components/drawing/TopoCanvas'

const TopoCanvas = dynamic(() => import('@/components/drawing/TopoCanvas').then(m => ({ default: m.TopoCanvas })), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 rounded h-64" />,
})

interface Props {
  projectId: string
  projectData: Record<string, any>
}

type Tab = 'soundings' | 'tides' | 'reduce' | 'chart' | 'report'

interface ReducedResult {
  reducedSoundings: ReducedSounding[]
  meanWaterLevel: number
  maxWaterLevel: number
  minWaterLevel: number
  warnings: string[]
}

interface BathymetricGridOutput {
  idwGrid: {
    grid: number[][]
    cols: number
    rows: number
    minX: number
    minY: number
    cellSize: number
  }
  minDepth: number
  maxDepth: number
  meanDepth: number
}

export function HydroPanel({ projectId, projectData }: Props) {
  const dbClient = createClient()
  const [activeTab, setActiveTab] = useState<Tab>('soundings')
  const [loading, setLoading] = useState(true)

  const [soundings, setSoundings] = useState<RawSounding[]>([])
  const [csvError, setCsvError] = useState<string | null>(null)

  const [tideObs, setTideObs] = useState<TideObservation[]>([])
  const [tideRef, setTideRef] = useState('KMD-MSA')
  const [datum, setDatum] = useState('MSL')

  const [rosData, setRosData] = useState<RosData>({
    vesselName: '',
    sounderModel: '',
    startDate: '',
    endDate: '',
    weatherSummary: '',
    interruptions: '',
    equipmentNotes: '',
  })

  const [reduced, setReduced] = useState<ReducedResult | null>(null)
  const [bathyGrid, setBathyGrid] = useState<BathymetricGridOutput | null>(null)
  const [contours, setContours] = useState<ContourLine[]>([])
  const [spotHeights, setSpotHeights] = useState<SpotHeight[]>([])
  const [contourInt, setContourInt] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const TABS: { id: Tab; label: string }[] = [
    { id: 'soundings', label: 'Soundings' },
    { id: 'tides', label: 'Tide Data' },
    { id: 'reduce', label: 'Reduce' },
    { id: 'chart', label: 'Chart' },
    { id: 'report', label: 'Report of Survey' },
  ]

  useEffect(() => {
    async function loadSurvey() {
      setLoading(true)
      try {
        const { data, error } = await dbClient
          .from('hydro_surveys')
          .select('*')
          .eq('project_id', projectId)
          .single()

        if (error && error.code !== 'PGRST116') {
          console.error('Failed to load survey:', error)
          setLoading(false)
          return
        }

        if (data) {
          const survey = data as HydroSurveyRecord
          if (survey.soundings?.length) setSoundings(survey.soundings)
          if (survey.tide_observations?.length) setTideObs(survey.tide_observations)
          if (survey.tide_gauge_ref) setTideRef(survey.tide_gauge_ref)
          if (survey.survey_datum) setDatum(survey.survey_datum)
          
          if (survey.reduced_soundings?.length) {
            const reducedResult: ReducedResult = {
              reducedSoundings: survey.reduced_soundings,
              meanWaterLevel: 0,
              maxWaterLevel: 0,
              minWaterLevel: 0,
              warnings: [],
            }
            if (survey.reduced_soundings.length > 0) {
              const depths = survey.reduced_soundings.map((s: ReducedSounding) => s.reducedDepthM)
              reducedResult.meanWaterLevel = depths.reduce((a: number, b: number) => a + b, 0) / depths.length
              reducedResult.maxWaterLevel = Math.max(...depths)
              reducedResult.minWaterLevel = Math.min(...depths)
            }
            setReduced(reducedResult)
            setSpotHeights(survey.reduced_soundings.map((s: ReducedSounding) => ({
              e: s.x, n: s.y, z: s.reducedDepthM, label: s.reducedDepthM.toFixed(2)
            })))
          }

          if (survey.bathymetric_grid) {
            const grid: BathymetricGridOutput = {
              idwGrid: survey.bathymetric_grid,
              minDepth: 0,
              maxDepth: 0,
              meanDepth: 0,
            }
            setBathyGrid(grid)
            setContours(generateContours({
              grid: grid.idwGrid.grid,
              gridMinE: grid.idwGrid.minX,
              gridMinN: grid.idwGrid.minY,
              gridResolution: grid.idwGrid.cellSize,
              cols: grid.idwGrid.cols,
              rows: grid.idwGrid.rows,
            }, { interval: contourInt, indexInterval: 5 }))
          }

          setRosData({
            vesselName: survey.vessel_name ?? '',
            sounderModel: survey.sounder_model ?? '',
            startDate: survey.ros_start_date ?? '',
            endDate: survey.ros_end_date ?? '',
            weatherSummary: survey.ros_weather_summary ?? '',
            interruptions: survey.ros_interruptions ?? '',
            equipmentNotes: survey.ros_equipment_notes ?? '',
          })
        }
      } catch (err) {
        console.error('Error loading survey:', err)
      } finally {
        setLoading(false)
      }
    }

    if (projectId) {
      loadSurvey()
    }
  }, [projectId, dbClient, contourInt])

  function parseCSV(text: string, expectedCols: number): Record<string, string>[] {
    const lines = text.trim().split(/\r?\n/)
    if (lines.length < 2) return []

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    const results: Record<string, string>[] = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      let values: string[]
      if (line.includes('"')) {
        const matches = line.match(/(".*?"|[^,]+)(?:\s*,\s*|$)/g)
        values = matches?.map(m => m.replace(/^,?\s*|"[\s,]*"$/g, '').trim()) ?? []
      } else {
        values = line.split(',').map(v => v.trim())
      }

      if (values.length >= expectedCols) {
        const row: Record<string, string> = {}
        headers.forEach((h, idx) => {
          row[h] = values[idx] ?? ''
        })
        results.push(row)
      }
    }

    return results
  }

  function validateSoundings(data: RawSounding[]): string[] {
    const errors: string[] = []
    const seen = new Set<string>()

    for (let i = 0; i < data.length; i++) {
      const s = data[i]
      
      if (s.depthM <= 0 || s.depthM > 12000) {
        errors.push(`Row ${i + 1}: Invalid depth ${s.depthM}m (must be 0-12000)`)
      }

      if (s.x < 180000 || s.x > 750000 || s.y < 0 || s.y > 10000000) {
        errors.push(`Row ${i + 1}: Coordinates outside Kenya UTM Zone 37S range`)
      }

      const key = `${s.x},${s.y},${s.timestamp}`
      if (seen.has(key)) {
        errors.push(`Row ${i + 1}: Duplicate sounding at same location/time`)
      }
      seen.add(key)

      const ts = new Date(s.timestamp)
      if (isNaN(ts.getTime())) {
        errors.push(`Row ${i + 1}: Invalid timestamp format`)
      }
    }

    return errors
  }

  function validateTideObservations(data: TideObservation[]): string[] {
    const errors: string[] = []

    for (let i = 0; i < data.length; i++) {
      const t = data[i]

      if (t.waterLevelM < -10 || t.waterLevelM > 15) {
        errors.push(`Row ${i + 1}: Water level ${t.waterLevelM}m outside plausible range (-10 to 15)`)
      }

      const ts = new Date(t.timestamp)
      if (isNaN(ts.getTime())) {
        errors.push(`Row ${i + 1}: Invalid timestamp format`)
      }
    }

    return errors
  }

  const parseSoundingsCSV = (text: string): RawSounding[] => {
    const data = parseCSV(text, 4)
    return data.map((row, i) => ({
      x: parseFloat(row.x ?? row.easting ?? ''),
      y: parseFloat(row.y ?? row.northing ?? ''),
      depthM: parseFloat(row.depth_m ?? row.depth ?? row.z ?? ''),
      timestamp: row.timestamp ?? row.time ?? '',
    }))
  }

  const parseTideCSV = (text: string): TideObservation[] => {
    const data = parseCSV(text, 2)
    return data.map(row => ({
      timestamp: row.timestamp ?? row.time ?? '',
      waterLevelM: parseFloat(row.water_level_m ?? row.water_level ?? row.wl ?? ''),
    }))
  }

  const handleSoundingsImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCsvError(null)
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed = parseSoundingsCSV(ev.target?.result as string)
        const validationErrors = validateSoundings(parsed)

        if (validationErrors.length > 0) {
          setCsvError(validationErrors.slice(0, 5).join('\n'))
        } else {
          setSoundings(parsed)
        }
      } catch (err: any) {
        setCsvError(err.message)
      }
    }
    reader.readAsText(file)
  }

  const handleTideImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCsvError(null)
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed = parseTideCSV(ev.target?.result as string)
        const validationErrors = validateTideObservations(parsed)

        if (validationErrors.length > 0) {
          setCsvError(validationErrors.slice(0, 5).join('\n'))
        } else {
          setTideObs(parsed)
        }
      } catch (err: any) {
        setCsvError(err.message)
      }
    }
    reader.readAsText(file)
  }

  const handleReduce = () => {
    setError(null)
    try {
      if (soundings.length < 3) {
        setError('Minimum 3 soundings required for reduction.')
        return
      }

      const result = reduceSoundings(soundings, tideObs)
      setReduced(result)
      setSpotHeights(result.reducedSoundings.map((s: ReducedSounding) => ({
        e: s.x, n: s.y, z: s.reducedDepthM, label: s.reducedDepthM.toFixed(2)
      })))
      saveToDatabase(result, null)
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleBuildSurface = () => {
    setError(null)
    if (!reduced) {
      setError('Run tidal reduction first.')
      return
    }

    try {
      const grid = buildBathymetricSurface(reduced.reducedSoundings, 100)
      setBathyGrid(grid)
      const lines = generateContours({
        grid: grid.idwGrid.grid,
        gridMinE: grid.idwGrid.minX,
        gridMinN: grid.idwGrid.minY,
        gridResolution: grid.idwGrid.cellSize,
        cols: grid.idwGrid.cols,
        rows: grid.idwGrid.rows,
      }, {
        interval: contourInt,
        indexInterval: 5,
      })
      setContours(lines)
      saveToDatabase(reduced, grid)
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleExportDXF = async () => {
    if (!bathyGrid || !reduced) return

    try {
      const profile = await getActiveSurveyorProfile()
      const dxf = generateBathymetricFairSheet({
        bathyGrid,
        soundings: reduced.reducedSoundings,
        contourInterval: contourInt,
        hydroType: projectData?.survey_type ?? 'inland',
        projectData,
        surveyorProfile: profile,
      })

      const blob = new Blob([dxf], { type: 'application/dxf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fair-sheet-${projectId}.dxf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleExportRoS = async () => {
    try {
      const profile = await getActiveSurveyorProfile()
      const content = buildReportOfSurveyContent({
        projectName: projectData?.name ?? 'Unnamed Survey',
        hydroType: projectData?.survey_type ?? 'inland',
        startDate: rosData.startDate,
        endDate: rosData.endDate,
        surveyArea: projectData?.locality ?? '',
        county: projectData?.county ?? '',
        datum,
        tideGaugeRef: tideRef,
        vesselName: rosData.vesselName,
        sounderModel: rosData.sounderModel,
        soundingCount: soundings.length,
        meanDepthM: reduced?.reducedSoundings?.length
          ? reduced.reducedSoundings.reduce((a, s) => a + s.reducedDepthM, 0) / reduced.reducedSoundings.length
          : 0,
        maxDepthM: reduced?.reducedSoundings?.length
          ? Math.max(...reduced.reducedSoundings.map(s => s.reducedDepthM))
          : 0,
        minDepthM: reduced?.reducedSoundings?.length
          ? Math.min(...reduced.reducedSoundings.map(s => s.reducedDepthM))
          : 0,
        weatherSummary: rosData.weatherSummary,
        interruptions: rosData.interruptions,
        equipmentNotes: rosData.equipmentNotes,
        surveyorName: profile.fullName,
        registrationNo: profile.registrationNumber,
        firmName: profile.firmName,
        reportDate: new Date().toLocaleDateString('en-KE'),
      })

      const text = content.sections
        .map(s => `${s.title}\n${'─'.repeat(s.title.length)}\n${s.content}`)
        .join('\n\n')

      const blob = new Blob([text], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report-of-survey-${projectId}.txt`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setError(err.message)
    }
  }

  const saveToDatabase = async (reducedResult: ReducedResult | null, gridResult: BathymetricGridOutput | null) => {
    setSaving(true)
    try {
      await dbClient
        .from('hydro_surveys')
        .upsert({
          project_id: projectId,
          hydro_type: projectData?.survey_type ?? 'inland',
          vessel_name: rosData.vesselName || null,
          sounder_model: rosData.sounderModel || null,
          survey_datum: datum,
          tide_gauge_ref: tideRef,
          soundings: soundings,
          tide_observations: tideObs,
          reduced_soundings: reducedResult?.reducedSoundings ?? null,
          bathymetric_grid: gridResult?.idwGrid ?? null,
          ros_start_date: rosData.startDate || null,
          ros_end_date: rosData.endDate || null,
          ros_weather_summary: rosData.weatherSummary || null,
          ros_equipment_notes: rosData.equipmentNotes || null,
          ros_interruptions: rosData.interruptions || null,
          status: gridResult ? 'charted' : reducedResult ? 'reduced' : 'pending',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'project_id' })
    } catch (err) {
      console.error('Save error:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading survey data...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Hydrographic Survey</h2>
        <p className="text-sm text-muted-foreground">
          Sounding reduction, bathymetric charting, and Report of Survey.
          IHO S-44 (6th edition). Kenya MSL datum.
        </p>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
              ${activeTab === tab.id
                ? 'border-orange-500 text-orange-500'
                : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700 text-red-400 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      {activeTab === 'soundings' && (
        <div className="space-y-4">
          <h3 className="font-medium">Raw Soundings Import</h3>
          <p className="text-xs text-muted-foreground">
            CSV format: <code>x,y,depth_m,timestamp</code> — header row required.
            Coordinates in Arc 1960 / UTM Zone 37S. Timestamp: ISO 8601.
          </p>
          {csvError && <p className="text-sm text-red-500 whitespace-pre-wrap">{csvError}</p>}
          <div className="border-2 border-dashed border-secondary rounded-lg p-6">
            <p className="text-sm font-medium mb-2">
              Soundings CSV ({soundings.length} points loaded)
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={handleSoundingsImport}
              className="text-sm"
            />
          </div>
          {soundings.length > 0 && (
            <div className="overflow-x-auto max-h-48">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="bg-secondary">
                    <th className="px-2 py-1 border text-left">X (E)</th>
                    <th className="px-2 py-1 border text-left">Y (N)</th>
                    <th className="px-2 py-1 border text-left">Depth (m)</th>
                    <th className="px-2 py-1 border text-left">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {soundings.slice(0, 20).map((s, i) => (
                    <tr key={i} className="hover:bg-secondary/50">
                      <td className="px-2 py-0.5 border">{s.x.toFixed(3)}</td>
                      <td className="px-2 py-0.5 border">{s.y.toFixed(3)}</td>
                      <td className="px-2 py-0.5 border">{s.depthM.toFixed(3)}</td>
                      <td className="px-2 py-0.5 border">{s.timestamp}</td>
                    </tr>
                  ))}
                  {soundings.length > 20 && (
                    <tr>
                      <td colSpan={4} className="px-2 py-1 text-muted-foreground text-center">
                        ...and {soundings.length - 20} more
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'tides' && (
        <div className="space-y-4">
          <h3 className="font-medium">Tide Observations</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Tide Gauge Station
              </label>
              <select
                value={tideRef}
                onChange={e => setTideRef(e.target.value)}
                className="w-full bg-secondary border rounded px-3 py-2 text-sm"
              >
                <option value="KMD-MSA">Mombasa (KMD-MSA)</option>
                <option value="KMD-MLD">Malindi (KMD-MLD)</option>
                <option value="KMD-LMU">Lamu (KMD-LMU)</option>
                <option value="KMD-KSM">Kisumu — Lake Victoria (KMD-KSM)</option>
                <option value="KMD-HOM">Homa Bay (KMD-HOM)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Reduction Datum
              </label>
              <select
                value={datum}
                onChange={e => setDatum(e.target.value)}
                className="w-full bg-secondary border rounded px-3 py-2 text-sm"
              >
                <option value="MSL">Mean Sea Level (MSL)</option>
                <option value="LAT">Lowest Astronomical Tide (LAT)</option>
                <option value="CD">Chart Datum (CD)</option>
                <option value="LLW">Lower Low Water (LLW)</option>
              </select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            CSV format: <code>timestamp,water_level_m</code> — header row required.
            Timestamp: ISO 8601. Water level in metres above datum.
          </p>

          <div className="border-2 border-dashed border-secondary rounded-lg p-6">
            <p className="text-sm font-medium mb-2">
              Tide CSV ({tideObs.length} observations loaded)
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={handleTideImport}
              className="text-sm"
            />
          </div>

          <div className="bg-secondary/30 rounded p-3 text-xs text-muted-foreground">
            <p className="font-medium mb-1">No tide gauge data available?</p>
            <p>Leave the tide CSV empty and run reduction — zero tidal correction
              will be applied. Note this in the Report of Survey weather section.</p>
          </div>
        </div>
      )}

      {activeTab === 'reduce' && (
        <div className="space-y-4">
          <h3 className="font-medium">Tidal Reduction</h3>
          <p className="text-sm text-muted-foreground">
            Reduces raw echo sounder depths to {datum} datum using linear
            interpolation of tide observations.
          </p>
          <button
            onClick={handleReduce}
            disabled={soundings.length < 3}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-5 py-2 rounded font-medium text-sm"
          >
            Run Tidal Reduction ({soundings.length} soundings)
          </button>

          {reduced && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Mean Water Level', value: `${reduced.meanWaterLevel.toFixed(3)} m` },
                  { label: 'Max Water Level', value: `${reduced.maxWaterLevel.toFixed(3)} m` },
                  { label: 'Min Water Level', value: `${reduced.minWaterLevel.toFixed(3)} m` },
                  { label: 'Soundings Reduced', value: reduced.reducedSoundings.length },
                  { label: 'Datum', value: datum },
                  { label: 'Gauge', value: tideRef },
                ].map(item => (
                  <div key={item.label} className="bg-secondary rounded p-3">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="font-mono font-medium mt-1">{item.value}</p>
                  </div>
                ))}
              </div>

              {reduced.warnings.length > 0 && (
                <div className="bg-amber-900/20 border border-amber-700 rounded p-3 text-sm text-amber-400">
                  {reduced.warnings.map((w, i) => (
                    <p key={i}>⚠️ {w}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'chart' && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Depth Contour Interval (m)
              </label>
              <select
                value={contourInt}
                onChange={e => setContourInt(Number(e.target.value))}
                className="bg-secondary border rounded px-3 py-1.5 text-sm"
              >
                {[0.5, 1, 2, 5, 10].map(v => (
                  <option key={v} value={v}>{v}m</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleBuildSurface}
              disabled={!reduced || reduced.reducedSoundings.length < 3}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-1.5 rounded text-sm font-medium mt-4"
            >
              Generate Bathymetric Chart
            </button>
            {bathyGrid && (
              <button
                onClick={handleExportDXF}
                className="border rounded px-4 py-1.5 text-sm hover:bg-secondary mt-4"
              >
                Export Fair Sheet DXF
              </button>
            )}
          </div>

          {contours.length > 0 && (
            <TopoCanvas
              spotHeights={spotHeights}
              contours={contours}
              width={880}
              height={580}
              showLabels
              showSpotHeights
            />
          )}

          {!reduced && (
            <p className="text-sm text-muted-foreground">
              Complete tidal reduction first to generate the bathymetric chart.
            </p>
          )}
        </div>
      )}

      {activeTab === 'report' && (
        <div className="space-y-4">
          <h3 className="font-medium">Report of Survey (RoS)</h3>
          <p className="text-sm text-muted-foreground">
            Required submission document per IHO S-44 Section 1.4.
          </p>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: 'vesselName', label: 'Vessel Name', type: 'text' },
              { key: 'sounderModel', label: 'Sounder Model', type: 'text' },
              { key: 'startDate', label: 'Survey Start Date', type: 'date' },
              { key: 'endDate', label: 'Survey End Date', type: 'date' },
            ].map(field => (
              <div key={field.key}>
                <label className="text-xs text-muted-foreground block mb-1">
                  {field.label}
                </label>
                <input
                  type={field.type}
                  className="w-full bg-secondary border rounded px-3 py-2 text-sm"
                  value={rosData[field.key as keyof RosData]}
                  onChange={e => setRosData((p: RosData) => ({
                    ...p,
                    [field.key]: e.target.value
                  }))}
                />
              </div>
            ))}
          </div>
          {[
            { key: 'weatherSummary', label: 'Weather and Sea Conditions' },
            { key: 'interruptions', label: 'Interruptions and Extraneous Activities' },
            { key: 'equipmentNotes', label: 'Equipment and Calibration Notes' },
          ].map(field => (
            <div key={field.key}>
              <label className="text-xs text-muted-foreground block mb-1">
                {field.label}
              </label>
              <textarea
                rows={3}
                className="w-full bg-secondary border rounded px-3 py-2 text-sm"
                value={rosData[field.key as keyof RosData]}
                onChange={e => setRosData((p: RosData) => ({
                  ...p,
                  [field.key]: e.target.value
                }))}
              />
            </div>
          ))}
          <button
            onClick={handleExportRoS}
            className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded font-medium text-sm"
          >
            Export Report of Survey
          </button>
          <p className="text-xs text-muted-foreground">
            Exports as structured text. PDF rendering available in Sprint 14.
          </p>
        </div>
      )}

      {saving && <p className="text-xs text-muted-foreground">Saving…</p>}
    </div>
  )
}
