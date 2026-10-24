'use client';
import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import UTMZonePicker from '@/components/ui/UTMZonePicker'
import ProjectReferenceSystemPanel from '@/components/project/ProjectReferenceSystemPanel'
import { changedProjectSettings, type ProjectSettingsDraft } from '@/lib/validation/projectSettings'
import { normalizeDatumSelection } from '@/lib/spatial/projectReferenceSystem'

interface ProjectSettingsRow {
  id: string
  name?: string | null
  location?: string | null
  utm_zone?: number | null
  hemisphere?: string | null
  survey_type?: string | null
  road_class?: string | null
  terrain_type?: string | null
  client_name?: string | null
  surveyor_name?: string | null
  datum?: string | null
  traverse?: { linearError?: number | null }
  road_name?: string | null
  start_chainage?: number | null
  folio_number?: string | null
  register_number?: string | null
  lr_number?: string | null
  plot_parcel_number?: string | null
  registration_district?: string | null
  locality?: string | null
}

function readReply(value: unknown): { data?: ProjectSettingsRow; error?: string; success?: boolean } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The server response was not confirmed.')
  const reply = value as Record<string, unknown>
  return {
    data: reply.data as ProjectSettingsRow | undefined,
    error: typeof reply.error === 'string' ? reply.error : undefined,
    success: reply.success === true,
  }
}

export default function ProjectSettingsPage() {
  const params = useParams<{ id: string }>()
  const { id: projectId } = params
  return <ProjectSettingsForm key={projectId} projectId={projectId} />
}

function ProjectSettingsForm({ projectId }: { projectId: string }) {
  const router = useRouter()
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [baseline, setBaseline] = useState<ProjectSettingsDraft | null>(null)
  
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [utmZone, setUtmZone] = useState<number | null>(null)
  const [hemisphere, setHemisphere] = useState<'N' | 'S' | ''>('')
  const [surveyType, setSurveyType] = useState('')
  const [roadClass, setRoadClass] = useState('')
  const [terrainType, setTerrainType] = useState('')
  const [datum, setDatum] = useState('')
  const [clientName, setClientName] = useState('')
  const [surveyorName, setSurveyorName] = useState('')
  const [linearError, setLinearError] = useState('')
  const [roadName, setRoadName] = useState('')
  const [startChainage, setStartChainage] = useState('')
  
  // Form No. 4 / Kenya submission fields
  const [folioNumber, setFolioNumber] = useState('')
  const [registerNumber, setRegisterNumber] = useState('')
  const [lrNumber, setLrNumber] = useState('')
  const [plotParcelNumber, setPlotParcelNumber] = useState('')
  const [registrationDistrict, setRegistrationDistrict] = useState('')
  const [locality, setLocality] = useState('')

  const draft: ProjectSettingsDraft = {
    name, location, survey_type: surveyType, road_class: roadClass, terrain_type: terrainType,
    client_name: clientName, surveyor_name: surveyorName, road_name: roadName,
    start_chainage: startChainage, linear_error_m: linearError, folio_number: folioNumber,
    register_number: registerNumber, lr_number: lrNumber, plot_parcel_number: plotParcelNumber,
    registration_district: registrationDistrict, locality,
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError('')
    async function loadProject() {
      try {
        const response = await fetch(`/api/project/${projectId}`, { cache: 'no-store' })
        const result = readReply(await response.json() as unknown)
        if (!response.ok) throw new Error(result.error || `Project details unavailable (HTTP ${response.status})`)
        const data = result.data as ProjectSettingsRow | undefined
        if (!data || data.id !== projectId || typeof data.name !== 'string') throw new Error('Project details were not confirmed. Retry loading before editing.')
        if (!active) return
        const loaded: ProjectSettingsDraft = {
          name: data.name, location: data.location ?? '', survey_type: data.survey_type ?? '',
          road_class: data.road_class ?? '', terrain_type: data.terrain_type ?? '',
          client_name: data.client_name ?? '', surveyor_name: data.surveyor_name ?? '',
          road_name: data.road_name ?? '', start_chainage: data.start_chainage != null ? String(data.start_chainage) : '',
          linear_error_m: data.traverse?.linearError != null ? String(data.traverse.linearError) : '',
          folio_number: data.folio_number ?? '', register_number: data.register_number ?? '',
          lr_number: data.lr_number ?? '', plot_parcel_number: data.plot_parcel_number ?? '',
          registration_district: data.registration_district ?? '', locality: data.locality ?? '',
        }
        setBaseline(loaded)
        setName(loaded.name); setLocation(loaded.location); setSurveyType(loaded.survey_type)
        setRoadClass(loaded.road_class); setTerrainType(loaded.terrain_type)
        setClientName(loaded.client_name); setSurveyorName(loaded.surveyor_name)
        setRoadName(loaded.road_name); setStartChainage(loaded.start_chainage); setLinearError(loaded.linear_error_m)
        setFolioNumber(loaded.folio_number); setRegisterNumber(loaded.register_number); setLrNumber(loaded.lr_number)
        setPlotParcelNumber(loaded.plot_parcel_number); setRegistrationDistrict(loaded.registration_district); setLocality(loaded.locality)
        setUtmZone(data.utm_zone ?? null)
        setHemisphere(data.hemisphere === 'N' || data.hemisphere === 'S' ? data.hemisphere : '')
        try { setDatum(normalizeDatumSelection(data.datum ?? '')) }
        catch { setDatum(data.datum ?? '') }
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : 'Project details could not be loaded.')
      } finally { if (active) setLoading(false) }
    }
    void loadProject()
    return () => { active = false }
  }, [projectId, loadAttempt])

  const handleSave = async () => {
    if (!baseline || saving) return
    setMessage('')
    try {
      const patch = changedProjectSettings(draft, baseline)
      if (!patch) { setMessage('No project details changed. Use Declare reference system to save reference selections.'); return }
      setSaving(true)
      const response = await fetch(`/api/project/${projectId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      const result = readReply(await response.json() as unknown)
      if (!response.ok) throw new Error(result.error || `Save failed (HTTP ${response.status})`)
      if (result.success !== true || result.data?.id !== projectId) throw new Error('The save was not confirmed. Your entries are retained; reload to review the saved details.')
      setBaseline({ ...draft })
      setMessage('Project details saved. Reference selections are saved separately by Declare reference system.')
    } catch (error) {
      setMessage('Error: ' + (error instanceof Error ? error.message : 'Save failed. Your entries are retained.'))
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (saving || !confirm('Are you sure you want to delete this project? This cannot be undone.')) return
    setSaving(true)
    try {
      const response = await fetch(`/api/project/${projectId}`, { method: 'DELETE' })
      const result = readReply(await response.json() as unknown)
      if (!response.ok || result.success !== true) throw new Error(result.error || 'Project deletion was not confirmed.')
      router.push('/dashboard')
    } catch (error) {
      setMessage('Error: ' + (error instanceof Error ? error.message : 'Project deletion failed.'))
    } finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-amber-500">Loading...</div>
      </div>
    )
  }

  if (loadError) return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Project Settings</h1>
      <p role="alert">{loadError}</p>
      <button onClick={() => setLoadAttempt(attempt => attempt + 1)} className="underline">Retry loading project details</button>
    </div>
  )

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] py-12">
      <div className="max-w-2xl mx-auto px-6">
        <div className="flex items-center gap-4 mb-8">
          <a href={`/project/${projectId}`} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            ← Back to Project
          </a>
        </div>

        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-8">Project Settings</h1>

        {message && (
          <div role="status" className={`p-3 rounded mb-6 ${
            !message.startsWith('Error:') 
              ? 'bg-green-900/30 text-green-400'
              : 'bg-red-900/30 text-red-400'
          }`}>
            {message}
          </div>
        )}

        <fieldset disabled={saving} className="min-w-0 space-y-6">
          <div>
            <label htmlFor="projectName" className="block text-sm text-[var(--text-primary)] mb-2">Project Name</label>
            <input id="projectName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
            />
          </div>

          <div>
            <label htmlFor="location" className="block text-sm text-[var(--text-primary)] mb-2">Location</label>
            <textarea
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] h-24"
            />
          </div>

          <div className="bg-[var(--bg-secondary)] p-4 rounded border border-[var(--border-color)]">
            <div className="block text-sm text-[var(--text-primary)] mb-3">UTM Zone</div>
            <UTMZonePicker
              value={utmZone}
              hemisphere={hemisphere}
              onChange={(zone, hem) => {
                setUtmZone(zone)
                setHemisphere(hem)
              }}
            />
          </div>

          <div>
            <label htmlFor="datum" className="block text-sm text-[var(--text-primary)] mb-2">Datum</label>
            <select
              id="datum"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
            >
              <option value="">Select datum</option>
              {datum && !['ARC1960', 'WGS84', 'WGS84Geographic'].includes(datum) && <option value={datum}>{datum} - saved, unsupported selection</option>}
              <option value="ARC1960">Arc 1960</option>
              <option value="WGS84">WGS 84</option>
              <option value="WGS84Geographic">WGS84 Geographic</option>
            </select>
            <p className="text-xs text-[var(--text-secondary)] mt-1">Select the reference supported by your survey control. These selectors are saved only by Declare reference system below.</p>
          </div>

          <ProjectReferenceSystemPanel
            projectId={projectId}
            datum={datum}
            utmZone={utmZone}
            hemisphere={hemisphere}
          />

          <div>
            <label htmlFor="surveyType" className="block text-sm text-[var(--text-primary)] mb-2">Survey Type</label>
            <select
              id="surveyType"
              value={surveyType}
              onChange={(e) => setSurveyType(e.target.value)}
              className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
            >
              <option value="">Select survey type</option>
              <option value="cadastral">Cadastral Survey</option>
              <option value="engineering">Engineering Survey</option>
              <option value="geodetic">Geodetic / Control Survey</option>
              <option value="drone">Drone / UAV Photogrammetry</option>
              <option value="deformation">Deformation / Monitoring Survey</option>
              <option value="boundary">Boundary Survey</option>
              <option value="topographic">Topographic Survey</option>
              <option value="road">Road Survey</option>
              <option value="construction">Construction Survey</option>
              <option value="control">Control Network</option>
              <option value="leveling">Leveling Survey</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="roadClass" className="block text-sm text-[var(--text-primary)] mb-2">Road Classification (RDM 1.3)</label>
            <select
              id="roadClass"
              value={roadClass}
              onChange={(e) => setRoadClass(e.target.value)}
              className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
            >
              <option value="">Select road class...</option>
              <optgroup label="Rural">
                <option value="S">S — Motorway (100m+ reserve)</option>
                <option value="A">A — Major Arterial / International (60–120m)</option>
                <option value="B">B — Minor Arterial / National Trunk (60–80m)</option>
                <option value="C">C — Major Collector / Inter-District (40–60m)</option>
                <option value="D">D — Minor Collector / Divisional (30–40m)</option>
                <option value="E">E — Major Local / Feeder (25–30m)</option>
                <option value="F">F — Minor Local (20–25m)</option>
                <option value="G">G — Local Access / Farm to Market (15–20m)</option>
              </optgroup>
              <optgroup label="Urban">
                <option value="H">H — Major Arterial / Urban Highway (60–80m)</option>
                <option value="J">J — Minor Arterial (40–60m)</option>
                <option value="K">K — Major Collector (30–40m)</option>
                <option value="L">L — Minor Collector (20–30m)</option>
                <option value="M">M — Major Local / Shopping Street (20–25m)</option>
                <option value="N">N — Minor Local / Non-Residential (15–20m)</option>
                <option value="P">P — Local Access / Residential (10–15m)</option>
              </optgroup>
            </select>
          </div>

          {roadClass && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="roadName" className="block text-sm text-[var(--text-primary)] mb-2">Road Name</label>
                <input
                  id="roadName"
                  type="text"
                  value={roadName}
                  onChange={(e) => setRoadName(e.target.value)}
                  placeholder="e.g. Nairobi–Mombasa Road"
                  className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label htmlFor="startChainage" className="block text-sm text-[var(--text-primary)] mb-2">Start Chainage (m)</label>
                <input
                  id="startChainage"
                  type="number"
                  value={startChainage}
                  onChange={(e) => setStartChainage(e.target.value)}
                  placeholder="e.g. 0 or 5000"
                  className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
                />
                <p className="text-xs text-[var(--text-secondary)] mt-1">km+m format: 5000m = 5+000</p>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="terrainType" className="block text-sm text-[var(--text-primary)] mb-2">Terrain Type</label>
            <select
              id="terrainType"
              value={terrainType}
              onChange={(e) => setTerrainType(e.target.value)}
              className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
            >
              <option value="">Select terrain...</option>
              <option value="flat">Flat</option>
              <option value="rolling">Rolling</option>
              <option value="mountainous">Mountainous</option>
              <option value="escarpment">Escarpment</option>
            </select>
            <p className="text-xs text-[var(--text-secondary)] mt-1">Used for road geometric validation per RDM 1.3</p>
          </div>

          <div>
            <label htmlFor="linearError" className="block text-sm text-[var(--text-primary)] mb-2">Traverse Linear Closure Error (m)</label>
            <input
              id="linearError"
              type="number"
              step="0.001"
              value={linearError}
              onChange={(e) => setLinearError(e.target.value)}
              className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
              placeholder="e.g. 0.001"
            />
            <p className="text-xs text-[var(--text-secondary)] mt-1">Optional recorded closure error. Use Compute and QA to assess the saved observations and actual traverse length.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="clientName" className="block text-sm text-[var(--text-primary)] mb-2">Client Name</label>
              <input id="clientName"
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label htmlFor="surveyorName" className="block text-sm text-[var(--text-primary)] mb-2">Surveyor Name</label>
              <input id="surveyorName"
                type="text"
                value={surveyorName}
                onChange={(e) => setSurveyorName(e.target.value)}
                className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
              />
            </div>
          </div>

          {/* Form No. 4 / Kenya Submission Fields */}
          <div className="border-t border-[var(--border-color)] pt-6 mt-6">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Form No. 4 — Kenya Submission</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">These fields appear on the Survey Plan / Form No. 4 for official submissions.</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="lrNumber" className="block text-sm text-[var(--text-primary)] mb-2">LR Number</label>
                <input
                  id="lrNumber"
                  type="text"
                  value={lrNumber}
                  onChange={(e) => setLrNumber(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
                  placeholder="LR 12345"
                />
              </div>
              <div>
                <label htmlFor="folioNumber" className="block text-sm text-[var(--text-primary)] mb-2">Folio Number</label>
                <input
                  id="folioNumber"
                  type="text"
                  value={folioNumber}
                  onChange={(e) => setFolioNumber(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
                  placeholder="Folio/2024/001"
                />
              </div>
              <div>
                <label htmlFor="registerNumber" className="block text-sm text-[var(--text-primary)] mb-2">Register Number</label>
                <input
                  id="registerNumber"
                  type="text"
                  value={registerNumber}
                  onChange={(e) => setRegisterNumber(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
                  placeholder="REG/001"
                />
              </div>
              <div>
                <label htmlFor="plotParcelNumber" className="block text-sm text-[var(--text-primary)] mb-2">Plot/Parcel Number</label>
                <input
                  id="plotParcelNumber"
                  type="text"
                  value={plotParcelNumber}
                  onChange={(e) => setPlotParcelNumber(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
                  placeholder="Plot 45"
                />
              </div>
              <div>
                <label htmlFor="registrationDistrict" className="block text-sm text-[var(--text-primary)] mb-2">Registration District</label>
                <input
                  id="registrationDistrict"
                  type="text"
                  value={registrationDistrict}
                  onChange={(e) => setRegistrationDistrict(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
                  placeholder="Nairobi"
                />
              </div>
              <div>
                <label htmlFor="locality" className="block text-sm text-[var(--text-primary)] mb-2">Locality</label>
                <input
                  id="locality"
                  type="text"
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
                  placeholder="Karen"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 pt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-amber-500 text-black font-bold rounded hover:bg-amber-400 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save project details'}
            </button>
            <button
              onClick={handleDelete}
              disabled={saving}
              className="px-6 py-3 border border-red-500 text-red-500 font-bold rounded hover:bg-red-500/10"
            >
              Delete Project
            </button>
          </div>
        </fieldset>
      </div>
    </div>
  )
}
