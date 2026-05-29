'use client';

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/api-client/client'
import type { EngineeringData, EngineeringMode, EngineeringStandard, RoadDesignData, DrainageData, StationData, IntersectionPoint, VerticalIP, CrossSectionTemplate, StepStatus, Manhole, PipeRun } from '@/types/engineering'
import { KRDM2017, KeRRA, getDesignSpeedRange, getCarriagewayWidth, getShoulderWidth } from '@/lib/standards/engineering'
import { HorizontalCurvePanel } from '@/components/engineering/HorizontalCurvePanel'
import SuperelevationPanel from '@/components/engineering/SuperelevationPanel'
import { VolumesPanel } from '@/components/engineering/VolumesPanel'
import { NetworkAdjustmentPanel } from '@/components/compute/NetworkAdjustmentPanel'
import type { SurveyorProfileSubmission } from '@/lib/api-client/community'
import { MANNING_N } from '@/lib/engineering/drainageDesign'
import LongSectionRenderer from '@/components/engineering/LongSectionRenderer'
import CrossSectionRenderer from '@/components/engineering/CrossSectionRenderer'
import CrossSectionSeries from '@/components/engineering/CrossSectionSeries'
import RoadReservePanel from '@/components/engineering/RoadReservePanel'
import AsBuiltSurveyPanel from '@/components/engineering/AsBuiltSurveyPanel'
import PavementDesignPanel from '@/components/engineering/PavementDesignPanel'
import DrainageDesignPanel from '@/components/engineering/DrainageDesignPanel'
import RoadCompletionCertificatePanel from '@/components/engineering/RoadCompletionCertificatePanel'
import PileGridPanel from '@/components/engineering/PileGridPanel'
import SlopeAnalysisPanel from '@/components/engineering/SlopeAnalysisPanel'
import ProgressMonitorPanel from '@/components/engineering/ProgressMonitorPanel'
import MachineControlExportPanel from '@/components/engineering/MachineControlExportPanel'
import MobileDesktopNotice from '@/components/MobileDesktopNotice'

type EngineeringStepId = 'setup' | 'horizontal' | 'vertical' | 'cross_section' | 'stations' | 'outputs' | 'export' | 'manholes' | 'pipes' | 'drainage_outputs' | 'long_section' | 'cross_section_view' | 'road_reserve' | 'pavement_design' | 'drainage_design' | 'as_built' | 'road_completion' | 'pile_grid' | 'slope_analysis' | 'progress_monitor' | 'topo_drawing' | 'machine_control'

interface EngineeringStep {
  id: EngineeringStepId
  label: string
  description: string
  status: StepStatus
  gated?: boolean
}

interface EngineeringProject {
  id: string
  name: string
  survey_type: string
  utm_zone: number
  hemisphere: 'N' | 'S'
  datum?: string
  lr_number?: string
  county?: string
  district?: string
  locality?: string
  engineering_data?: EngineeringData | null
}

const ROAD_CLASSES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const

function getEngineeringSteps(data: EngineeringData | null): EngineeringStep[] {
  const mode = data?.mode || 'road'
  const rd = data?.road
  const dd = data?.drainage

  const steps: EngineeringStep[] = [
    { 
      id: 'setup', 
      label: 'Project Setup', 
      description: mode === 'road' ? 'Road name, design speed, class, standard' : 'Drainage network name, catchment area',
      status: 'complete' 
    },
  ]

  if (mode === 'road') {
    const roadSetupDone = rd?.roadName && rd?.designSpeed && rd?.roadClass && rd?.standard
    steps.push({
      id: 'horizontal',
      label: 'Horizontal Alignment',
      description: 'Intersection points (IPs) and circular curves',
      status: rd?.ips?.length ? 'complete' : (roadSetupDone ? 'in_progress' : 'locked'),
      gated: true
    })

    const horizontalDone = rd?.ips?.length && rd.ips.length >= 2
    steps.push({
      id: 'vertical',
      label: 'Vertical Alignment',
      description: 'Vertical IPs (VIPs) and parabolic curves',
      status: rd?.vips?.length ? 'complete' : (horizontalDone ? 'in_progress' : 'locked'),
      gated: true
    })

    const verticalDone = rd?.vips?.length && rd.vips.length >= 1
    steps.push({
      id: 'cross_section',
      label: 'Cross Section Template',
      description: 'Carriageway, shoulders, cut/fill slopes',
      status: rd?.crossSectionTemplate ? 'complete' : (verticalDone ? 'in_progress' : 'locked'),
      gated: true
    })

    const templateDone = !!rd?.crossSectionTemplate
    steps.push({
      id: 'stations',
      label: 'Stations & Levels',
      description: 'Ground levels at chainage intervals',
      status: rd?.stations?.length ? 'complete' : (templateDone ? 'in_progress' : 'locked'),
      gated: true
    })

    const stationsDone = rd?.stations?.length && rd.stations.length >= 2
    steps.push({
      id: 'outputs',
      label: 'Computed Outputs',
      description: 'Horizontal/vertical curves, earthworks table',
      status: rd?.earthworksTable ? 'complete' : (stationsDone ? 'in_progress' : 'locked'),
      gated: true
    })

    steps.push({
      id: 'export',
      label: 'Export Package',
      description: 'PDF reports, long section, peg book',
      status: 'locked',
      gated: true
    })

    steps.push({
      id: 'long_section',
      label: 'Long Section',
      description: 'Chainage vs elevation profile',
      status: verticalDone ? 'in_progress' : 'locked',
      gated: true
    })

    steps.push({
      id: 'cross_section_view',
      label: 'Cross Sections',
      description: 'Formation template sections',
      status: stationsDone ? 'in_progress' : 'locked',
      gated: true
    })

    steps.push({
      id: 'road_reserve',
      label: 'Road Reserve',
      description: 'Reserve width & land acquisition',
      status: 'in_progress'
    })

    steps.push({
      id: 'pavement_design',
      label: 'Pavement Design',
      description: 'CBR-based layer design per KeNHA manual',
      status: stationsDone ? 'in_progress' : 'locked',
      gated: true
    })

    steps.push({
      id: 'drainage_design',
      label: 'Drainage Design',
      description: 'Manning\'s equation, pipe & channel sizing',
      status: stationsDone ? 'in_progress' : 'locked',
      gated: true
    })

    steps.push({
      id: 'as_built',
      label: 'As-Built Survey',
      description: 'Design vs constructed deviation analysis',
      status: stationsDone ? 'in_progress' : 'locked',
      gated: true
    })

    steps.push({
      id: 'road_completion',
      label: 'Completion Certificate',
      description: 'Kenya Roads Act Cap 407 certification',
      status: 'in_progress'
    })

    steps.push({
      id: 'pile_grid',
      label: 'Pile / Column Grid',
      description: 'Foundation grid generation and setting out',
      status: 'in_progress'
    })

    steps.push({
      id: 'slope_analysis',
      label: 'Slope & Area Analysis',
      description: 'DTM slope classification, cut/fill, area computation',
      status: stationsDone ? 'in_progress' : 'locked',
      gated: true
    })

    steps.push({
      id: 'progress_monitor',
      label: 'Progress Monitor',
      description: 'Construction progress tracking and inspection',
      status: 'in_progress'
    })

    steps.push({
      id: 'topo_drawing',
      label: 'Topo Drawing',
      description: 'Feature-coded survey point DXF export',
      status: 'in_progress'
    })

    steps.push({
      id: 'machine_control',
      label: 'Machine Control Export',
      description: 'Trimble, Leica, Topcon data export',
      status: 'in_progress'
    })
  } else if (mode === 'drainage') {
    const drainageSetupDone = dd?.manholes?.length ? true : false
    steps.push({
      id: 'manholes',
      label: 'Manholes',
      description: 'Define manhole locations, cover and invert levels',
      status: drainageSetupDone ? 'complete' : 'in_progress',
      gated: true
    })

    const manholesDone = dd?.manholes?.length && dd.manholes.length >= 2
    steps.push({
      id: 'pipes',
      label: 'Pipe Runs',
      description: 'Connect manholes with pipe runs and calculate gradients',
      status: manholesDone ? 'complete' : (drainageSetupDone ? 'in_progress' : 'locked'),
      gated: true
    })

    const pipesDone = dd?.pipeRuns?.length
    steps.push({
      id: 'drainage_outputs',
      label: 'Hydraulic Summary',
      description: 'Pipe capacities, velocities, sizing verification',
      status: pipesDone ? 'complete' : 'locked',
      gated: true
    })

    steps.push({
      id: 'export',
      label: 'Export Package',
      description: 'Drainage layout PDF, invert levels schedule',
      status: 'locked',
      gated: true
    })
  }

  return steps
}

function Step1Setup({ 
  project, 
  data, 
  onSave,
  mode,
  onModeChange
}: { 
  project: EngineeringProject
  data: RoadDesignData | null
  onSave: (data: Partial<RoadDesignData>) => void
  mode: EngineeringMode
  onModeChange: (mode: EngineeringMode) => void
}) {
  const [roadName, setRoadName] = useState(data?.roadName || '')
  const [startChainage, setStartChainage] = useState(data?.startChainage || 0)
  const [designSpeed, setDesignSpeed] = useState(data?.designSpeed || 60)
  const [roadClass, setRoadClass] = useState<string>(data?.roadClass || 'C')
  const [standard, setStandard] = useState<EngineeringStandard>(data?.standard || 'KRDM2017')
  const [datum, setDatum] = useState(data?.datum || 'Arc 1960')
  const [coordSys, setCoordSys] = useState(data?.coordinateSystem || 'UTM Zone 37S')

  const standardObj = standard === 'KRDM2017' ? KRDM2017 : KeRRA
  const speedRange = standardObj.designSpeeds[roadClass as keyof typeof standardObj.designSpeeds]

  useEffect(() => {
    if (speedRange && (designSpeed < speedRange[0] || designSpeed > speedRange[1])) {
      setDesignSpeed(speedRange[0])
    }
  }, [roadClass, standard, speedRange, designSpeed])

  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    if (!roadName.trim()) {
      setError('Road name is required')
      return
    }
    if (designSpeed <= 0) {
      setError('Design speed must be greater than 0')
      return
    }
    setError(null)
    onSave({
      roadName: roadName.trim(),
      startChainage,
      designSpeed,
      roadClass: roadClass as any,
      standard,
      datum,
      coordinateSystem: coordSys
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Project Setup</h3>
        <p className="text-zinc-400 text-sm">Define road parameters per {standard} standard.</p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>
      )}

      <div className="border border-zinc-700 rounded-lg p-4">
        <label className="block text-sm text-zinc-400 mb-2">Engineering Mode</label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onModeChange('road')}
            className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition ${
              mode === 'road' 
                ? 'bg-amber-500/20 border-amber-500 text-amber-400' 
                : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            🚧 Road Design
          </button>
          <button
            type="button"
            onClick={() => onModeChange('drainage')}
            className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition ${
              mode === 'drainage' 
                ? 'bg-amber-500/20 border-amber-500 text-amber-400' 
                : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            🌧️ Drainage Survey
          </button>
        </div>
      </div>

      {mode === 'road' && (
        <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Road Name</label>
          <input
            type="text"
            value={roadName}
            onChange={e => setRoadName(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
            placeholder="e.g. Nairobi-Mombasa Highway"
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1">Start Chainage (m)</label>
          <input
            type="number"
            value={startChainage}
            onChange={e => setStartChainage(Number(e.target.value))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1">Road Class (per {standard})</label>
          <select
            value={roadClass}
            onChange={e => setRoadClass(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
          >
            {ROAD_CLASSES.map((c: any) => (
              <option key={c} value={c}>Class {c} {standard === 'KRDM2017' ? '- ' + (c === 'A' ? 'Major Arterial' : c === 'D' ? 'Minor Collector' : '') : ''}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1">Design Speed (km/h)</label>
          <input
            type="number"
            value={designSpeed}
            onChange={e => setDesignSpeed(Number(e.target.value))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
            min={speedRange?.[0] || 30}
            max={speedRange?.[1] || 120}
          />
          <p className="text-xs text-zinc-500 mt-1">Valid range: {speedRange?.[0] || 30} - {speedRange?.[1] || 120} km/h</p>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1">Standard</label>
          <select
            value={standard}
            onChange={e => setStandard(e.target.value as EngineeringStandard)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
          >
            <option value="KRDM2017">KRDM 2017</option>
            <option value="KeRRA">KeRRA (Rural Roads)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1">Carriageway Width (m)</label>
          <input
            type="number"
            step="0.1"
            value={getCarriagewayWidth(standard, roadClass as any)}
            disabled
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-500"
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1">Datum</label>
          <select
            value={datum}
            onChange={e => setDatum(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
          >
            <option value="Arc 1960">Arc 1960</option>
            <option value="WGS84">WGS84</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1">Coordinate System</label>
          <select
            value={coordSys}
            onChange={e => setCoordSys(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
          >
            <option value="UTM Zone 37S">UTM Zone 37S</option>
            <option value="UTM Zone 36S">UTM Zone 36S</option>
            <option value="UTM Zone 38S">UTM Zone 38S</option>
          </select>
        </div>
      </div>
      </>
      )}

      <button
        onClick={handleSave}
        className="px-6 py-2.5 bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-400"
      >
        Save Setup
      </button>
    </div>
  )
}

function Step2Horizontal({ 
  data, 
  onSave 
}: { 
  data: RoadDesignData | null
  onSave: (ips: IntersectionPoint[]) => void 
}) {
  const [ips, setIps] = useState<IntersectionPoint[]>(data?.ips || [])

  const addIP = () => {
    const newIp: IntersectionPoint = {
      id: `IP${ips.length + 1}`,
      name: `IP${ips.length + 1}`,
      easting: 0,
      northing: 0,
      radius: 100
    }
    setIps([...ips, newIp])
  }

  const updateIP = (index: number, field: keyof IntersectionPoint, value: any) => {
    const updated = [...ips]
    updated[index] = { ...updated[index], [field]: value }
    setIps(updated)
  }

  const removeIP = (index: number) => {
    setIps(ips.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    onSave(ips)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Horizontal Alignment</h3>
        <p className="text-zinc-400 text-sm">Define intersection points (IPs) and circular curve radii.</p>
      </div>

      {ips.length === 0 ? (
        <div className="text-center py-8 text-zinc-500">
          <p>No IPs defined. Add at least 2 IPs for a valid alignment.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {ips.map((ip, idx) => (
            <div key={ip.id} className="border border-zinc-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium text-white">IP {idx + 1}</span>
                <button
                  onClick={() => removeIP(idx)}
                  className="text-red-400 text-sm hover:text-red-300"
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Name</label>
                  <input
                    type="text"
                    value={ip.name}
                    onChange={e => updateIP(idx, 'name', e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Easting (m)</label>
                  <input
                    type="number"
                    value={ip.easting}
                    onChange={e => updateIP(idx, 'easting', Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Northing (m)</label>
                  <input
                    type="number"
                    value={ip.northing}
                    onChange={e => updateIP(idx, 'northing', Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Radius (m)</label>
                  <input
                    type="number"
                    value={ip.radius}
                    onChange={e => updateIP(idx, 'radius', Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-white text-sm"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={addIP}
        className="px-4 py-2 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800"
      >
        + Add IP
      </button>

      {ips.length >= 2 && (
        <button
          onClick={handleSave}
          className="px-6 py-2.5 bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-400"
        >
          Save IPs
        </button>
      )}
    </div>
  )
}

function Step3Vertical({ 
  data, 
  onSave 
}: { 
  data: RoadDesignData | null
  onSave: (vips: VerticalIP[]) => void 
}) {
  const [vips, setVips] = useState<VerticalIP[]>(data?.vips || [])

  const addVIP = () => {
    const newVip: VerticalIP = {
      id: `VIP${vips.length + 1}`,
      chainage: 0,
      reducedLevel: 0
    }
    setVips([...vips, newVip])
  }

  const updateVIP = (index: number, field: keyof VerticalIP, value: any) => {
    const updated = [...vips]
    updated[index] = { ...updated[index], [field]: value }
    setVips(updated)
  }

  const removeVIP = (index: number) => {
    setVips(vips.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    onSave(vips)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Vertical Alignment</h3>
        <p className="text-zinc-400 text-sm">Define vertical intersection points (VIPs) for vertical curves.</p>
      </div>

      {vips.length === 0 ? (
        <div className="text-center py-8 text-zinc-500">
          <p>No VIPs defined. Add at least 1 VIP for vertical alignment.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {vips.map((vip, idx) => (
            <div key={vip.id} className="border border-zinc-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium text-white">VIP {idx + 1}</span>
                <button
                  onClick={() => removeVIP(idx)}
                  className="text-red-400 text-sm hover:text-red-300"
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Chainage (m)</label>
                  <input
                    type="number"
                    value={vip.chainage}
                    onChange={e => updateVIP(idx, 'chainage', Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Reduced Level (m)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={vip.reducedLevel}
                    onChange={e => updateVIP(idx, 'reducedLevel', Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">K Value (optional)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={vip.kValue || ''}
                    onChange={e => updateVIP(idx, 'kValue', e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-white text-sm"
                    placeholder="auto"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={addVIP}
        className="px-4 py-2 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800"
      >
        + Add VIP
      </button>

      {vips.length >= 1 && (
        <button
          onClick={handleSave}
          className="px-6 py-2.5 bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-400"
        >
          Save VIPs
        </button>
      )}
    </div>
  )
}

function Step4CrossSection({ 
  data, 
  onSave 
}: { 
  data: RoadDesignData | null
  onSave: (template: CrossSectionTemplate) => void 
}) {
  const [template, setTemplate] = useState<CrossSectionTemplate>(data?.crossSectionTemplate || {
    carriagewayWidth: 6.0,
    shoulderWidth: 1.0,
    cutSlope: '1:1',
    fillSlope: '1:1.5',
    camber: 3,
    subgradeDepth: 0.5
  })

  const handleSave = () => {
    onSave(template)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Cross Section Template</h3>
        <p className="text-zinc-400 text-sm">Define standard cross section parameters.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Carriageway Width (m)</label>
          <input
            type="number"
            step="0.1"
            value={template.carriagewayWidth}
            onChange={e => setTemplate({ ...template, carriagewayWidth: Number(e.target.value) })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Shoulder Width (m)</label>
          <input
            type="number"
            step="0.1"
            value={template.shoulderWidth}
            onChange={e => setTemplate({ ...template, shoulderWidth: Number(e.target.value) })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Camber (%)</label>
          <input
            type="number"
            step="0.5"
            value={template.camber}
            onChange={e => setTemplate({ ...template, camber: Number(e.target.value) })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Cut Slope (H:V)</label>
          <input
            type="text"
            value={template.cutSlope}
            onChange={e => setTemplate({ ...template, cutSlope: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
            placeholder="1:1"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Fill Slope (H:V)</label>
          <input
            type="text"
            value={template.fillSlope}
            onChange={e => setTemplate({ ...template, fillSlope: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
            placeholder="1:1.5"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Subgrade Depth (m)</label>
          <input
            type="number"
            step="0.1"
            value={template.subgradeDepth}
            onChange={e => setTemplate({ ...template, subgradeDepth: Number(e.target.value) })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        className="px-6 py-2.5 bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-400"
      >
        Save Template
      </button>
    </div>
  )
}

function Step5Stations({ 
  data, 
  onSave 
}: { 
  data: RoadDesignData | null
  onSave: (stations: StationData[]) => void 
}) {
  const [stations, setStations] = useState<StationData[]>(data?.stations || [])
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  const addStation = () => {
    const lastCh = stations.length > 0 ? stations[stations.length - 1].chainage : 0
    setStations([...stations, { chainage: lastCh + 20, groundLevel: 0 }])
  }

  const updateStation = (index: number, field: keyof StationData, value: any) => {
    const updated = [...stations]
    updated[index] = { ...updated[index], [field]: value }
    setStations(updated)
  }

  const removeStation = (index: number) => {
    setStations(stations.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    onSave(stations)
  }

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string
        const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
        if (lines.length < 2) {
          setToast({ message: 'CSV must have a header row and at least one data row', type: 'error' })
          return
        }

        // Parse header — normalize to lowercase, strip spaces
        const headerRaw = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[\s_-]/g, ''))
        const chIdx = headerRaw.findIndex(h => h === 'chainage' || h === 'station' || h === 'chainage(m)')
        const glIdx = headerRaw.findIndex(h => h === 'groundlevel' || h === 'ground_level' || h === 'groundlevel(m)' || h === 'elevation' || h === 'level')

        if (chIdx === -1 || glIdx === -1) {
          setToast({ message: 'CSV must contain "chainage" and "ground_level" (or "groundLevel") columns', type: 'error' })
          return
        }

        const parsed: StationData[] = []
        let skipped = 0

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim())
          const chainage = parseFloat(cols[chIdx])
          const groundLevel = parseFloat(cols[glIdx])

          if (isNaN(chainage) || isNaN(groundLevel)) {
            skipped++
            continue
          }
          parsed.push({ chainage, groundLevel })
        }

        if (parsed.length === 0) {
          setToast({ message: 'No valid rows found — ensure chainage and ground_level are numeric', type: 'error' })
          return
        }

        // Sort by chainage ascending
        parsed.sort((a, b) => a.chainage - b.chainage)
        setStations(parsed)
        setToast({ message: `Imported ${parsed.length} station${parsed.length > 1 ? 's' : ''}${skipped > 0 ? ` (${skipped} skipped)` : ''}`, type: 'success' })
        setTimeout(() => setToast(null), 4000)
      } catch {
        setToast({ message: 'Failed to parse CSV file', type: 'error' })
        setTimeout(() => setToast(null), 4000)
      }
    }
    reader.readAsText(file)

    // Reset the input so re-importing the same file works
    e.target.value = ''
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Stations & Levels</h3>
        <p className="text-zinc-400 text-sm">Enter ground levels at chainage intervals (default 20m).</p>
      </div>

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg transition-all ${
          toast.type === 'success' ? 'bg-green-900/90 text-green-300 border border-green-700' : 'bg-red-900/90 text-red-300 border border-red-700'
        }`}>
          {toast.type === 'success' ? '✓ ' : '✕ '}{toast.message}
        </div>
      )}

      {stations.length === 0 ? (
        <div className="text-center py-8 text-zinc-500">
          <p>No stations defined. Add stations to proceed.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-800 text-zinc-400">
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-right">Chainage (m)</th>
                <th className="px-3 py-2 text-right">Ground Level (m)</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {stations.map((s, idx) => (
                <tr key={idx} className="border-t border-zinc-800">
                  <td className="px-3 py-2 text-zinc-500">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={s.chainage}
                      onChange={e => updateStation(idx, 'chainage', Number(e.target.value))}
                      className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-white text-right"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.001"
                      value={s.groundLevel}
                      onChange={e => updateStation(idx, 'groundLevel', Number(e.target.value))}
                      className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-white text-right"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => removeStation(idx)} className="text-red-400 hover:text-red-300">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-3 items-center">
        <button
          onClick={addStation}
          className="px-4 py-2 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800"
        >
          + Add Station
        </button>
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleCSVImport}
          className="hidden"
        />
        <button
          onClick={() => csvInputRef.current?.click()}
          className="px-4 py-2 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Import CSV
        </button>
      </div>

      {stations.length >= 2 && (
        <button
          onClick={handleSave}
          className="px-6 py-2.5 bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-400"
        >
          Save Stations
        </button>
      )}
    </div>
  )
}

function DrainageStep1Manholes({ 
  data, 
  onSave 
}: { 
  data: DrainageData | null
  onSave: (manholes: Manhole[]) => void 
}) {
  const [manholes, setManholes] = useState<Manhole[]>(data?.manholes || [])

  const addManhole = () => {
    const newMh: Manhole = {
      id: `MH${manholes.length + 1}`,
      name: `MH${manholes.length + 1}`,
      chainage: manholes.length > 0 ? manholes[manholes.length - 1].chainage + 30 : 0,
      coverLevel: 0,
      invertLevelIn: 0,
      invertLevelOut: 0,
      pipeDiameterOut: 450,
      pipeMaterial: 'Concrete'
    }
    setManholes([...manholes, newMh])
  }

  const updateManhole = (index: number, field: keyof Manhole, value: any) => {
    const updated = [...manholes]
    updated[index] = { ...updated[index], [field]: value }
    setManholes(updated)
  }

  const removeManhole = (index: number) => {
    setManholes(manholes.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    onSave(manholes)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Manholes</h3>
        <p className="text-zinc-400 text-sm">Define manhole locations, cover and invert levels.</p>
      </div>

      {manholes.length === 0 ? (
        <div className="text-center py-8 text-zinc-500">
          <p>No manholes defined. Add at least 2 manholes for a drainage line.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {manholes.map((mh, idx) => (
            <div key={mh.id} className="border border-zinc-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium text-white">Manhole {idx + 1}</span>
                <button
                  onClick={() => removeManhole(idx)}
                  className="text-red-400 text-sm hover:text-red-300"
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Name</label>
                  <input
                    type="text"
                    value={mh.name}
                    onChange={e => updateManhole(idx, 'name', e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Chainage (m)</label>
                  <input
                    type="number"
                    value={mh.chainage}
                    onChange={e => updateManhole(idx, 'chainage', Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Cover Level (m)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={mh.coverLevel}
                    onChange={e => updateManhole(idx, 'coverLevel', Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Invert Out (m)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={mh.invertLevelOut}
                    onChange={e => updateManhole(idx, 'invertLevelOut', Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Pipe Dia (mm)</label>
                  <input
                    type="number"
                    value={mh.pipeDiameterOut}
                    onChange={e => updateManhole(idx, 'pipeDiameterOut', Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Material</label>
                  <select
                    value={mh.pipeMaterial}
                    onChange={e => updateManhole(idx, 'pipeMaterial', e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-white text-sm"
                  >
                    <option value="Concrete">Concrete</option>
                    <option value="HDPE">HDPE</option>
                    <option value="uPVC">uPVC</option>
                    <option value="VCP">VCP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Depth (m)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={mh.coverLevel - mh.invertLevelOut}
                    disabled
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-zinc-500 text-sm"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={addManhole}
        className="px-4 py-2 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800"
      >
        + Add Manhole
      </button>

      {manholes.length >= 2 && (
        <button
          onClick={handleSave}
          className="px-6 py-2.5 bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-400"
        >
          Save Manholes
        </button>
      )}
    </div>
  )
}

function DrainageStep2Pipes({ 
  data, 
  onSave 
}: { 
  data: DrainageData | null
  onSave: (pipeRuns: PipeRun[]) => void 
}) {
  const manholes = data?.manholes || []
  
  const computePipes = (): PipeRun[] => {
    if (manholes.length < 2) return []
    
    const pipes: PipeRun[] = []
    for (let i = 0; i < manholes.length - 1; i++) {
      const mh1 = manholes[i]
      const mh2 = manholes[i + 1]
      
      const length = mh2.chainage - mh1.chainage
      const fall = mh1.invertLevelOut - mh2.invertLevelOut
      const gradient = fall / length
      const diameter = mh2.pipeDiameterOut / 1000
      
      const manningN = MANNING_N[mh2.pipeMaterial as keyof typeof MANNING_N] || 0.013
      const velocity = gradient > 0 ? (1 / manningN) * Math.pow(diameter, 2/3) * Math.pow(gradient, 0.5) : 0
      const fullBore = (Math.PI * Math.pow(diameter, 2) / 4) * velocity
      
      pipes.push({
        fromMH: mh1.name,
        toMH: mh2.name,
        length,
        gradient: gradient * 100,
        velocity,
        fullBoreCapacity: fullBore,
        gradientStatus: gradient > 0.001 ? 'OK' : gradient > 0 ? 'TOO_FLAT' : 'TOO_STEEP'
      })
    }
    return pipes
  }

  const [autoCompute, setAutoCompute] = useState(true)
  const pipes = autoCompute ? computePipes() : data?.pipeRuns || []

  const handleSave = () => {
    onSave(pipes)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Pipe Runs</h3>
        <p className="text-zinc-400 text-sm">Connect manholes with pipe runs and calculate gradients.</p>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          type="checkbox"
          id="autoCompute"
          checked={autoCompute}
          onChange={e => setAutoCompute(e.target.checked)}
          className="rounded"
        />
        <label htmlFor="autoCompute" className="text-sm text-zinc-400">Auto-calculate from manhole invert levels</label>
      </div>

      {pipes.length === 0 ? (
        <div className="text-center py-8 text-zinc-500">
          <p>Add at least 2 manholes to compute pipe runs.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-800 text-zinc-400">
                <th className="px-3 py-2 text-left">From</th>
                <th className="px-3 py-2 text-left">To</th>
                <th className="px-3 py-2 text-right">Length (m)</th>
                <th className="px-3 py-2 text-right">Gradient (%)</th>
                <th className="px-3 py-2 text-right">Velocity (m/s)</th>
                <th className="px-3 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {pipes.map((p, idx) => (
                <tr key={idx} className="border-t border-zinc-800">
                  <td className="px-3 py-2 text-white">{p.fromMH}</td>
                  <td className="px-3 py-2 text-white">{p.toMH}</td>
                  <td className="px-3 py-2 text-right text-zinc-400">{p.length.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right text-zinc-400">{p.gradient.toFixed(3)}%</td>
                  <td className="px-3 py-2 text-right text-zinc-400">{p.velocity.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      p.gradientStatus === 'OK' ? 'bg-green-900 text-green-400' :
                      p.gradientStatus === 'TOO_FLAT' ? 'bg-amber-900 text-amber-400' :
                      'bg-red-900 text-red-400'
                    }`}>
                      {p.gradientStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={handleSave}
        className="px-6 py-2.5 bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-400"
      >
        Save Pipe Runs
      </button>
    </div>
  )
}

function DrainageStep3Outputs({ 
  data 
}: { 
  data: DrainageData | null
}) {
  const manholes = data?.manholes || []
  const pipes = data?.pipeRuns || []

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Hydraulic Summary</h3>
        <p className="text-zinc-400 text-sm">Pipe capacities, velocities, sizing verification.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border border-zinc-700 rounded-lg p-4">
          <h4 className="font-medium text-white mb-3">Invert Levels Schedule</h4>
          {manholes.length === 0 ? (
            <p className="text-zinc-500 text-sm">Add manholes to see schedule.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 text-xs">
                  <th className="text-left pb-2">Manhole</th>
                  <th className="text-right pb-2">Cover</th>
                  <th className="text-right pb-2">Invert</th>
                  <th className="text-right pb-2">Depth</th>
                </tr>
              </thead>
              <tbody>
                {manholes.map((m, i) => (
                  <tr key={i} className="border-t border-zinc-800">
                    <td className="py-1.5 text-white">{m.name}</td>
                    <td className="py-1.5 text-right text-zinc-400">{m.coverLevel.toFixed(3)}</td>
                    <td className="py-1.5 text-right text-zinc-400">{m.invertLevelOut.toFixed(3)}</td>
                    <td className="py-1.5 text-right text-zinc-400">{(m.coverLevel - m.invertLevelOut).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border border-zinc-700 rounded-lg p-4">
          <h4 className="font-medium text-white mb-3">Pipe Capacity Check</h4>
          {pipes.length === 0 ? (
            <p className="text-zinc-500 text-sm">Add pipe runs to verify sizing.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 text-xs">
                  <th className="text-left pb-2">Run</th>
                  <th className="text-right pb-2">Capacity</th>
                  <th className="text-right pb-2">Velocity</th>
                </tr>
              </thead>
              <tbody>
                {pipes.map((p, i) => (
                  <tr key={i} className="border-t border-zinc-800">
                    <td className="py-1.5 text-white">{p.fromMH}-{p.toMH}</td>
                    <td className="py-1.5 text-right text-zinc-400">{(p.fullBoreCapacity * 1000).toFixed(1)} L/s</td>
                    <td className="py-1.5 text-right text-zinc-400">{p.velocity.toFixed(2)} m/s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function Step6Outputs({ 
  project, 
  data 
}: { 
  project: EngineeringProject
  data: RoadDesignData | null
}) {
  const ips = data?.ips || []
  const vips = data?.vips || []
  const stations = data?.stations || []
  const template = data?.crossSectionTemplate

  const computeCurves = () => {
    const results: any[] = []
    for (let i = 0; i < ips.length - 1; i++) {
      const ip1 = ips[i]
      const ip2 = ips[i + 1]
      const dx = ip2.easting - ip1.easting
      const dy = ip2.northing - ip1.northing
      const dist = Math.sqrt(dx * dx + dy * dy)
      const bearing = Math.atan2(dx, dy) * (180 / Math.PI)
      const radius = ip2.radius || 100
      const deflection = bearing - (i > 0 ? Math.atan2(ips[i].easting - ips[i-1].easting, ips[i].northing - ips[i-1].northing) * (180 / Math.PI) : bearing)
      const tangent = radius * Math.tan(Math.abs(deflection) / 2 * Math.PI / 180)
      const arc = radius * Math.abs(deflection) * Math.PI / 180
      results.push({
        name: ip2.name,
        from: ip1.name,
        to: ip2.name,
        radius,
        deflection: deflection.toFixed(2),
        tangent: tangent.toFixed(2),
        arc: arc.toFixed(2)
      })
    }
    return results
  }

  const computeEarthworks = () => {
    if (!template || stations.length < 2) return []
    const rows: any[] = []
    for (let i = 0; i < stations.length; i++) {
      const s = stations[i]
      let cutArea = 0, fillArea = 0
      const halfW = template.carriagewayWidth / 2 + template.shoulderWidth
      const heightDiff = s.designLevel ? s.groundLevel - s.designLevel : 0
      if (heightDiff > 0) {
        cutArea = heightDiff * halfW * 2 + (heightDiff * heightDiff)
      } else {
        fillArea = Math.abs(heightDiff) * halfW * 2 + (heightDiff * heightDiff)
      }
      let cutVol = 0, fillVol = 0
      if (i > 0) {
        const prev = stations[i - 1]
        const d = s.chainage - prev.chainage
        cutVol = ((prev.cutArea || 0) + cutArea) / 2 * d
        fillVol = ((prev.fillArea || 0) + fillArea) / 2 * d
      }
      rows.push({ chainage: s.chainage, groundLevel: s.groundLevel, cutArea, fillArea, cutVol, fillVol })
    }
    return rows
  }

  const curves = computeCurves()
  const earthworks = computeEarthworks()

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Computed Outputs</h3>
        <p className="text-zinc-400 text-sm">Horizontal curves and earthworks summary.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border border-zinc-700 rounded-lg p-4">
          <h4 className="font-medium text-white mb-3">Horizontal Curves</h4>
          {curves.length === 0 ? (
            <p className="text-zinc-500 text-sm">Add at least 2 IPs to compute curves.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 text-xs">
                  <th className="text-left pb-2">IP</th>
                  <th className="text-right pb-2">Radius</th>
                  <th className="text-right pb-2">Defl</th>
                  <th className="text-right pb-2">Tangent</th>
                  <th className="text-right pb-2">Arc</th>
                </tr>
              </thead>
              <tbody>
                {curves.map((c, i) => (
                  <tr key={i} className="border-t border-zinc-800">
                    <td className="py-1.5 text-white">{c.name}</td>
                    <td className="py-1.5 text-right text-zinc-400">{c.radius}m</td>
                    <td className="py-1.5 text-right text-zinc-400">{c.deflection}°</td>
                    <td className="py-1.5 text-right text-zinc-400">{c.tangent}m</td>
                    <td className="py-1.5 text-right text-zinc-400">{c.arc}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border border-zinc-700 rounded-lg p-4">
          <h4 className="font-medium text-white mb-3">Earthworks Summary</h4>
          {earthworks.length === 0 ? (
            <p className="text-zinc-500 text-sm">Add stations and cross section template.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 text-xs">
                  <th className="text-left pb-2">Ch</th>
                  <th className="text-right pb-2">G.L.</th>
                  <th className="text-right pb-2">Cut</th>
                  <th className="text-right pb-2">Fill</th>
                </tr>
              </thead>
              <tbody>
                {earthworks.slice(0, 10).map((e, i) => (
                  <tr key={i} className="border-t border-zinc-800">
                    <td className="py-1.5 text-white">{e.chainage}m</td>
                    <td className="py-1.5 text-right text-zinc-400">{e.groundLevel.toFixed(2)}</td>
                    <td className="py-1.5 text-right text-green-400">{e.cutArea.toFixed(1)}m²</td>
                    <td className="py-1.5 text-right text-amber-400">{e.fillArea.toFixed(1)}m²</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function renderStepContent(
  stepId: EngineeringStepId,
  project: EngineeringProject,
  engineeringData: EngineeringData | null,
  onSave: (data: Partial<EngineeringData>) => void,
  onModeChange?: (mode: EngineeringMode) => void
) {
  const mode = engineeringData?.mode || 'road'
  const roadData = engineeringData?.road || null
  const drainageData = engineeringData?.drainage || null

  switch (stepId) {
    case 'setup':
      return (
        <Step1Setup
          project={project}
          data={roadData}
          mode={mode}
          onModeChange={(m) => onModeChange?.(m)}
          onSave={(data) => onSave({ road: { ...roadData, ...data } as RoadDesignData })}
        />
      )
    case 'horizontal':
      return (
        <Step2Horizontal
          data={roadData}
          onSave={(ips) => onSave({ road: { ...roadData, ips } as RoadDesignData })}
        />
      )
    case 'vertical':
      return (
        <Step3Vertical
          data={roadData}
          onSave={(vips) => onSave({ road: { ...roadData, vips } as RoadDesignData })}
        />
      )
    case 'cross_section':
      return (
        <Step4CrossSection
          data={roadData}
          onSave={(template) => onSave({ road: { ...roadData, crossSectionTemplate: template } as RoadDesignData })}
        />
      )
    case 'stations':
      return (
        <Step5Stations
          data={roadData}
          onSave={(stations) => onSave({ road: { ...roadData, stations } as RoadDesignData })}
        />
      )
    case 'outputs':
      return (
        <Step6Outputs
          project={project}
          data={roadData}
        />
      )
    case 'manholes':
      return (
        <DrainageStep1Manholes
          data={drainageData}
          onSave={(manholes) => onSave({ drainage: { ...drainageData, manholes } as DrainageData })}
        />
      )
    case 'pipes':
      return (
        <DrainageStep2Pipes
          data={drainageData}
          onSave={(pipeRuns) => onSave({ drainage: { ...drainageData, pipeRuns } as DrainageData })}
        />
      )
    case 'drainage_outputs':
      return (
        <DrainageStep3Outputs
          data={drainageData}
        />
      )
    case 'export':
      if (mode === 'drainage') {
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Export Package</h3>
              <p className="text-zinc-400 text-sm">Generate drainage layout PDF, invert levels schedule.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {['Drainage Layout PDF', 'Invert Levels Schedule', 'Manhole Schedule', 'Long Section PDF'].map((fmt: any) => (
                <button key={fmt} className="py-3 rounded-lg border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800">
                  ↓ {fmt}
                </button>
              ))}
            </div>
          </div>
        )
      }
      return (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Export Package</h3>
            <p className="text-zinc-400 text-sm">Generate PDF reports, long section, peg book.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {['Horizontal Alignment Report', 'Vertical Alignment Report', 'Earthworks Summary', 'Long Section PDF'].map((fmt: any) => (
              <button key={fmt} className="py-3 rounded-lg border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800">
                ↓ {fmt}
              </button>
            ))}
          </div>
        </div>
      )
    case 'long_section': {
      const stations = roadData?.stations || []
      const vips = roadData?.vips || []
      if (stations.length === 0) {
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Long Section</h3>
              <p className="text-zinc-400 text-sm">Chainage vs elevation profile.</p>
            </div>
            <div className="text-center py-12 text-zinc-500">
              <p>Add station levels in Step 5 (Stations & Levels) first.</p>
            </div>
          </div>
        )
      }
      return (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Long Section</h3>
            <p className="text-zinc-400 text-sm">Chainage vs elevation profile with vertical curves, cut/fill areas.</p>
          </div>
          <LongSectionRenderer
            stations={stations.map(s => ({
              chainage: s.chainage,
              groundLevel: s.groundLevel,
              designLevel: s.designLevel,
            }))}
            verticalIPs={vips.map(v => ({
              chainage: v.chainage,
              reducedLevel: v.reducedLevel,
              kValue: v.kValue,
            }))}
            projectInfo={{
              roadName: roadData?.roadName || 'Unnamed Road',
              roadClass: roadData?.roadClass || 'C',
              designSpeed: roadData?.designSpeed || 60,
              startChainage: roadData?.startChainage || 0,
              datum: roadData?.datum || 'Arc 1960',
            }}
          />
        </div>
      )
    }
    case 'cross_section_view': {
      const stations = roadData?.stations || []
      const template = roadData?.crossSectionTemplate
      if (stations.length === 0 || !template) {
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Cross Sections</h3>
              <p className="text-zinc-400 text-sm">Formation template sections at each chainage.</p>
            </div>
            <div className="text-center py-12 text-zinc-500">
              <p>Add station levels and a cross section template first.</p>
            </div>
          </div>
        )
      }
      const sections = stations.map(s => ({
        chainage: s.chainage,
        groundPoints: [
          { offset: -(template.carriagewayWidth / 2 + template.shoulderWidth + 10), level: s.groundLevel + 0.3 },
          { offset: -(template.carriagewayWidth / 2 + template.shoulderWidth), level: s.groundLevel + 0.1 },
          { offset: -(template.carriagewayWidth / 2), level: s.groundLevel },
          { offset: 0, level: s.groundLevel - 0.1 },
          { offset: template.carriagewayWidth / 2, level: s.groundLevel },
          { offset: template.carriagewayWidth / 2 + template.shoulderWidth, level: s.groundLevel + 0.1 },
          { offset: template.carriagewayWidth / 2 + template.shoulderWidth + 10, level: s.groundLevel + 0.3 },
        ],
        formationLevel: s.designLevel ?? s.groundLevel,
        cutArea: s.designLevel ? Math.max(0, s.groundLevel - s.designLevel) * (template.carriagewayWidth + template.shoulderWidth * 2) : 0,
        fillArea: s.designLevel ? Math.max(0, s.designLevel - s.groundLevel) * (template.carriagewayWidth + template.shoulderWidth * 2) : 0,
      }))
      const defaultTemplate = {
        carriagewayWidth: template.carriagewayWidth,
        shoulderWidth: template.shoulderWidth,
        cutSlope: template.cutSlope,
        fillSlope: template.fillSlope,
        camber: template.camber,
        subgradeDepth: template.subgradeDepth,
      }
      return (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Cross Sections</h3>
            <p className="text-zinc-400 text-sm">Formation template sections at each chainage station.</p>
          </div>
          <CrossSectionSeries sections={sections} template={defaultTemplate} interval={20} />
        </div>
      )
    }
    case 'pavement_design': {
      const stations = roadData?.stations || []
      const template = roadData?.crossSectionTemplate
      const roadLength = stations.length >= 2 ? stations[stations.length - 1].chainage - stations[0].chainage : 0
      return (
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Pavement Layer Design</h3>
          <p className="text-zinc-400 text-sm mb-4">CBR-based pavement design per KeNHA Pavement Design Manual. Input traffic &amp; subgrade data to determine layer thicknesses.</p>
          <PavementDesignPanel
            roadClass={roadData?.roadClass}
            carriagewayWidth={template?.carriagewayWidth}
            roadLength={roadLength || 1000}
          />
        </div>
      )
    }
    case 'drainage_design': {
      const stations = roadData?.stations || []
      const roadLength = stations.length >= 2 ? stations[stations.length - 1].chainage - stations[0].chainage : 0
      return (
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Drainage Design Tools</h3>
          <p className="text-zinc-400 text-sm mb-4">Manning&apos;s equation pipe capacity, Rational Method catchment analysis, trapezoidal channel design per RDM 1.3.</p>
          <DrainageDesignPanel roadLength={roadLength || 1000} />
        </div>
      )
    }
    case 'as_built': {
      return (
        <div>
          <h3 className="text-xl font-bold text-white mb-4">As-Built Survey</h3>
          <p className="text-zinc-400 text-sm mb-4">Compare design levels against as-built survey data. Paste CSV (chainage, design_level, as_built_level) to compute deviations and KeNHA compliance.</p>
          <AsBuiltSurveyPanel roadClass={roadData?.roadClass} />
        </div>
      )
    }
    case 'road_completion': {
      return (
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Road Completion Certificate</h3>
          <p className="text-zinc-400 text-sm mb-4">Generate a road completion certificate per Kenya Roads Act, Cap 407. Fill in project details, certification checklist, and surveyor declaration.</p>
          <RoadCompletionCertificatePanel roadClass={roadData?.roadClass} />
        </div>
      )
    }
    case 'road_reserve': {
      const stations = roadData?.stations || []
      const template = roadData?.crossSectionTemplate
      const roadLength = stations.length >= 2 ? stations[stations.length - 1].chainage - stations[0].chainage : 0
      return (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Road Reserve</h3>
            <p className="text-zinc-400 text-sm">Reserve width compliance, land acquisition estimate, and property impact.</p>
          </div>
          <RoadReservePanel
            roadClass={roadData?.roadClass || 'C'}
            roadLength={roadLength || undefined}
            existingRoadWidth={template?.carriagewayWidth ? template.carriagewayWidth + template.shoulderWidth * 2 : undefined}
          />
        </div>
      )
    }
    case 'pile_grid': {
      return (
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Pile / Column Grid Setting Out</h3>
          <p className="text-zinc-400 text-sm mb-4">Generate pile or column grid coordinates, compute bearings and distances from an instrument station, and export DXF setout drawings.</p>
          <PileGridPanel />
        </div>
      )
    }
    case 'slope_analysis': {
      return (
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Slope &amp; Area Analysis</h3>
          <p className="text-zinc-400 text-sm mb-4">DTM slope classification, cut/fill volume computation, and area calculation per KENHA standards.</p>
          <SlopeAnalysisPanel />
        </div>
      )
    }
    case 'progress_monitor': {
      return (
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Construction Progress Monitor</h3>
          <p className="text-zinc-400 text-sm mb-4">Track construction progress against programme milestones with S-curve analysis, inspection workflow, and photo attachments.</p>
          <ProgressMonitorPanel projectId={project.id || ''} />
        </div>
      )
    }
    case 'topo_drawing': {
      return (
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Topographic Drawing Composer</h3>
          <p className="text-zinc-400 text-sm mb-4">Assign feature codes to survey points and produce professional DXF drawings with proper layers, spot heights, and sheet layout.</p>
          <div className="text-amber-400/80 text-sm bg-amber-900/20 border border-amber-800 rounded-lg p-3">
            For the full topographic drawing experience with feature code browser and SVG preview, use the dedicated tool at{' '}
            <a href="/tools/topo-drawing" className="underline text-amber-400 hover:text-amber-300">Tools → Topographic Drawing</a>.
          </div>
        </div>
      )
    }
    case 'machine_control': {
      return (
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Machine Control Export</h3>
          <p className="text-zinc-400 text-sm mb-4">Export design points in formats compatible with Trimble, Leica, and Topcon machine control systems.</p>
          <MachineControlExportPanel />
        </div>
      )
    }
    default:
      return <div>Unknown step</div>
  }
}

export default function EngineeringWorkspacePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const dbClient = createClient()

  const [project, setProject] = useState<EngineeringProject | null>(null)
  const [surveyorProfile, setSurveyorProfile] = useState<SurveyorProfileSubmission | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingEngineering, setLoadingEngineering] = useState(false)
  const [activeStep, setActiveStep] = useState<EngineeringStepId>('setup')
  const [saving, setSaving] = useState(false)
  const [quickMode, setQuickMode] = useState(false)
  const [alignmentId, setAlignmentId] = useState<string | null>(null)

  // Sub-tab for quick compute panels
  const activeTab = searchParams.get('tab') || 'workflow'

  // --- Load engineering data from the relational DB backend ---
  const loadEngineeringData = useCallback(async (projectId: string) => {
    setLoadingEngineering(true)
    try {
      const res = await fetch(`/api/engineering/alignment?project_id=${projectId}`)
      if (!res.ok) {
        console.error('[loadEngineeringData] API error:', res.status)
        return
      }
      const json = await res.json()
      const dbData = json.data

      if (!dbData) {
        // No alignment row yet — nothing to hydrate
        setLoadingEngineering(false)
        return
      }

      // Store the alignment ID for subsequent saves (IPs, VIPs, stations)
      setAlignmentId(dbData.id)

      // Map DB column names → TypeScript shape
      const crossSectionTemplate: CrossSectionTemplate | undefined = dbData.cross_section_template
        ? {
            carriagewayWidth: Number(dbData.cross_section_template.carriageway_width ?? dbData.cross_section_template.carriagewayWidth ?? 6.0),
            shoulderWidth: Number(dbData.cross_section_template.shoulder_width ?? dbData.cross_section_template.shoulderWidth ?? 1.0),
            cutSlope: String(dbData.cross_section_template.cut_slope ?? dbData.cross_section_template.cutSlope ?? '1:1'),
            fillSlope: String(dbData.cross_section_template.fill_slope ?? dbData.cross_section_template.fillSlope ?? '1:1.5'),
            camber: Number(dbData.cross_section_template.camber ?? 3),
            subgradeDepth: Number(dbData.cross_section_template.subgrade_depth ?? dbData.cross_section_template.subgradeDepth ?? 0.5),
          }
        : undefined

      const ips: IntersectionPoint[] = (dbData.ips || []).map((row: any) => ({
        id: String(row.id),
        name: String(row.name),
        easting: Number(row.easting),
        northing: Number(row.northing),
        radius: Number(row.radius),
        deflectionAngle: row.deflection_angle != null ? Number(row.deflection_angle) : undefined,
        tangentLength: row.tangent_length != null ? Number(row.tangent_length) : undefined,
        arcLength: row.arc_length != null ? Number(row.arc_length) : undefined,
        chainageTC: row.chainage_tc != null ? Number(row.chainage_tc) : undefined,
        chainageMC: row.chainage_mc != null ? Number(row.chainage_mc) : undefined,
        chainageCT: row.chainage_ct != null ? Number(row.chainage_ct) : undefined,
        sortOrder: row.sort_order != null ? Number(row.sort_order) : undefined,
      }))

      const vips: VerticalIP[] = (dbData.vips || []).map((row: any) => ({
        id: String(row.id),
        chainage: Number(row.chainage),
        reducedLevel: Number(row.reduced_level),
        kValue: row.k_value != null ? Number(row.k_value) : undefined,
      }))

      const stations: StationData[] = (dbData.stations || []).map((row: any) => ({
        chainage: Number(row.chainage),
        groundLevel: Number(row.ground_level),
      }))

      // Build a RoadDesignData object from the DB row
      const roadFromDb: RoadDesignData = {
        roadName: String(dbData.road_name || ''),
        startChainage: Number(dbData.start_chainage ?? 0),
        datum: String(dbData.datum || 'Arc 1960'),
        coordinateSystem: String(dbData.coordinate_system || 'UTM Zone 37S'),
        designSpeed: Number(dbData.design_speed ?? 60),
        roadClass: String(dbData.road_class || 'C') as any,
        standard: (dbData.standard || 'KRDM2017') as EngineeringStandard,
        ips,
        vips,
        crossSectionTemplate: crossSectionTemplate || {
          carriagewayWidth: 6.0,
          shoulderWidth: 1.0,
          cutSlope: '1:1',
          fillSlope: '1:1.5',
          camber: 3,
          subgradeDepth: 0.5,
        },
        stations,
      }

      // Merge into the existing engineering_data, preserving mode/drainage
      setProject(prev => {
        if (!prev) return prev
        const current: EngineeringData = prev.engineering_data || { mode: 'road', standard: 'KRDM2017' }
        return {
          ...prev,
          engineering_data: {
            ...current,
            road: roadFromDb,
          },
        }
      })
    } catch (err) {
      console.error('[loadEngineeringData] Error:', err)
    } finally {
      setLoadingEngineering(false)
    }
  }, [])

  const fetchProject = useCallback(async () => {
    setLoading(true)
    const { data, error } = await dbClient
      .from('projects')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error || !data) {
      setLoading(false)
      return
    }

    const engData = (data as any).engineering_data as EngineeringData | null
    setProject({ ...data, engineering_data: engData } as EngineeringProject)
    
    const { data: profile } = await dbClient
      .from('surveyor_profiles')
      .select('isk_number, verified_isk, full_name, name, firm_name, company')
      .eq('user_id', (data as any).user_id)
      .single()
    
    if (profile) {
      setSurveyorProfile({
        registrationNumber: profile.isk_number ?? '',
        iskNumber: profile.isk_number ?? '',
        verifiedIsk: profile.verified_isk ?? false,
        fullName: profile.full_name ?? profile.name ?? '',
        firmName: profile.firm_name ?? profile.company ?? '',
        isKMemberActive: profile.verified_isk ?? true
      })
    }
    
    setLoading(false)
  }, [params.id, dbClient])

  useEffect(() => {
    fetchProject()
  }, [fetchProject])

  // Load engineering data from the relational backend after project is fetched
  const projectId = project?.id
  useEffect(() => {
    if (projectId && !loading) {
      loadEngineeringData(projectId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, loading, loadEngineeringData])

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleModeChange = async (newMode: EngineeringMode) => {
    if (!project) return
    setSaving(true)

    try {
      const current = project.engineering_data || { mode: 'road' as EngineeringMode, standard: 'KRDM2017' as EngineeringStandard }
      const updated: EngineeringData = {
        ...current,
        mode: newMode,
        standard: current.standard || 'KRDM2017'
      }

      await dbClient
        .from('projects')
        .update({ engineering_data: updated })
        .eq('id', project.id)

      setProject({ ...project, engineering_data: updated })
      setActiveStep('setup')
      showToast('Mode switched successfully')
    } catch (err) {
      showToast('Failed to save. Check your connection and try again.', 'error')
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  // --- Save the entire current engineering state to the relational backend ---
  const saveToBackend = useCallback(async (engData: EngineeringData): Promise<boolean> => {
    if (!project) return false
    const road = engData.road
    if (!road) return false

    try {
      // Step 1: Upsert alignment header → get alignment_id
      const templateForDb = road.crossSectionTemplate
        ? {
            carriagewayWidth: road.crossSectionTemplate.carriagewayWidth,
            shoulderWidth: road.crossSectionTemplate.shoulderWidth,
            cutSlope: road.crossSectionTemplate.cutSlope,
            fillSlope: road.crossSectionTemplate.fillSlope,
            camber: road.crossSectionTemplate.camber,
            subgradeDepth: road.crossSectionTemplate.subgradeDepth,
          }
        : {}

      const alignRes = await fetch('/api/engineering/alignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          road_name: road.roadName || 'Unnamed Road',
          start_chainage: road.startChainage ?? 0,
          datum: road.datum || 'Arc 1960',
          coordinate_system: road.coordinateSystem || 'UTM Zone 37S',
          design_speed: road.designSpeed ?? 60,
          road_class: road.roadClass || 'C',
          standard: road.standard || 'KRDM2017',
          cross_section_template: templateForDb,
        }),
      })
      if (!alignRes.ok) throw new Error('Failed to save alignment header')
      const alignJson = await alignRes.json()
      const aId = alignJson.data?.id
      if (!aId) throw new Error('No alignment ID returned')
      setAlignmentId(aId)

      // Step 2: Save IPs (if any)
      if (road.ips && road.ips.length > 0) {
        const ipsRes = await fetch('/api/engineering/ips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alignment_id: aId,
            ips: road.ips.map(ip => ({
              name: ip.name,
              easting: ip.easting,
              northing: ip.northing,
              radius: ip.radius,
            })),
          }),
        })
        if (!ipsRes.ok) throw new Error('Failed to save intersection points')
      }

      // Step 3: Save VIPs (if any)
      if (road.vips && road.vips.length > 0) {
        const vipsRes = await fetch('/api/engineering/vips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alignment_id: aId,
            vips: road.vips.map(v => ({
              chainage: v.chainage,
              reduced_level: v.reducedLevel,
              k_value: v.kValue ?? null,
            })),
          }),
        })
        if (!vipsRes.ok) throw new Error('Failed to save vertical intersection points')
      }

      // Step 4: Save stations (if any)
      if (road.stations && road.stations.length > 0) {
        const stationsRes = await fetch('/api/engineering/stations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alignment_id: aId,
            stations: road.stations.map(s => ({
              chainage: s.chainage,
              ground_level: s.groundLevel,
            })),
          }),
        })
        if (!stationsRes.ok) throw new Error('Failed to save stations')
      }

      return true
    } catch (err) {
      console.error('[saveToBackend] Error:', err)
      return false
    }
  }, [project])

  const handleSave = async (data: Partial<EngineeringData>) => {
    if (!project) return
    setSaving(true)

    try {
      const current = project.engineering_data || { mode: 'road' as EngineeringMode, standard: 'KRDM2017' as EngineeringStandard }
      
      let updated: EngineeringData
      if (data.mode) {
        updated = {
          ...current,
          mode: data.mode,
          standard: data.standard || current.standard || 'KRDM2017'
        }
      } else {
        updated = {
          ...current,
          mode: current.mode || 'road',
          standard: current.standard || 'KRDM2017',
          road: { ...current.road, ...data.road } as RoadDesignData,
          drainage: { ...current.drainage, ...data.drainage } as DrainageData
        }
      }

      // Save to database (engineering_data JSONB column)
      await dbClient
        .from('projects')
        .update({ engineering_data: updated })
        .eq('id', project.id)

      setProject({ ...project, engineering_data: updated })

      // Also persist to relational backend for road mode
      if (updated.road) {
        const backendOk = await saveToBackend(updated)
        if (backendOk) {
          showToast('Saved successfully')
        } else {
          showToast('Saved locally, but backend sync failed.', 'error')
        }
      } else {
        showToast('Saved successfully')
      }
    } catch (err) {
      showToast('Failed to save. Check your connection and try again.', 'error')
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  // Save All handler — persists the full current state to the backend
  const handleSaveAll = async () => {
    if (!project || !project.engineering_data) return
    setSaving(true)
    try {
      // First ensure local state is up to date
      await dbClient
        .from('projects')
        .update({ engineering_data: project.engineering_data })
        .eq('id', project.id)

      if (project.engineering_data.road) {
        const backendOk = await saveToBackend(project.engineering_data)
        if (backendOk) {
          showToast('All engineering data saved to backend')
        } else {
          showToast('Backend sync failed. Local data is preserved.', 'error')
        }
      } else {
        showToast('All data saved')
      }
    } catch (err) {
      showToast('Failed to save. Check your connection and try again.', 'error')
      console.error('Save All failed:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-zinc-500 animate-pulse">Loading...</div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center">
        <div className="text-red-400">Project not found</div>
        <button onClick={() => router.push('/dashboard')} className="text-amber-500 mt-4">Back to Dashboard</button>
      </div>
    )
  }

  const steps = getEngineeringSteps(project.engineering_data || null)
  const currentStep = steps.find((s: any) => s.id === activeStep) || steps[0]
  const mode = project.engineering_data?.mode || 'road'

  // Quick Compute Panel Mode
  if (activeTab !== 'workflow') {
    return (
      <div className="min-h-screen bg-black text-white p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-4">
            <MobileDesktopNotice>
              Engineering compute panels use dense tables, diagrams, and exports. Mobile is useful for quick field checks; desktop is recommended for final design review.
            </MobileDesktopNotice>
          </div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <button onClick={() => router.push(`/project/${params.id}`)} className="text-zinc-500 hover:text-zinc-300">← Back</button>
              <h1 className="text-xl font-bold">Engineering Compute</h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => router.push(`/project/${params.id}/engineering?tab=workflow`)}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${activeTab === 'workflow' ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-300'}`}
              >
                Workflow
              </button>
            </div>
          </div>
          
          <div className="flex gap-2 mb-6 border-b border-zinc-800 pb-2">
            {[
              { id: 'curves', label: 'Horizontal Curves' },
              { id: 'chainage', label: 'Chainage' },
              { id: 'tacheometry', label: 'Tacheometry' },
              { id: 'cross_sections', label: 'Cross Sections' },
              { id: 'setting_out', label: 'Setting Out' },
              { id: 'superelevation', label: 'Superelevation' },
              { id: 'volumes', label: 'Volumes' },
              { id: 'network', label: 'Network Adjustment' },
              { id: 'road_reserve', label: 'Road Reserve' },
              { id: 'workflow', label: '← Back to Workflow' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => router.push(`/project/${params.id}/engineering?tab=${tab.id}`)}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium ${
                  activeTab === tab.id 
                    ? 'bg-zinc-800 text-white border-t border-l border-r border-zinc-700' 
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="bg-zinc-900 rounded-xl p-6">
            {activeTab === 'curves' && <HorizontalCurvePanel projectId={params.id} projectData={{ lr_number: project.lr_number, county: project.county, district: project.district, locality: project.locality }} surveyorProfile={surveyorProfile} />}
            {activeTab === 'superelevation' && <SuperelevationPanel projectId={params.id} projectData={{ lr_number: project.lr_number, county: project.county, district: project.district, locality: project.locality }} surveyorProfile={surveyorProfile} />}
            {activeTab === 'volumes' && <VolumesPanel projectId={params.id} projectData={{ lr_number: project.lr_number, county: project.county, district: project.district, locality: project.locality }} surveyorProfile={surveyorProfile} />}
            {activeTab === 'network' && <NetworkAdjustmentPanel projectId={params.id} projectData={project} />}
            {activeTab === 'road_reserve' && <RoadReservePanel
              roadClass={project.engineering_data?.road?.roadClass || 'C'}
              roadLength={undefined}
              existingRoadWidth={project.engineering_data?.road?.crossSectionTemplate?.carriagewayWidth ? project.engineering_data.road.crossSectionTemplate.carriagewayWidth + (project.engineering_data.road.crossSectionTemplate.shoulderWidth ?? 1) * 2 : undefined}
            />}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="border-b border-zinc-800 bg-zinc-950">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <button onClick={() => router.push('/dashboard')} className="text-zinc-500 hover:text-zinc-300 text-sm">← Projects</button>
          <div className="flex-1">
            <h1 className="text-sm font-semibold text-white">{project.name}</h1>
            <div className="text-xs text-zinc-500">Engineering Mode • {mode === 'road' ? 'Road Design' : 'Drainage Survey'}</div>
          </div>
          <span className="text-xs px-2 py-1 bg-amber-500/20 text-amber-400 rounded">{mode === 'road' ? 'Road Design' : 'Drainage Survey'}</span>
          <button
            onClick={handleSaveAll}
            disabled={saving || loadingEngineering}
            className="text-xs px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
          >
            {saving ? 'Saving...' : 'Save All ↓'}
          </button>
          <button
            onClick={() => router.push(`/project/${params.id}/engineering?tab=curves`)}
            className="text-xs px-3 py-1 bg-orange-500/20 text-orange-400 rounded hover:bg-orange-500/30"
          >
            Quick Compute →
          </button>
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-green-900/90 text-green-300 border border-green-700' : 'bg-red-900/90 text-red-300 border border-red-700'
        }`}>
          {toast.type === 'success' ? '✓ ' : '✕ '}{toast.message}
        </div>
      )}

      {/* Saving indicator */}
      {(saving || loadingEngineering) && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-zinc-800 border border-zinc-600 text-zinc-300 px-4 py-2 rounded-lg text-sm flex items-center gap-2 shadow-lg">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          {loadingEngineering ? 'Loading engineering data...' : 'Saving...'}
        </div>
      )}

      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row">
        <nav className="w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-zinc-800">
          <div className="p-4">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Workflow</div>
            <ol className="space-y-1">
              {steps.map((step, idx) => {
                const isActive = step.id === activeStep
                const isLocked = step.status === 'locked'
                return (
                  <li key={step.id}>
                    <button
                      disabled={isLocked}
                      onClick={() => setActiveStep(step.id)}
                      className={`w-full text-left rounded-lg px-3 py-2.5 flex items-start gap-3 ${
                        isActive ? 'bg-zinc-800 border border-zinc-700' :
                        isLocked ? 'opacity-40 cursor-not-allowed' :
                        'hover:bg-zinc-900 border border-transparent'
                      }`}
                    >
                      <span className={`shrink-0 w-6 h-6 rounded-full text-xs flex items-center justify-center mt-0.5 ${
                        step.status === 'complete' ? 'bg-amber-500 text-black' :
                        step.status === 'in_progress' ? 'bg-blue-500 text-white' :
                        step.status === 'locked' ? 'bg-zinc-800 text-zinc-600' :
                        'bg-zinc-700 text-zinc-300'
                      }`}>
                        {step.status === 'complete' ? '✓' : isLocked ? '🔒' : idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className={`text-sm font-medium ${isLocked ? 'text-zinc-600' : isActive ? 'text-white' : 'text-zinc-300'}`}>
                          {step.label}
                        </div>
                        <div className="text-xs text-zinc-600 truncate">{step.description}</div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        </nav>

        <main className="flex-1 min-w-0 p-4 lg:p-8">
          <div className="mb-4">
            <MobileDesktopNotice>
              Engineering workflows are desktop-first because they include alignments, long sections, cross sections, and export review. Use mobile for quick reference only.
            </MobileDesktopNotice>
          </div>
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white">{currentStep?.label}</h2>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
            {renderStepContent(currentStep?.id || 'setup', project, project.engineering_data || null, handleSave, handleModeChange)}
          </div>
        </main>
      </div>
    </div>
  )
}
