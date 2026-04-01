'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { EngineeringData, EngineeringMode, EngineeringStandard, RoadDesignData, StationData, IntersectionPoint, VerticalIP, CrossSectionTemplate, StepStatus } from '@/types/engineering'
import { KRDM2017, KeRRA, getDesignSpeedRange, getCarriagewayWidth, getShoulderWidth } from '@/lib/standards/engineering'

type EngineeringStepId = 'setup' | 'horizontal' | 'vertical' | 'cross_section' | 'stations' | 'outputs' | 'export'

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
  engineering_data?: EngineeringData | null
}

const ROAD_CLASSES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const

function getEngineeringSteps(data: EngineeringData | null): EngineeringStep[] {
  const mode = data?.mode
  const rd = data?.road

  const steps: EngineeringStep[] = [
    { 
      id: 'setup', 
      label: 'Project Setup', 
      description: 'Road name, design speed, class, standard', 
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
  }

  return steps
}

function Step1Setup({ 
  project, 
  data, 
  onSave 
}: { 
  project: EngineeringProject
  data: RoadDesignData | null
  onSave: (data: Partial<RoadDesignData>) => void
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
  }, [roadClass, standard])

  const handleSave = () => {
    onSave({
      roadName,
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
            {ROAD_CLASSES.map(c => (
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

function renderStepContent(
  stepId: EngineeringStepId,
  project: EngineeringProject,
  engineeringData: EngineeringData | null,
  onSave: (data: Partial<EngineeringData>) => void
) {
  const roadData = engineeringData?.road || null

  switch (stepId) {
    case 'setup':
      return (
        <Step1Setup
          project={project}
          data={roadData}
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
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Cross Section Template</h3>
            <p className="text-zinc-400 text-sm">Define standard cross section parameters.</p>
          </div>
          <div className="p-8 text-center text-zinc-500 border border-zinc-700 rounded-lg">
            Cross Section Template editor coming in next iteration
          </div>
        </div>
      )
    case 'stations':
      return (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Stations & Levels</h3>
            <p className="text-zinc-400 text-sm">Enter ground levels at chainage intervals.</p>
          </div>
          <div className="p-8 text-center text-zinc-500 border border-zinc-700 rounded-lg">
            Stations editor coming in next iteration
          </div>
        </div>
      )
    case 'outputs':
      return (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Computed Outputs</h3>
            <p className="text-zinc-400 text-sm">Generated reports and calculations.</p>
          </div>
          <div className="p-8 text-center text-zinc-500 border border-zinc-700 rounded-lg">
            Computed outputs coming in next iteration
          </div>
        </div>
      )
    case 'export':
      return (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Export Package</h3>
            <p className="text-zinc-400 text-sm">Generate PDF reports, long section, peg book.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {['Horizontal Alignment Report', 'Vertical Alignment Report', 'Earthworks Summary', 'Long Section PDF'].map(fmt => (
              <button key={fmt} className="py-3 rounded-lg border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800">
                ↓ {fmt}
              </button>
            ))}
          </div>
        </div>
      )
    default:
      return <div>Unknown step</div>
  }
}

export default function EngineeringWorkspacePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [project, setProject] = useState<EngineeringProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeStep, setActiveStep] = useState<EngineeringStepId>('setup')
  const [saving, setSaving] = useState(false)

  const fetchProject = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
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
    setLoading(false)
  }, [params.id, supabase])

  useEffect(() => {
    fetchProject()
  }, [fetchProject])

  const handleSave = async (data: Partial<EngineeringData>) => {
    if (!project) return
    setSaving(true)

    const current = project.engineering_data || { mode: 'road' as EngineeringMode, standard: 'KRDM2017' as EngineeringStandard }
    const updated: EngineeringData = {
      ...current,
      mode: 'road',
      standard: current.standard || 'KRDM2017',
      road: { ...current.road, ...data } as RoadDesignData
    }

    await supabase
      .from('projects')
      .update({ engineering_data: updated })
      .eq('id', project.id)

    setProject({ ...project, engineering_data: updated })
    setSaving(false)
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
  const currentStep = steps.find(s => s.id === activeStep) || steps[0]

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="border-b border-zinc-800 bg-zinc-950">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <button onClick={() => router.push('/dashboard')} className="text-zinc-500 hover:text-zinc-300 text-sm">← Projects</button>
          <div className="flex-1">
            <h1 className="text-sm font-semibold text-white">{project.name}</h1>
            <div className="text-xs text-zinc-500">Engineering Mode • Road Design</div>
          </div>
          <span className="text-xs px-2 py-1 bg-amber-500/20 text-amber-400 rounded">Road Design</span>
        </div>
      </div>

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
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white">{currentStep?.label}</h2>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
            {renderStepContent(currentStep?.id || 'setup', project, project.engineering_data || null, handleSave)}
          </div>
        </main>
      </div>
    </div>
  )
}