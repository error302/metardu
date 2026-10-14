'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { fieldPointEntry, fieldPointNumber, parseFieldPointCsv, type FieldPointEntry } from '@/lib/field/pointEntry'
import { createClient } from '@/lib/api-client/client'
import dynamic from 'next/dynamic'
// ponytail: lazy-load instrument connection panel (heavy component with Web Serial API)
const InstrumentConnectionPanel = dynamic(() => import('@/components/InstrumentConnectionPanel').then(m => ({ default: m.InstrumentConnectionPanel })), {
  ssr: false,
  loading: () => <div className='text-xs text-gray-500'>Loading instrument panel...</div>,
})
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import {
  MapPin,
  RefreshCw,
  Scale,
  Radio,
  X,
  Plus,
  CheckCircle2,
  Upload,
  LucideIcon,
} from 'lucide-react'
import { FieldBookMobile } from '@/components/fieldbook/FieldBookMobile'

type Tab = 'points' | 'traverse' | 'leveling' | 'radiation' | 'offline' | 'map'
type SyncStatus = 'idle' | 'saving' | 'saved' | 'failed'



interface FieldProject { id: string; name: string; survey_type?: string }
interface FieldPoint { id?: string; name: string; easting: number | null; northing: number | null; is_control?: boolean }
interface BatchResult extends FieldPointEntry { description?: string }
interface FieldTraverseLeg { id: string; fromStation: string; toStation: string; distance: number; bearing: { deg: number; min: number; sec: number } }
interface LevelReading { id: string; station: string; bs?: number; is?: number; fs?: number }
interface RadiationPoint { id: string; pointName: string; bearing: { deg: string; min: string; sec: string }; distance: number }

function storedCoordinate(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  try { return fieldPointNumber(String(value), 'Coordinate') } catch { return null }
}

export default function FieldPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const accountId = session?.user?.id
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?next=%2Ffield')
  }, [status, router])
  if (status !== 'authenticated' || !accountId) return <div role="status" className="p-6">Loading field workspace...</div>
  // Account changes destroy the previous account's private in-memory workspace.
  return <FieldAccountWorkspace key={accountId} user={{ id: accountId }} />
}

function FieldAccountWorkspace({ user }: { user: { id: string } }) {
  const router = useRouter()
  const { t } = useLanguage()
  const [msg, setMsg] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('traverse')
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const mounted = useRef(false)
  const pointsRequest = useRef(0)
  const instrumentGeneration = useRef(0)
  const instrumentScope = instrumentGeneration.current
  const [projects, setProjects] = useState<FieldProject[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  
  // Points state
  const [points, setPoints] = useState<FieldPoint[]>([])
  const [showBatch, setShowBatch] = useState(false)
  const [batchCSV, setBatchCSV] = useState('')
  const [batchParseResults, setBatchParseResults] = useState<BatchResult[]>([])
  const [batchErrors, setBatchErrors] = useState<string[]>([])

  // Single point form
  const [pName, setPName] = useState('')
  const [pE, setPE] = useState('')
  const [pN, setPN] = useState('')
  const [pZ, setPZ] = useState('')
  const [pCtrl, setPCtrl] = useState(false)

  // Traverse state
  const [tStation, setTStation] = useState('')
  const [tDist, setTDist] = useState('')
  const [tDeg, setTDeg] = useState('')
  const [tMin, setTMin] = useState('')
  const [tSec, setTSec] = useState('')
  const [tLegs, setTLegs] = useState<FieldTraverseLeg[]>([])


  // Leveling state
  const [lStation, setLStation] = useState('')
  const [lReading, setLReading] = useState('')
  const [lType, setLType] = useState<'BS' | 'IS' | 'FS'>('BS')
  const [lReadings, setLReadings] = useState<LevelReading[]>([])

  // Radiation state
  const [rStation, setRStation] = useState('')
  const [rInstH, setRInstH] = useState('1.500')
  const [rPoints, setRPoints] = useState<RadiationPoint[]>([])
  const [rNewName, setRNewName] = useState('')
  const [rBearingDeg, setRBearingDeg] = useState('')
  const [rBearingMin, setRBearingMin] = useState('')
  const [rBearingSec, setRBearingSec] = useState('')
  const [rDist, setRDist] = useState('')

  const captureDraft = () => ({
    pName, pE, pN, pZ, pCtrl, showBatch, batchCSV, batchParseResults, batchErrors,
    tStation, tDist, tDeg, tMin, tSec, tLegs,
    lStation, lReading, lType, lReadings,
    rStation, rInstH, rPoints, rNewName, rBearingDeg, rBearingMin, rBearingSec, rDist,
  })
  const emptyDraft = useRef(captureDraft())
  const projectDrafts = useRef(new Map<string, ReturnType<typeof captureDraft>>())
  const changeProject = (projectId: string) => {
    if (savingRef.current || projectId === selectedProject) return
    if (projectId && !projects.some(project => project.id === projectId)) return
    projectDrafts.current.set(selectedProject, captureDraft())
    const draft = projectDrafts.current.get(projectId) ?? emptyDraft.current
    setPName(draft.pName); setPE(draft.pE); setPN(draft.pN); setPZ(draft.pZ); setPCtrl(draft.pCtrl)
    setShowBatch(draft.showBatch); setBatchCSV(draft.batchCSV); setBatchParseResults(draft.batchParseResults); setBatchErrors(draft.batchErrors)
    setTStation(draft.tStation); setTDist(draft.tDist); setTDeg(draft.tDeg); setTMin(draft.tMin); setTSec(draft.tSec); setTLegs(draft.tLegs)
    setLStation(draft.lStation); setLReading(draft.lReading); setLType(draft.lType); setLReadings(draft.lReadings)
    setRStation(draft.rStation); setRInstH(draft.rInstH); setRPoints(draft.rPoints); setRNewName(draft.rNewName)
    setRBearingDeg(draft.rBearingDeg); setRBearingMin(draft.rBearingMin); setRBearingSec(draft.rBearingSec); setRDist(draft.rDist)
    pointsRequest.current++
    instrumentGeneration.current++
    setPoints([]); setMsg(null); setSyncStatus('idle')
    setSelectedProject(projectId)
  }

  // AUDIT FIX (H-007, 2026-07-27): useMemo prevents infinite loop.
  const dbClient = useMemo(() => createClient(), [])

  const fetchProjects = useCallback(async (userId: string) => {
    const { data, error } = (await dbClient
      .from('projects')
      .select('id, name, survey_type')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })) as { data: FieldProject[] | null; error: unknown }
    if (!mounted.current) return
    if (error) { setMsg('Unable to load projects.'); return }
    if (data) setProjects(data)
  }, [dbClient])

  const fetchProjectPoints = useCallback(async (projectId: string) => {
    const request = ++pointsRequest.current
    if (!projectId) return
    try {
      const { data, error } = (await dbClient
      .from('survey_points')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })) as { data: FieldPoint[] | null; error: unknown }
      if (!mounted.current || request !== pointsRequest.current) return
      if (error) { setMsg('Unable to load project points.'); return }
      if (data) setPoints(data.map(point => ({ ...point, name: (point as FieldPoint & { point_name?: string }).point_name ?? point.name, easting: storedCoordinate(point.easting), northing: storedCoordinate(point.northing) })))
    } catch {
      if (mounted.current && request === pointsRequest.current) setMsg('Unable to load project points.')
    }
  }, [dbClient])

  // Ignore responses after account unmount and invalidate old project reads.
  useEffect(() => {
    const requests = pointsRequest
    mounted.current = true
    void fetchProjects(user.id).catch(() => { if (mounted.current) setMsg('Unable to load projects.') })
    return () => { mounted.current = false; requests.current++ }
  }, [user.id, fetchProjects])

  useEffect(() => {
    const requests = pointsRequest
    setPoints([])
    void fetchProjectPoints(selectedProject)
    return () => { requests.current++ }
  }, [selectedProject, fetchProjectPoints])

  // Point batch parser
  const parseBatchCSV = () => {
    try { setBatchParseResults(parseFieldPointCsv(batchCSV)); setBatchErrors([]) }
    catch (error) { setBatchParseResults([]); setBatchErrors([error instanceof Error ? error.message : String(error)]) }
  }

  const saveBatchPoints = async () => {
    if (!selectedProject || batchParseResults.length === 0 || batchErrors.length || savingRef.current) return
    savingRef.current = true; setSaving(true); setSyncStatus('saving'); setMsg(null)

    try {
      if (batchParseResults.length > 1000) throw new Error('Save at most 1000 points per batch.')
      const names = new Set<string>()
      const validated = batchParseResults.map(point => {
        const entry = fieldPointEntry(point.name, String(point.easting), String(point.northing), point.elevation === null ? '' : String(point.elevation), point.is_control)
        if (names.has(entry.name)) throw new Error(`Duplicate point name: ${entry.name}`)
        names.add(entry.name)
        return { ...entry, description: point.description }
      })
      // T1.5d FIX (2026-07-10): Map 'name' to 'point_name' (the actual DB column).
      // The local type uses 'name' for convenience, but the DB column is 'point_name'.
      const { error } = await dbClient.from('survey_points').insert(
        validated.map((p) => ({
          project_id: selectedProject,
          point_name: p.name,  // T1.5d: was 'name' (column doesn't exist)
          easting: p.easting,
          northing: p.northing,
          elevation: p.elevation,
          is_control: p.is_control ?? false,
          ...(p.description ? { description: p.description } : {}),
        }))
      )
      if (error) throw new Error(error.message)
      if (!mounted.current) return
      setBatchCSV('')
      setBatchParseResults([])
      setBatchErrors([])
      setShowBatch(false)
      fetchProjectPoints(selectedProject)
      setMsg(` Saved ${batchParseResults.length} points successfully`)
      setSyncStatus('saved')
    } catch (e: unknown) {
      if (!mounted.current) return
      setMsg('Error: ' + (e instanceof Error ? (e as Error).message : String(e)))
      setSyncStatus('failed')
    } finally {
      savingRef.current = false
      if (mounted.current) setSaving(false)
    }
  }

  // Single point save
  const savePoint = async () => {
    if (!selectedProject || savingRef.current) return
    savingRef.current = true; setSaving(true); setSyncStatus('saving'); setMsg(null)

    try {
      const point = fieldPointEntry(pName, pE, pN, pZ, pCtrl)
      const { error } = await dbClient.from('survey_points').insert({
        point_name: point.name,
        easting: point.easting,
        northing: point.northing,
        elevation: point.elevation,
        is_control: point.is_control,
        project_id: selectedProject
      })
      if (error) throw new Error(error.message)
      if (!mounted.current) return
      setPName('')
      setPE('')
      setPN('')
      setPZ('')
      setPCtrl(false)
      fetchProjectPoints(selectedProject)
      setSyncStatus('saved'); setMsg('Point saved to project.')
    } catch (e) {
      if (!mounted.current) return
      setMsg('Error: ' + (e instanceof Error ? e.message : String(e)))
      setSyncStatus('failed')
    } finally {
      savingRef.current = false
      if (mounted.current) setSaving(false)
    }
  }

  // Traverse
  const addTraverseLeg = () => {
    if (!tStation || !tDist || !tDeg) return
    const toStation = tStation
    const fromStation = tLegs.length > 0 ? tLegs[tLegs.length - 1].toStation : 'A'
    const bearing = {
      deg: parseInt(tDeg) || 0,
      min: parseInt(tMin) || 0,
      sec: parseFloat(tSec) || 0
    }

    setTLegs([...tLegs, {
      id: Date.now().toString(),
      fromStation,
      toStation,
      distance: parseFloat(tDist),
      bearing
    }])

    setTStation('')
    setTDist('')
    setTDeg('')
    setTMin('')
    setTSec('')
  }

  const traverseTotal = tLegs.reduce((sum, l) => sum + l.distance, 0)

  const renderTabButton = (tab: Tab, Icon: LucideIcon, label: string) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex-1 py-2 text-xs font-medium flex flex-col items-center gap-1 ${
        activeTab === tab ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
    </button>
  )

  const renderOfflineTabButton = (tab: Tab, Icon: LucideIcon, label: string) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex-1 py-2 text-xs font-medium flex flex-col items-center gap-1 ${
        activeTab === tab ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-[10px]">{label}</span>
    </button>
  )

  const inputClass = "w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
  const inputNumberClass = `${inputClass} font-mono text-right`

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-bold text-[var(--text-primary)]">{t('field.fieldMode')}</h1>
            <select
              aria-label="Field project"
              disabled={saving}
              value={selectedProject}
              onChange={(e) => changeProject(e.target.value)}
              className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs text-[var(--text-primary)] w-36"
            >
              <option value="">Select Project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2" title={saving ? 'Saving points' : 'Point saves only; measurement drafts are not synced'}>
            {syncStatus === 'saved' && <CheckCircle2 className="w-4 h-4 text-green-400" />}
            {syncStatus === 'saving' && <RefreshCw className="w-4 h-4 text-yellow-400 animate-spin" />}
            {syncStatus === 'failed' && <X className="w-4 h-4 text-[var(--text-muted)]" />}
            <span className="text-[10px] text-[var(--text-secondary)]">{syncStatus === 'saving' ? 'Saving points' : syncStatus === 'saved' ? 'Last point save recorded' : syncStatus === 'failed' ? 'Point save failed' : 'Point drafts'}</span>
          </div>
        </div>
      </header>
      {/* Instrument Connection Panel */}
      <div className="p-3 border-b border-[var(--border-color)]">
        <InstrumentConnectionPanel key={selectedProject} onImportPoints={(points) => {
          if (!mounted.current || savingRef.current || instrumentScope !== instrumentGeneration.current) return
          try {
            const imported: BatchResult[] = points.map(point => ({
              ...fieldPointEntry(point.pointName, String(point.easting ?? ''), String(point.northing ?? ''), point.elevation === null || point.elevation === undefined ? '' : String(point.elevation)),
              description: `INSTRUMENT_READING_JSON=${JSON.stringify(point)}`,
            }))
            setBatchParseResults(prev => [...prev, ...imported])
            setShowBatch(true); setBatchErrors([])
          } catch (error) {
            setMsg('Instrument import: ' + (error instanceof Error ? error.message : String(error)))
          }
        }} />
      </div>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-3 pb-20">
        {msg && <p role="status" className="mb-3 text-sm text-[var(--text-primary)]">{msg}</p>}
        <div className="mb-3 rounded-lg border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-secondary)_20%,transparent)] p-3">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Workflow</div>
          <div className="text-sm text-[var(--text-primary)] mt-1">Field Mode = quick capture (phone/tablet). Field Book = textbook tables + checks + exports.</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => router.push('/fieldbook')}
              className="text-[10px] bg-[var(--bg-tertiary)] hover:bg-[var(--border-hover)] text-[var(--text-primary)] px-2 py-1.5 rounded"
            >
              Open Field Book
            </button>
            <button
              onClick={() => router.push('/field/gnss')}
              className="text-[10px] bg-[var(--bg-tertiary)] hover:bg-[var(--border-hover)] text-[var(--text-primary)] px-2 py-1.5 rounded"
            >
              GNSS Receiver
            </button>
            <button
              onClick={() => router.push('/guide')}
              className="text-[10px] bg-[var(--bg-tertiary)] hover:bg-[var(--border-hover)] text-[var(--text-primary)] px-2 py-1.5 rounded"
            >
              Field Guides
            </button>
            <button
              onClick={() => setActiveTab('map')}
              className="text-[10px] bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-black px-2 py-1.5 rounded"
            >
              GPS Map & Collection
            </button>
          </div>
        </div>

        {activeTab === 'points' && (
          <fieldset disabled={saving} className="space-y-3">
            {/* Quick batch entry button */}
            <p className="text-xs text-[var(--text-secondary)]">Raw point entry: confirm the project grid, coordinate units and height reference before saving. This page does not transform coordinates. Drafts stay in memory for this account and job until this page closes.</p>
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-semibold text-white uppercase tracking-wide">{t('field.points')}</h2>
              <button
                onClick={() => setShowBatch(!showBatch)}
                className="text-[10px] bg-[var(--bg-tertiary)] hover:bg-[var(--border-hover)] text-[var(--text-primary)] px-2 py-1 rounded flex items-center gap-1"
              >
                {showBatch ? t('common.close') : <><Plus className="w-3 h-3" /> {t('field.batchCSV')}</>}
              </button>
            </div>

            {/* Batch CSV input */}
            {showBatch && (
              <div className="bg-[color-mix(in_srgb,var(--bg-secondary)_50%,transparent)] border border-[var(--border-color)] rounded p-3 space-y-2">
                <div>
                  <label htmlFor="field-batch-csv" className="text-[10px] text-[var(--text-muted)]">CSV: Name, Easting, Northing, Elevation (optional)</label>
                  <textarea
                    id="field-batch-csv"
                    value={batchCSV}
                    onChange={(e) => { setBatchCSV(e.target.value); setBatchParseResults([]); setBatchErrors([]) }}
                    placeholder="PT1,500000,4500000,100&#10;PT2,500100,4500100,101"
                    className={`${inputClass} h-20 text-xs font-mono mt-1`}
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={parseBatchCSV} className="flex-1 text-[10px] bg-[var(--bg-tertiary)] hover:bg-[var(--border-hover)] text-[var(--text-primary)] py-1.5 rounded">
                    {t('field.parse')}
                  </button>
                  <button onClick={saveBatchPoints} disabled={!selectedProject || batchErrors.length > 0 || batchParseResults.length === 0 || saving} className="flex-1 text-[10px] bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-black py-1.5 rounded disabled:opacity-50">
                    {t('common.save')} {batchParseResults.length}
                  </button>
                </div>
                {batchErrors.length > 0 && (
                  <div className="text-[10px] text-red-400">
                    {batchErrors.map((e, i) => <div key={`${e}-${i}`}>{e}</div>)}
                  </div>
                )}
                {batchParseResults.length > 0 && (
                  <div className="text-[10px] text-green-400">
                    Parsed {batchParseResults.length} ready
                  </div>
                )}
              </div>
            )}

            {/* Single point form */}
            <div className="grid grid-cols-2 gap-2">
              <div>
<label htmlFor="field-point-name" className="text-[10px] text-[var(--text-muted)] mb-1 block">{t('field.name')}</label>
              <input id="field-point-name" value={pName} onChange={e => setPName(e.target.value)} placeholder="P1" className={inputNumberClass} />
            </div>
            <div>
              <label htmlFor="field-point-easting" className="text-[10px] text-[var(--text-muted)] mb-1 block">{t('common.easting')}</label>
              <input id="field-point-easting" value={pE} onChange={e => setPE(e.target.value)} placeholder="500000" inputMode="decimal" className={inputNumberClass} />
            </div>
            <div>
              <label htmlFor="field-point-northing" className="text-[10px] text-[var(--text-muted)] mb-1 block">{t('common.northing')}</label>
              <input id="field-point-northing" value={pN} onChange={e => setPN(e.target.value)} placeholder="4500000" inputMode="decimal" className={inputNumberClass} />
            </div>
            <div>
              <label htmlFor="field-point-elevation" className="text-[10px] text-[var(--text-muted)] mb-1 block">{t('common.elevation')}</label>
              <input id="field-point-elevation" value={pZ} onChange={e => setPZ(e.target.value)} placeholder="0" inputMode="decimal" className={inputNumberClass} />
            </div>
          </div>

          <div className="flex items-center justify-between py-2 px-3 bg-[color-mix(in_srgb,var(--bg-secondary)_50%,transparent)] rounded border border-[var(--border-color)]">
            <label className="text-[10px] text-[var(--text-secondary)]">{t('field.controlPoint')}</label>
              <button
                onClick={() => setPCtrl(!pCtrl)}
                className={`w-8 h-4 rounded-full relative ${pCtrl ? 'bg-[var(--accent)]' : 'bg-gray-600'}`}
              >
                <div className={`absolute top-0.5 w-3.5 h-3.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded transition-transform ${pCtrl ? 'left-4' : 'left-0.5'}`} />
              </button>
            </div>

            <button
              onClick={savePoint}
              disabled={!pName || !pE || !pN || !selectedProject}
              className="w-full py-2 bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-black text-xs font-semibold rounded disabled:opacity-50"
            >
              {t('field.savePoint')}
            </button>

            {points.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] text-[var(--text-muted)]">Recent:</div>
                {points.slice(0, 5).map((p) => (
                  <div key={p.id} className="bg-[color-mix(in_srgb,var(--bg-secondary)_50%,transparent)] rounded px-2 py-1.5 flex justify-between items-center text-[10px]">
                    <span className="text-[var(--text-primary)]">{p.name}</span>
                    <span className="text-[var(--text-muted)] font-mono">{p.easting === null || p.northing === null ? 'Coordinates not recorded' : `${p.easting.toFixed(0)}, ${p.northing.toFixed(0)}`}</span>
                  </div>
                ))}
              </div>
            )}
          </fieldset>
        )}

        {activeTab === 'traverse' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-semibold text-white uppercase tracking-wide">{t('field.traverse')}</h2>
              <span className="text-[10px] text-[var(--text-muted)]">{t('field.total')}: {traverseTotal.toFixed(2)} m</span>
            </div>

            <p className="text-xs text-[var(--text-secondary)]">Closure not assessed here. Quick bearing entries do not contain measured faces, vertical angles, reductions or an independently identified closing control. Use Field Book to record the full observation and control setup.</p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="traverse-station" className="text-[10px] text-[var(--text-muted)] mb-1 block">{t('field.traverse')} →</label>
                <input id="traverse-station" value={tStation} onChange={e => setTStation(e.target.value)} placeholder="B" className={inputClass} />
              </div>
              <div>
                <label htmlFor="traverse-distance" className="text-[10px] text-[var(--text-muted)] mb-1 block">{t('field.distance')}</label>
                <input id="traverse-distance" value={tDist} onChange={e => setTDist(e.target.value)} placeholder="100.00" inputMode="decimal" className={inputNumberClass} />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-[var(--text-muted)] mb-1 block">{t('field.bearing')} (DMS)</label>
              <div className="grid grid-cols-3 gap-1.5">
                <input 
                  value={tDeg} 
                  onChange={e => setTDeg(e.target.value)} 
                  aria-label="Bearing degrees" placeholder="000" 
                  className={`${inputClass} text-center text-sm`} 
                />
                <input 
                  value={tMin} 
                  onChange={e => setTMin(e.target.value)} 
                  aria-label="Bearing minutes" placeholder="00" 
                  className={`${inputClass} text-center text-sm`} 
                />
                <input 
                  value={tSec} 
                  onChange={e => setTSec(e.target.value)} 
                  aria-label="Bearing seconds" placeholder="00.0" 
                  className={`${inputClass} text-center font-mono text-sm`} 
                />
              </div>
            </div>

            <button onClick={addTraverseLeg} className="w-full py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-hover)] text-[var(--text-primary)] text-xs font-medium rounded">
              + {t('field.addLeg')}
            </button>

            {tLegs.length > 0 && (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {tLegs.map((leg, i) => (
                  <div key={leg.id} className="bg-[color-mix(in_srgb,var(--bg-secondary)_50%,transparent)] rounded px-2 py-1.5 flex justify-between items-center text-[10px]">
                    <span className="text-[var(--text-secondary)]">#{i + 1} {leg.fromStation} → {leg.toStation}</span>
                    <span className="text-[var(--text-primary)] font-mono">{leg.distance.toFixed(1)}m {leg.bearing.deg}°{leg.bearing.min}'{leg.bearing.sec.toFixed(0)}"</span>
                  </div>
                ))}
                <div className="text-[10px] text-[var(--accent)] text-right pt-1 border-t border-[var(--border-color)] font-mono">
                  TOTAL: {traverseTotal.toFixed(2)} m
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'leveling' && (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Leveling</h2>
            
            <div>
              <label htmlFor="level-station" className="text-[10px] text-[var(--text-muted)] mb-1 block">Station</label>
              <input id="level-station" value={lStation} onChange={e => setLStation(e.target.value)} placeholder="TP1" className={inputClass} />
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {(['BS', 'IS', 'FS'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setLType(type)}
                  className={`py-2 text-xs font-medium rounded ${
                    lType === type ? 'bg-[var(--accent)] text-black' : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {lType && (
              <div className="space-y-2">
                <input
                  value={lReading}
                  onChange={e => setLReading(e.target.value)}
                  aria-label="Level staff reading" placeholder="Reading"
                  className={inputNumberClass}
                />
                <button onClick={() => {
                  if (!lStation || !lReading) return
                  const existing = lReadings.find((r) => r.station === lStation)
                  if (existing) {
                    setLReadings(lReadings.map((r) => 
                      r.id === existing.id ? { ...r, [lType.toLowerCase()]: parseFloat(lReading) } : r
                    ))
                  } else {
                    setLReadings([...lReadings, {
                      id: Date.now().toString(),
                      station: lStation,
                      [lType.toLowerCase()]: parseFloat(lReading)
                    }])
                  }
                  setLReading('')
                  setLStation('')
                }} className="w-full py-2 bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-black text-xs rounded">
                  Add {lType}
                </button>
              </div>
            )}

            {lReadings.length > 0 && (
              <div className="bg-[color-mix(in_srgb,var(--bg-secondary)_50%,transparent)] rounded overflow-x-auto text-[10px]">
                <table className="w-full min-w-[240px]">
                  <thead className="bg-[var(--bg-tertiary)]">
                    <tr>
                      <th className="px-2 py-1 text-left text-[var(--text-secondary)]">Stn</th>
                      <th className="px-2 py-1 text-right text-[var(--text-secondary)]">BS</th>
                      <th className="px-2 py-1 text-right text-[var(--text-secondary)]">IS</th>
                      <th className="px-2 py-1 text-right text-[var(--text-secondary)]">FS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lReadings.map((r) => (
                      <tr key={r.id} className="border-t border-[var(--border-color)]">
                        <td className="px-2 py-1 text-[var(--text-primary)]">{r.station}</td>
                        <td className="px-2 py-1 text-right font-mono text-[var(--text-primary)]">{r.bs?.toFixed(3) || ''}</td>
                        <td className="px-2 py-1 text-right font-mono text-[var(--text-primary)]">{r.is?.toFixed(3) || ''}</td>
                        <td className="px-2 py-1 text-right font-mono text-[var(--text-primary)]">{r.fs?.toFixed(3) || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'radiation' && (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Radiation</h2>
            
            <div>
              <label htmlFor="rad-station" className="text-[10px] text-[var(--text-muted)] mb-1 block">Instrument Station</label>
              <select id="rad-station" value={rStation} onChange={e => setRStation(e.target.value)} className={inputClass}>
                <option value="">Select...</option>
                {points.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="rad-inst-height" className="text-[10px] text-[var(--text-muted)] mb-1 block">Instrument Height (m)</label>
              <input id="rad-inst-height" value={rInstH} onChange={e => setRInstH(e.target.value)} placeholder="1.500" inputMode="decimal" className={inputNumberClass} />
            </div>

            <div className="border-t border-[var(--border-color)] pt-3 mt-3">
              <label htmlFor="rad-point-name" className="text-[10px] text-[var(--text-muted)] mb-1 block">Point Name</label>
              <input id="rad-point-name" value={rNewName} onChange={e => setRNewName(e.target.value)} placeholder="P1" className={inputClass} />

              <div className="text-[10px] text-[var(--text-muted)] mb-1 block mt-2">Bearing</div>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                <input value={rBearingDeg} onChange={e => setRBearingDeg(e.target.value)} aria-label="Bearing degrees" placeholder="000" inputMode="numeric" className={`${inputClass} text-center text-sm`} />
                <input value={rBearingMin} onChange={e => setRBearingMin(e.target.value)} aria-label="Bearing minutes" placeholder="00" inputMode="numeric" className={`${inputClass} text-center text-sm`} />
                <input value={rBearingSec} onChange={e => setRBearingSec(e.target.value)} aria-label="Bearing seconds" placeholder="00.0" inputMode="decimal" className={`${inputClass} text-center font-mono text-sm`} />
              </div>

              <label htmlFor="rad-distance" className="text-[10px] text-[var(--text-muted)] mb-1 block">Distance (m)</label>
              <input id="rad-distance" value={rDist} onChange={e => setRDist(e.target.value)} placeholder="50.00" className={inputNumberClass} />

              <button
                onClick={() => {
                  if (!rNewName || !rDist || !rBearingDeg) return
                  setRPoints([...rPoints, {
                    id: Date.now().toString(),
                    pointName: rNewName,
                    bearing: { deg: rBearingDeg, min: rBearingMin, sec: rBearingSec },
                    distance: parseFloat(rDist)
                  }])
                  setRNewName('')
                  setRBearingDeg('')
                  setRBearingMin('')
                  setRBearingSec('')
                  setRDist('')
                }}
                className="w-full mt-2 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-hover)] text-[var(--text-primary)] text-xs rounded"
              >
                + Add Point
              </button>
            </div>

            {rPoints.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {rPoints.map((p) => (
                  <div key={p.id} className="bg-[color-mix(in_srgb,var(--bg-secondary)_50%,transparent)] rounded px-2 py-1.5 flex justify-between items-center text-[10px]">
                    <span className="text-[var(--text-primary)]">{p.pointName}</span>
                    <span className="text-[var(--text-muted)] font-mono">
                      {p.bearing.deg}°{p.bearing.min}'{p.bearing.sec}"
                      <br />{p.distance.toFixed(1)}m
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'offline' && selectedProject && (
          <FieldBookMobile
            projectId={selectedProject}
            surveyType={projects.find(p => p.id === selectedProject)?.survey_type || 'General'}
            surveyorId={user?.id || ''}
          />
        )}

        {activeTab === 'offline' && !selectedProject && (
          <div className="flex flex-col items-center justify-center h-64 text-[var(--text-muted)]">
            <p className="text-sm">Select a project first to use offline field book</p>
          </div>
        )}

        {activeTab === 'map' && (
          <div className="space-y-3 h-full flex flex-col">
            <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Field survey workflows</h2>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => router.push('/field/map')} className="w-full py-3 bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded text-xs font-bold text-center">Offline Maps</button>
              <button onClick={() => router.push('/field/collect')} className="w-full py-3 bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded text-xs font-bold text-center">Collect Beacons</button>
              <button onClick={() => router.push('/field/walk')} className="w-full py-3 bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded text-xs font-bold text-center">Walk Perimeter</button>
              <button onClick={() => router.push('/field/projects')} className="w-full py-3 bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded text-xs font-bold text-center">Local Projects</button>
              <button
                onClick={() =>
                  router.push(selectedProject ? `/field/setout?projectId=${selectedProject}` : '/field/setout')
                }
                className="w-full py-3 bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded text-xs font-bold text-center"
              >
                Set Out Points
              </button>
              <button disabled={!selectedProject} onClick={() => router.push(`/field/setout?projectId=${encodeURIComponent(selectedProject)}&mode=plumb`)} className="min-h-11 w-full rounded bg-[var(--bg-tertiary)] py-3 text-center text-xs font-bold text-[var(--text-primary)] disabled:opacity-40">Column Plumb Checks</button>
            </div>
            <div className="mt-4 p-4 rounded-xl bg-amber-900/30 border border-amber-700 text-amber-300 text-sm">
              <strong>Kenya Survey Regulations 1994:</strong> All GPS coordinates collected in the field must be verified against control beacons before submission. Field data is a draft — not a final survey.
            </div>
          </div>
        )}
      </main>

      {/* Bottom Tabs - hidden when MobileNav is present */}
      <div className="fixed bottom-0 left-0 right-0 bg-[var(--bg-secondary)] border-t border-[var(--border-color)] md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex">
          {renderTabButton('points', MapPin, 'Points')}
          {renderTabButton('traverse', RefreshCw, 'Traverse')}
          {renderTabButton('leveling', Scale, 'Level')}
          {renderTabButton('radiation', Radio, 'Rad')}
          {renderOfflineTabButton('offline', Upload, 'Offline')}
          {renderTabButton('map', MapPin, 'Map')}
        </div>
      </div>
    </div>
  )
}
