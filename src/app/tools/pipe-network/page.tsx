'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
  Manhole,
  Pipe,
  PipeResult,
  MANNING_N,
  classifyPipeFlowStatus,
  calculatePipeAlignmentLengthM,
  autoSizePipe,
  calculatePipeHydraulics,
  solvePartialFlow,
  calculatePipeCover,
  analyzeManholeDrops,
  calculateRationalRunoff,
  generatePipeSetoutStations,
  autoGradeNetwork,
  MAX_PIPE_SETOUT_STATIONS,
  RUNOFF_PRESETS,
  generateNetworkDXF,
  calculatePressurizedPipeProfile,
  validatePipeNetwork,
  validateLinearPipeRoute,
} from '@/lib/engineering/pipeNetworkEngine'
import { assertProjectedCrs } from '@/lib/spatial/projectCrs'
import { createPipeNetworkProjectData, type PipeNetworkProjectData } from '@/lib/engineering/pipeNetworkPersistence'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  Download,
  Plus,
  Trash2,
  Wand2,
  Layers,
  ArrowRight,
  TrendingDown,
  Activity,
  Compass,
  Droplets,
  Sliders,
  FileSpreadsheet,
} from 'lucide-react'

const PRESET_NETWORKS: Record<string, { name: string; manholes: Manhole[]; pipes: Pipe[] }> = {
  subdivision_main: {
    name: 'Residential Subdivision Main (4 Manholes, Gravity Flow)',
    manholes: [
      { id: 'MH-01', easting: 1000.0, northing: 5000.0, groundLevel: 102.50, invertOut: 100.80 },
      { id: 'MH-02', easting: 1060.0, northing: 5000.0, groundLevel: 101.80, invertIn: 100.20, invertOut: 100.15 },
      { id: 'MH-03', easting: 1130.0, northing: 5000.0, groundLevel: 100.90, invertIn: 99.45, invertOut: 99.40 },
      { id: 'MH-04', easting: 1210.0, northing: 5000.0, groundLevel: 100.00, invertIn: 98.60 },
    ],
    pipes: [
      { id: 'P-1', fromId: 'MH-01', toId: 'MH-02', diameterMm: 300, material: 'Concrete', designFlowLs: 65 },
      { id: 'P-2', fromId: 'MH-02', toId: 'MH-03', diameterMm: 375, material: 'Concrete', designFlowLs: 95 },
      { id: 'P-3', fromId: 'MH-03', toId: 'MH-04', diameterMm: 450, material: 'Concrete', designFlowLs: 140 },
    ],
  },
  highway_culvert: {
    name: 'Highway Stormwater Cross-Culvert Run (HDPE Pipe)',
    manholes: [
      { id: 'INLET-1', easting: 2500.0, northing: 8000.0, groundLevel: 50.00, invertOut: 48.50 },
      { id: 'JUNCT-2', easting: 2545.0, northing: 8000.0, groundLevel: 49.30, invertIn: 47.90, invertOut: 47.85 },
      { id: 'OUTLET-3', easting: 2600.0, northing: 8000.0, groundLevel: 48.20, invertIn: 47.10 },
    ],
    pipes: [
      { id: 'CULV-1', fromId: 'INLET-1', toId: 'JUNCT-2', diameterMm: 450, material: 'HDPE', designFlowLs: 180 },
      { id: 'CULV-2', fromId: 'JUNCT-2', toId: 'OUTLET-3', diameterMm: 525, material: 'HDPE', designFlowLs: 220 },
    ],
  },
  urban_trunk: {
    name: 'Urban Collector Trunk Sewer (5 Manholes with Drop Manhole)',
    manholes: [
      { id: 'TRK-01', easting: 3100.0, northing: 4200.0, groundLevel: 115.00, invertOut: 113.20 },
      { id: 'TRK-02', easting: 3150.0, northing: 4220.0, groundLevel: 113.80, invertIn: 112.70, invertOut: 112.65 },
      { id: 'TRK-03', easting: 3220.0, northing: 4240.0, groundLevel: 112.10, invertIn: 111.95, invertOut: 111.20 }, // 0.75m Drop Manhole!
      { id: 'TRK-04', easting: 3290.0, northing: 4250.0, groundLevel: 110.50, invertIn: 110.50, invertOut: 110.45 },
      { id: 'TRK-05', easting: 3370.0, northing: 4260.0, groundLevel: 109.00, invertIn: 109.65 },
    ],
    pipes: [
      { id: 'T-1', fromId: 'TRK-01', toId: 'TRK-02', diameterMm: 300, material: 'uPVC', designFlowLs: 55 },
      { id: 'T-2', fromId: 'TRK-02', toId: 'TRK-03', diameterMm: 375, material: 'uPVC', designFlowLs: 90 },
      { id: 'T-3', fromId: 'TRK-03', toId: 'TRK-04', diameterMm: 450, material: 'Concrete', designFlowLs: 150 },
      { id: 'T-4', fromId: 'TRK-04', toId: 'TRK-05', diameterMm: 525, material: 'Concrete', designFlowLs: 210 },
    ],
  },
}

function parsePipeAlignmentDraft(value: string): { vertices?: Array<{ easting: number; northing: number }>; error?: string } {
  const lines = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (lines.length > MAX_PIPE_SETOUT_STATIONS) {
    return { error: `A pipe alignment can contain at most ${MAX_PIPE_SETOUT_STATIONS.toLocaleString()} bend points.` }
  }
  const vertices: Array<{ easting: number; northing: number }> = []
  for (const [index, line] of lines.entries()) {
    const coordinates = line.split(',').map(value => value.trim())
    if (coordinates.length !== 2 || coordinates.some(value => value === '')) {
      return { error: `Line ${index + 1}: enter Easting,Northing in the project CRS, one bend point per line.` }
    }
    const [easting, northing] = coordinates.map(Number)
    if (!Number.isFinite(easting) || !Number.isFinite(northing)) {
      return { error: `Line ${index + 1}: both projected coordinates must be finite numbers.` }
    }
    vertices.push({ easting, northing })
  }
  return { vertices }
}

function pipeRouteMidpoint(route: Array<{ easting: number; northing: number }>) {
  const lengths = route.slice(1).map((point, index) => Math.hypot(
    point.easting - route[index].easting,
    point.northing - route[index].northing,
  ))
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2
  for (const [index, length] of lengths.entries()) {
    if (remaining <= length) {
      const start = route[index]
      const end = route[index + 1]
      const fraction = length > 0 ? remaining / length : 0
      return {
        easting: start.easting + (end.easting - start.easting) * fraction,
        northing: start.northing + (end.northing - start.northing) * fraction,
      }
    }
    remaining -= length
  }
  return route[route.length - 1]
}

function canonicalCrsForComparison(value: string) {
  try {
    return assertProjectedCrs(value).code
  } catch {
    return value.trim().toUpperCase()
  }
}

export default function PipeNetworkPage() {
  const [selectedPreset, setSelectedPreset] = useState<string>('custom')
  const [manholes, setManholes] = useState<Manhole[]>([])
  const [pipes, setPipes] = useState<Pipe[]>([])
  const [alignmentDrafts, setAlignmentDrafts] = useState<Record<string, string>>({})
  const [alignmentErrors, setAlignmentErrors] = useState<Record<string, string>>({})
  const [demoMode, setDemoMode] = useState(false)
  const [projectCrs, setProjectCrs] = useState('')
  const [coverRequirementText, setCoverRequirementText] = useState('')
  const [stationIntervalText, setStationIntervalText] = useState('5')
  const [stationStartChainageText, setStationStartChainageText] = useState('')
  const [outfallHglText, setOutfallHglText] = useState('')
  const [startInvertText, setStartInvertText] = useState('')
  const [actionError, setActionError] = useState('')
  const [activeView, setActiveView] = useState<'profile' | 'plan'>('profile')
  const [linkedProjectId, setLinkedProjectId] = useState<string | null>(null)
  const [linkedProjectName, setLinkedProjectName] = useState('')
  const [projectLinkStatus, setProjectLinkStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [projectLinkMessage, setProjectLinkMessage] = useState('')
  const [projectDeclaredCrs, setProjectDeclaredCrs] = useState<string | null>(null)
  const [projectReferenceIssue, setProjectReferenceIssue] = useState('')
  const [projectCrsConflict, setProjectCrsConflict] = useState('')
  const [savedProjectNetworkSnapshot, setSavedProjectNetworkSnapshot] = useState<string | null>(null)
  const [savingProjectNetwork, setSavingProjectNetwork] = useState(false)

  useEffect(() => {
    setLinkedProjectId(new URLSearchParams(window.location.search).get('projectId'))
  }, [])

  useEffect(() => {
    if (!linkedProjectId) return
    const controller = new AbortController()
    setProjectLinkStatus('loading')
    setProjectLinkMessage('Loading project network…')
    void fetch(`/api/project/${encodeURIComponent(linkedProjectId)}/pipe-network`, {
      signal: controller.signal,
      cache: 'no-store',
    }).then(async response => {
      const payload = await response.json() as {
        error?: string
        projectName?: string
        declaredProjectCrs?: string | null
        projectCrsIssue?: string | null
        network?: PipeNetworkProjectData | null
      }
      if (!response.ok) throw new Error(payload.error || 'Project network could not be loaded.')
      setLinkedProjectName(payload.projectName || 'Project')
      setProjectDeclaredCrs(payload.declaredProjectCrs ?? null)
      setProjectReferenceIssue(payload.projectCrsIssue ?? '')
      const network = payload.network ?? null
      if (network) {
        setManholes(network.manholes)
        setPipes(network.pipes)
        setProjectCrs(network.projectCrs)
        setCoverRequirementText(network.minimumCoverM === undefined ? '' : String(network.minimumCoverM))
        setStationIntervalText(network.stationIntervalM === undefined ? '5' : String(network.stationIntervalM))
        setStationStartChainageText(network.stationStartChainageM === undefined ? '' : String(network.stationStartChainageM))
        setOutfallHglText(network.outfallHglM === undefined ? '' : String(network.outfallHglM))
        setSelectedPreset('custom')
        setDemoMode(false)
        setAlignmentDrafts({})
        setAlignmentErrors({})
        setSavedProjectNetworkSnapshot(JSON.stringify(network))
        if (payload.declaredProjectCrs && canonicalCrsForComparison(network.projectCrs) !== canonicalCrsForComparison(payload.declaredProjectCrs)) {
          setProjectCrsConflict(`Saved coordinates are recorded in ${network.projectCrs}, but this project now declares ${payload.declaredProjectCrs}. Reproject the coordinates before calculating or saving them again.`)
        } else {
          setProjectCrsConflict('')
        }
        setProjectLinkMessage('Saved network loaded. Project edits are kept separate until you save.')
      } else {
        setProjectCrs(payload.declaredProjectCrs ?? '')
        setOutfallHglText('')
        setProjectCrsConflict('')
        setSavedProjectNetworkSnapshot(null)
        setProjectLinkMessage('No pipe network has been saved to this project yet.')
      }
      setProjectLinkStatus('loaded')
    }).catch(error => {
      if (controller.signal.aborted) return
      setProjectLinkStatus('error')
      setProjectLinkMessage(error instanceof Error ? error.message : 'Project network could not be loaded.')
    })
    return () => controller.abort()
  }, [linkedProjectId])

  // Auto-Grade Options state
  const [showAutoGradeModal, setShowAutoGradeModal] = useState(false)
  const [targetSlopePct, setTargetSlopePct] = useState('')
  const [mhDropStepMm, setMhDropStepMm] = useState('')

  // Rational Runoff Calculator state
  const [showRunoffCalc, setShowRunoffCalc] = useState(false)
  const [runoffPresetKey, setRunoffPresetKey] = useState<string>('')
  const [customC, setCustomC] = useState<number | null>(null)
  const [stormIntensity, setStormIntensity] = useState<number>(0) // mm/hr
  const [catchmentArea, setCatchmentArea] = useState<number>(0) // Ha
  const [targetPipeForRunoff, setTargetPipeForRunoff] = useState<string>('')

  // Handle preset change
  const handlePresetSelect = (key: string) => {
    setSelectedPreset(key)
    setActionError('')
    if (key === 'custom') {
      setManholes([])
      setPipes([])
      setAlignmentDrafts({})
      setAlignmentErrors({})
      setDemoMode(false)
      setProjectCrs(linkedProjectId ? projectDeclaredCrs ?? '' : '')
      setCoverRequirementText('')
      setOutfallHglText('')
      return
    }
    const p = PRESET_NETWORKS[key]
    if (p) {
      setManholes(p.manholes)
      setPipes(p.pipes)
      setAlignmentDrafts({})
      setAlignmentErrors({})
      setDemoMode(true)
      setProjectCrs('')
      setCoverRequirementText('')
      setOutfallHglText('')
    }
  }

  const networkIssues = useMemo(() => validatePipeNetwork(manholes, pipes), [manholes, pipes])
  const crsIssue = useMemo(() => {
    if (projectReferenceIssue) return projectReferenceIssue
    if (projectCrsConflict) return projectCrsConflict
    if (demoMode) return ''
    if (!projectCrs.trim()) return 'Enter the project CRS before doing survey-distance calculations.'
    try {
      const crs = assertProjectedCrs(projectCrs.trim())
      if (crs.units !== 'metres') return `${crs.code} uses ${crs.units}; this workflow requires projected metre coordinates.`
      return ''
    } catch (error) {
      return error instanceof Error ? error.message : 'The project CRS is not valid for survey calculations.'
    }
  }, [projectCrs, demoMode, projectCrsConflict, projectReferenceIssue])
  const coverRequirement = coverRequirementText.trim() === '' ? undefined : Number(coverRequirementText)
  const coverRequirementIssue = coverRequirement === undefined
    ? 'Enter the minimum crown cover from the approved project specification before accepting checks or exporting.'
    : !Number.isFinite(coverRequirement) || coverRequirement <= 0
      ? 'Project minimum cover must be a finite value greater than zero.'
      : ''
  const stationInterval = Number(stationIntervalText)
  const stationStartChainage = stationStartChainageText.trim() === '' ? 0 : Number(stationStartChainageText)
  const stationIssue = !Number.isFinite(stationInterval) || stationInterval <= 0
    ? 'Set-out interval must be greater than zero.'
    : !Number.isFinite(stationStartChainage)
      ? 'Starting chainage must be finite, or left blank for run-relative chainage from zero.'
      : pipes.some(pipe => !Number.isFinite(pipe.outsideDiameterMm) || (pipe.outsideDiameterMm as number) <= 0)
        ? "Enter each manufacturer's outside diameter before preparing physical set-out or cover deliverables."
      : ''
  const projectNetworkPayload = useMemo(() => {
    try {
      return createPipeNetworkProjectData({
        projectCrs,
        minimumCoverM: coverRequirement === undefined ? undefined : coverRequirement,
        stationIntervalM: Number.isFinite(stationInterval) && stationInterval > 0 ? stationInterval : undefined,
        stationStartChainageM: stationStartChainageText.trim() === '' ? undefined : stationStartChainage,
        outfallHglM: outfallHglText.trim() === '' ? undefined : Number(outfallHglText),
        manholes,
        pipes,
      })
    } catch {
      return null
    }
  }, [projectCrs, coverRequirement, stationInterval, stationStartChainageText, stationStartChainage, outfallHglText, manholes, pipes])
  const projectNetworkSignature = projectNetworkPayload ? JSON.stringify(projectNetworkPayload) : ''
  const projectNetworkIsSaved = Boolean(savedProjectNetworkSnapshot && projectNetworkSignature === savedProjectNetworkSnapshot)
  const autoGradeIssues = useMemo(
    () => validateLinearPipeRoute(manholes, pipes, { requireInverts: false, requireDesignFlow: false, requireDiameter: false }),
    [manholes, pipes]
  )
  const canAutoGrade = autoGradeIssues.length === 0 && pipes.every(pipe => Number.isFinite(pipe.outsideDiameterMm) && (pipe.outsideDiameterMm as number) > 0) && !crsIssue && !demoMode
  const autoSizeIssues = useMemo(
    () => validateLinearPipeRoute(manholes, pipes, { requireDiameter: false }),
    [manholes, pipes]
  )
  const canAutoSize = autoSizeIssues.length === 0 && !crsIssue && !demoMode
  const alignmentIssues = pipes.flatMap(pipe => alignmentErrors[pipe.id] ? [`${pipe.id}: ${alignmentErrors[pipe.id]}`] : [])
  const calculationIssues = [...networkIssues, ...(crsIssue && !demoMode ? [crsIssue] : []), ...alignmentIssues]
  const calculationReady = calculationIssues.length === 0

  // Calculate hydraulics, partial flow, and cover checks
  const results = useMemo<PipeResult[]>(() => {
    if (!calculationReady) return []
    return pipes.map((p) => {
      const mh1 = manholes.find((m) => m.id === p.fromId)
      const mh2 = manholes.find((m) => m.id === p.toId)
      if (!mh1 || !mh2) throw new Error(`${p.id}: connected manholes are missing.`)
      const length = calculatePipeAlignmentLengthM(p, mh1, mh2)
      const slope = ((mh1.invertOut as number) - (mh2.invertIn as number)) / length

      const { capacity, velocity } = calculatePipeHydraulics(p.diameterMm, slope, p.material, p.manningN)
      const capacityLs = capacity * 1000

      const partial = solvePartialFlow(p.diameterMm, slope, p.material, p.designFlowLs, p.manningN)
      const cover = calculatePipeCover(p, mh1, mh2, coverRequirement)

      const status = classifyPipeFlowStatus(p.designFlowLs, capacityLs, partial)

      return {
        ...p,
        horizontalLengthM: length,
        slope,
        slopePercent: slope * 100,
        velocity,
        capacityLs,
        status,
        partial,
        cover,
      }
    })
  }, [manholes, pipes, calculationReady, coverRequirement])

  const pressurizedHglAssessment = useMemo(() => {
    if (!calculationReady || demoMode || !results.some(result => result.partial.flowCondition === 'Pressure flow analysis required')) return null
    if (outfallHglText.trim() === '') return { ok: false as const, message: 'Enter the approved HGL at the downstream pipe outlet; METARDU does not derive tailwater or critical depth.' }
    try {
      return {
        ok: true as const,
        reaches: calculatePressurizedPipeProfile(manholes, pipes, Number(outfallHglText)),
      }
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : 'The full-bore pressure profile could not be calculated.' }
    }
  }, [calculationReady, demoMode, results, outfallHglText, manholes, pipes])
  const pressureFlowPresent = results.some(result => result.partial.flowCondition === 'Pressure flow analysis required')
  const pressureHglIssue = pressureFlowPresent && !pressurizedHglAssessment?.ok
    ? pressurizedHglAssessment?.message ?? 'Pressure HGL is required before exporting this pressure-flow design.'
    : ''
  const exportReady = calculationReady && !demoMode && !coverRequirementIssue && !stationIssue && !pressureHglIssue
  const exportIssues = [...calculationIssues, coverRequirementIssue, stationIssue, pressureHglIssue].filter(Boolean)

  // Manhole drops analysis
  const dropAnalyses = useMemo(() => {
    return analyzeManholeDrops(manholes)
  }, [manholes])

  // Auto-Size all pipes using Manning's equation
  const handleAutoSize = () => {
    if (!canAutoSize) {
      setActionError(demoMode ? 'Example data cannot be changed into a project sizing result.' : [...autoSizeIssues, ...(crsIssue ? [crsIssue] : [])].join(' '))
      return
    }
    try {
      const updated = pipes.map((p) => {
        const mh1 = manholes.find((m) => m.id === p.fromId)
        const mh2 = manholes.find((m) => m.id === p.toId)
        if (!mh1 || !mh2) throw new Error(`${p.id}: connected manholes are missing.`)
        const length = calculatePipeAlignmentLengthM(p, mh1, mh2)
        const slope = ((mh1.invertOut as number) - (mh2.invertIn as number)) / length
        const idealDiam = autoSizePipe(p.designFlowLs, slope, p.material, p.manningN)
        if (idealDiam === null) throw new Error(`${p.id}: no listed hydraulic diameter meets its current full-flow capacity.`)
        return { ...p, diameterMm: idealDiam, outsideDiameterMm: undefined }
      })
      setPipes(updated)
      setActionError('')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Pipe sizing could not be completed.')
    }
  }

  // Execute Auto-Grade Inverts
  const handleExecuteAutoGrade = () => {
    if (autoGradeIssues.length > 0) {
      setActionError(autoGradeIssues.join(' '))
      return
    }
    if (crsIssue || demoMode) {
      setActionError(demoMode ? 'Example data cannot be used to create project inverts.' : crsIssue)
      return
    }
    if (!targetSlopePct.trim() || !coverRequirementText.trim() || !mhDropStepMm.trim()) {
      setActionError('Enter the target slope, project minimum cover, and manhole drop. Enter 0 explicitly when no drop is intended.')
      return
    }
    const slope = Number(targetSlopePct)
    const requiredCover = Number(coverRequirementText)
    const drop = Number(mhDropStepMm)
    const startInvert = startInvertText.trim() === '' ? undefined : Number(startInvertText)
    if (startInvertText.trim() !== '' && !Number.isFinite(startInvert)) {
      setActionError('Starting invert must be finite, or left blank to derive it from the first surveyed ground level and cover criterion.')
      return
    }
    const { manholes: graded, issues } = autoGradeNetwork(manholes, pipes, {
      targetSlopePercent: slope,
      minCoverM: requiredCover,
      manholeDropM: drop / 1000,
      startInvertM: startInvert,
    })
    if (issues.length > 0) {
      setActionError(issues.join(' '))
      return
    }
    setManholes(graded)
    setActionError('')
    setShowAutoGradeModal(false)
  }

  // Calculate Rational Runoff
  const calculatedRunoff = useMemo(() => {
    if (customC === null) return null
    try {
      return calculateRationalRunoff(customC, stormIntensity, catchmentArea)
    } catch {
      return null
    }
  }, [customC, stormIntensity, catchmentArea])

  const handleApplyRunoff = () => {
    if (!targetPipeForRunoff || !calculatedRunoff) return
    setPipes((prev) =>
      prev.map((p) => (p.id === targetPipeForRunoff ? { ...p, designFlowLs: calculatedRunoff.flowLs } : p))
    )
    setShowRunoffCalc(false)
  }

  // Update manhole
  const updateManhole = <K extends keyof Manhole>(idx: number, field: K, value: Manhole[K]) => {
    const next = [...manholes]
    if (!next[idx]) return
    next[idx] = { ...next[idx], [field]: value }
    setManholes(next)
    setSelectedPreset('custom')
  }

  const addManhole = () => {
    let nextNum = manholes.length + 1
    let newId = `MH-${String(nextNum).padStart(2, '0')}`
    while (manholes.some(mh => mh.id === newId)) {
      nextNum += 1
      newId = `MH-${String(nextNum).padStart(2, '0')}`
    }
    setSelectedPreset('custom')
    setManholes([...manholes, { id: newId }])
    setActionError('')
  }

  const removeManhole = (idx: number) => {
    const removedId = manholes[idx].id
    setManholes(manholes.filter((_, i) => i !== idx))
    setPipes(pipes.filter((p) => p.fromId !== removedId && p.toId !== removedId))
    setSelectedPreset('custom')
  }

  // Update pipe
  const updatePipe = <K extends keyof Pipe>(idx: number, field: K, value: Pipe[K]) => {
    const next = [...pipes]
    if (!next[idx]) return
    next[idx] = { ...next[idx], [field]: value }
    if (field === 'material') next[idx].manningN = undefined
    setPipes(next)
    setSelectedPreset('custom')
  }

  const getAlignmentDraft = (pipe: Pipe) => alignmentDrafts[pipe.id]
    ?? (pipe.alignmentVertices ?? []).map(vertex => `${vertex.easting},${vertex.northing}`).join('\n')

  const handleAlignmentDraftChange = (pipeId: string, value: string) => {
    const parsed = parsePipeAlignmentDraft(value)
    setAlignmentDrafts(current => ({ ...current, [pipeId]: value }))
    setAlignmentErrors(current => {
      const next = { ...current }
      if (parsed.error) next[pipeId] = parsed.error
      else delete next[pipeId]
      return next
    })
    if (parsed.error || !parsed.vertices) return
    setPipes(current => current.map(pipe => pipe.id === pipeId
      ? { ...pipe, alignmentVertices: parsed.vertices?.length ? parsed.vertices : undefined }
      : pipe))
    setSelectedPreset('custom')
  }

  const handleSaveProjectNetwork = async () => {
    if (!linkedProjectId || !projectNetworkPayload || demoMode || projectCrsConflict || alignmentIssues.length > 0) return
    setSavingProjectNetwork(true)
    setActionError('')
    try {
      const response = await fetch(`/api/project/${encodeURIComponent(linkedProjectId)}/pipe-network`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ network: projectNetworkPayload }),
      })
      const result = await response.json() as { error?: string; network?: PipeNetworkProjectData }
      if (!response.ok) throw new Error(result.error || 'The project network could not be saved.')
      const savedNetwork = result.network ?? projectNetworkPayload
      setSavedProjectNetworkSnapshot(JSON.stringify(savedNetwork))
      setProjectLinkMessage('Network saved to the project. It is available again from Project Engineering.')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The project network could not be saved.')
    } finally {
      setSavingProjectNetwork(false)
    }
  }

  const startFreshLinkedNetwork = () => {
    setManholes([])
    setPipes([])
    setAlignmentDrafts({})
    setAlignmentErrors({})
    setSelectedPreset('custom')
    setDemoMode(false)
    setProjectCrs(projectDeclaredCrs ?? '')
    setCoverRequirementText('')
    setOutfallHglText('')
    setStationIntervalText('5')
    setStationStartChainageText('')
    setProjectCrsConflict('')
    setProjectLinkMessage('Fresh unsaved network. Re-enter or reproject coordinates in the declared project CRS before saving.')
  }

  const renderAlignmentEditor = (pipe: Pipe) => (
    <div className="col-span-full space-y-1">
      <label htmlFor={`pipe-${pipe.id}-alignment`} className="text-zinc-400 block">
        Intermediate plan bends (optional; project CRS metres)
      </label>
      <textarea
        id={`pipe-${pipe.id}-alignment`}
        aria-label={`Intermediate plan bends for ${pipe.id}`}
        value={getAlignmentDraft(pipe)}
        onChange={event => handleAlignmentDraftChange(pipe.id, event.target.value)}
        placeholder="Easting,Northing — one point per line"
        rows={2}
        spellCheck={false}
        className="mt-1 w-full resize-y bg-black/30 border border-[var(--border-color)] rounded px-2 py-1.5 font-mono text-white"
      />
      <p className="text-[10px] text-zinc-500">The connected manholes are the start and end. Add only surveyed/design route bends; profile, grade and station chainage follow this developed route.</p>
      {alignmentErrors[pipe.id] && <p role="alert" className="text-[10px] text-red-300">{alignmentErrors[pipe.id]}</p>}
    </div>
  )

  const addPipe = () => {
    if (manholes.length < 2) return
    let nextNum = pipes.length + 1
    while (pipes.some(pipe => pipe.id === `P-${nextNum}`)) nextNum += 1
    const fromMh = manholes[manholes.length - 2].id
    const toMh = manholes[manholes.length - 1].id
    setPipes([
      ...pipes,
      {
        id: `P-${nextNum}`,
        fromId: fromMh,
        toId: toMh,
        diameterMm: 0,
        material: 'Concrete',
        designFlowLs: 0,
      },
    ])
    setSelectedPreset('custom')
    setActionError('')
  }

  const removePipe = (idx: number) => {
    const removedId = pipes[idx]?.id
    setPipes(pipes.filter((_, i) => i !== idx))
    if (removedId) {
      setAlignmentDrafts(current => { const next = { ...current }; delete next[removedId]; return next })
      setAlignmentErrors(current => { const next = { ...current }; delete next[removedId]; return next })
    }
    setSelectedPreset('custom')
  }

  // Exports
  const handleExportDxf = () => {
    if (!exportReady) {
      setActionError(demoMode ? 'Example data cannot be exported as a project deliverable. Start a new site network and enter verified project data.' : exportIssues.join(' '))
      return
    }
    try {
      const dxf = generateNetworkDXF(manholes, pipes, projectCrs.trim())
      const blob = new Blob([dxf], { type: 'application/dxf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Civil_Drainage_${selectedPreset === 'custom' ? 'project' : selectedPreset}.dxf`
      a.click()
      URL.revokeObjectURL(url)
      setActionError('')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'DXF export failed validation.')
    }
  }

  const handleExportCsv = () => {
    if (!exportReady) {
      setActionError(demoMode ? 'Example data cannot be exported as a project schedule. Start a new site network and enter verified project data.' : exportIssues.join(' '))
      return
    }
    try {
      const stations = generatePipeSetoutStations(manholes, pipes, stationInterval, stationStartChainage)
      const resultById = new Map(results.map(result => [result.id, result]))
      const headers = [
        'Pipe_ID','Station_Role','Pipe_Chainage_m','Schedule_Chainage_m','Station_Basis','Easting_m','Northing_m','Design_Invert_RL_m',
        'Pipe_Crown_RL_m','Ground_RL_m','Actual_Crown_Cover_m','Ground_Status','Cover_Assessment','Internal_Diameter_mm','Outside_Diameter_mm',
        'Material','Manning_n','Design_Flow_Ls','Calculated_Slope_pct','Project_Cover_Criterion_m','CRS','Calculated_Pressure_HGL_RL_m','Pressure_HGL_Basis',
      ]
      const pressureReachByPipe = new Map((pressurizedHglAssessment?.ok ? pressurizedHglAssessment.reaches : []).map(reach => [reach.pipeId, reach]))
      const rows = stations.map(station => {
        const result = resultById.get(station.pipeId)
        if (!result) throw new Error(`Calculated result is missing for pipe ${station.pipeId}`)
        const pressureReach = pressureReachByPipe.get(station.pipeId)
        const pressureHglAtStation = pressureReach
          ? station.stationRole === 'Pipe start'
            ? pressureReach.upstreamHglM
            : station.stationRole === 'Pipe end'
              ? pressureReach.downstreamHglM
              : pressureReach.upstreamHglM + (pressureReach.downstreamHglM - pressureReach.upstreamHglM) * (station.pipeChainageM / pressureReach.horizontalLengthM)
          : undefined
        const measuredCover = station.coverAboveCrownM
        const status = station.groundLevelM === undefined || measuredCover === undefined || coverRequirement === undefined
          ? 'Not assessed between surveyed manholes'
          : measuredCover < 0
            ? 'Daylight at measured manhole ground'
            : measuredCover < coverRequirement
              ? 'Below entered criterion at measured manhole'
              : 'Meets entered criterion at measured manhole'
        return [station.pipeId, station.stationRole, station.pipeChainageM, station.runChainageM,
          stationStartChainageText.trim() ? 'Entered run start offset' : 'Run-relative from zero', station.easting,
          station.northing, station.invertLevelM, station.crownLevelM, station.groundLevelM, station.coverAboveCrownM,
          station.groundStatus, status, result.diameterMm, result.outsideDiameterMm, result.material,
          result.manningN ?? MANNING_N[result.material], result.designFlowLs, result.slopePercent,
          coverRequirement, projectCrs.trim(), pressureHglAtStation,
          pressureReach ? 'Full-bore energy profile; entered outlet HGL and junction K' : undefined]
      })
      const csvCell = (value: string | number | undefined) => {
        let cell = value === undefined ? '' : String(value)
        if (typeof value === 'string' && /^[=+@-]/.test(cell)) cell = `'${cell}`
        return `"${cell.replace(/"/g, '""')}"`
      }
      const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
      const blob = new Blob([`\uFEFF${csv}\r\n`], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Drainage_Pipe_Setout_Schedule.csv`
      a.click()
      URL.revokeObjectURL(url)
      setActionError('')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Set-out schedule could not be generated.')
    }
  }

  // Profile Visualizer SVG Bounds
  const profileBounds = useMemo(() => {
    if (!calculationReady || validateLinearPipeRoute(manholes, pipes).length > 0 || pipes.some(pipe => !Number.isFinite(pipe.outsideDiameterMm) || (pipe.outsideDiameterMm as number) <= 0)) return null

    let currentChainage = 0
    const mhChainages: Record<string, number> = {}
    mhChainages[manholes[0].id] = 0

    for (let i = 0; i < manholes.length - 1; i++) {
      const m1 = manholes[i]
      const m2 = manholes[i + 1]
      const pipe = pipes[i]
      const dist = calculatePipeAlignmentLengthM(pipe, m1, m2)
      currentChainage += dist
      mhChainages[m2.id] = currentChainage
    }

    const totalDist = currentChainage
    if (totalDist <= 0) return null

    let minElev = Infinity, maxElev = -Infinity
    manholes.forEach((m) => {
      minElev = Math.min(minElev, m.groundLevel as number, m.invertIn ?? m.groundLevel as number, m.invertOut ?? m.groundLevel as number)
      maxElev = Math.max(maxElev, m.groundLevel as number)
    })
    if (pressurizedHglAssessment?.ok) {
      pressurizedHglAssessment.reaches.forEach(reach => {
        minElev = Math.min(minElev, reach.upstreamHglM, reach.downstreamHglM)
        maxElev = Math.max(maxElev, reach.upstreamHglM, reach.downstreamHglM)
      })
    }

    const elevSpan = Math.max(maxElev - minElev, 4)
    const padElev = elevSpan * 0.35
    const vMinElev = minElev - padElev
    const vMaxElev = maxElev + padElev

    const width = 850
    const height = 320

    const toX = (ch: number) => 65 + (ch / totalDist) * (width - 120)
    const toY = (elev: number) => height - 45 - ((elev - vMinElev) / (vMaxElev - vMinElev)) * (height - 90)

    return {
      width,
      height,
      toX,
      toY,
      totalDist,
      mhChainages,
      vMinElev,
      vMaxElev,
    }
  }, [manholes, pipes, calculationReady, pressurizedHglAssessment])

  // Plan View Visualizer SVG Bounds
  const planBounds = useMemo(() => {
    if (manholes.length === 0 || manholes.some(m => !Number.isFinite(m.easting) || !Number.isFinite(m.northing))) return null
    const routeBends = pipes.flatMap(pipe => pipe.alignmentVertices ?? [])
    if (routeBends.some(point => !Number.isFinite(point.easting) || !Number.isFinite(point.northing))) return null

    let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity
    const routeCoordinates = [...manholes, ...routeBends]
    routeCoordinates.forEach((point) => {
      minE = Math.min(minE, point.easting as number)
      maxE = Math.max(maxE, point.easting as number)
      minN = Math.min(minN, point.northing as number)
      maxN = Math.max(maxN, point.northing as number)
    })

    const spanE = Math.max(maxE - minE, 60)
    const spanN = Math.max(maxN - minN, 40)
    const width = 850
    const height = 320
    const scale = Math.min((width - 120) / spanE, (height - 80) / spanN)
    const centerE = (minE + maxE) / 2
    const centerN = (minN + maxN) / 2
    const toPlanX = (e: number) => width / 2 + (e - centerE) * scale
    const toPlanY = (n: number) => height / 2 - (n - centerN) * scale
    const vMinE = centerE - (width / 2 - 60) / scale
    const vMaxE = centerE + (width / 2 - 60) / scale

    return {
      width,
      height,
      toPlanX,
      toPlanY,
      vMinE,
      vMaxE,
    }
  }, [manholes, pipes])

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/tools">Tools</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Pipe Network &amp; Storm Drainage</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <PageHeader
          badge="CIVIL DRAINAGE &amp; HYDRAULICS"
          title="Drainage Survey & Pipe Network"
          subtitle="Enter surveyed manhole positions, ground and invert levels, and project design flows. Review gravity-flow calculations, cover against your project requirement, prepare a profile drawing, and export a field schedule."
          reference="Manning uniform-flow screening; material roughness and all acceptance criteria must match the approved design."
        />

        {linkedProjectId && (
          <section aria-label="Project network connection" className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">{linkedProjectName ? `Project: ${linkedProjectName}` : 'Project network'}</h2>
              <p role={projectLinkStatus === 'error' ? 'alert' : 'status'} className="mt-1 text-xs text-[var(--text-secondary)]">
                {projectLinkStatus === 'loading' ? 'Loading project data…' : projectLinkMessage}
                {projectLinkStatus === 'loaded' && !projectCrsConflict && (savedProjectNetworkSnapshot
                  ? projectNetworkIsSaved ? ' Saved version is current.' : ' Unsaved changes.'
                  : ' No saved version yet.')}
              </p>
              {projectCrsConflict && <p role="alert" className="mt-2 text-xs text-amber-200">{projectCrsConflict}</p>}
              {projectReferenceIssue && <p role="alert" className="mt-2 text-xs text-amber-200">{projectReferenceIssue}</p>}
              {projectDeclaredCrs && <p className="mt-1 text-[11px] text-[var(--text-secondary)]">Declared project CRS: {projectDeclaredCrs}</p>}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {projectCrsConflict && (
                <button type="button" onClick={startFreshLinkedNetwork} className="rounded-lg border border-amber-500/40 px-3 py-2 text-xs text-amber-100 hover:bg-amber-500/10">
                  Start fresh in project CRS
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleSaveProjectNetwork()}
                disabled={projectLinkStatus !== 'loaded' || savingProjectNetwork || !projectNetworkPayload || demoMode || Boolean(crsIssue) || alignmentIssues.length > 0}
                className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                {savingProjectNetwork ? 'Saving…' : projectNetworkIsSaved ? 'Save changes to project' : 'Save network to project'}
              </button>
              <a href={`/project/${encodeURIComponent(linkedProjectId)}/engineering`} className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs hover:bg-white/5">
                Project Engineering
              </a>
            </div>
          </section>
        )}

        {demoMode && (
          <div role="status" className="border border-amber-500/50 bg-amber-950/30 rounded-xl p-4 text-sm text-amber-100">
            <strong>Illustrative example only.</strong> The coordinates and levels are synthetic. Calculations are shown for learning; project exports stay disabled. Use <button type="button" onClick={() => handlePresetSelect('custom')} className="underline font-semibold">New site network</button> to enter surveyed project data.
          </div>
        )}
        {actionError && (
          <div role="alert" className="border border-red-500/50 bg-red-950/30 rounded-xl p-4 text-sm text-red-100">
            <strong>Action not completed.</strong> {actionError}
          </div>
        )}

        {/* Action Header Banner */}
        <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 shadow-sm grid grid-cols-1 gap-4 lg:grid-cols-[minmax(230px,0.85fr)_minmax(0,1.6fr)]">
          <div className="min-w-0 flex flex-wrap items-center gap-3">
            <Layers className="w-5 h-5 text-[var(--accent)]" />
            <div>
              <div className="text-sm font-bold">Network data</div>
              <div className="text-xs text-[var(--text-secondary)]">Examples are labelled and cannot be exported</div>
            </div>
            <select
              value={selectedPreset}
              onChange={(e) => handlePresetSelect(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-1.5 text-xs focus:outline-none font-medium"
            >
              <option value="custom" className="bg-[var(--bg-secondary)]">New site network</option>
              {Object.entries(PRESET_NETWORKS).map(([k, v]) => (
                <option key={k} value={k} className="bg-[var(--bg-secondary)]">
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          {!demoMode && (
            <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-[11px] text-[var(--text-secondary)]">
                Project CRS (registered projected metres)
                <input
                  type="text"
                  value={projectCrs}
                  onChange={(e) => setProjectCrs(e.target.value)}
                  placeholder="e.g. EPSG:21037"
                  aria-label="Project coordinate reference system"
                  className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-black/30 px-3 py-2 text-xs font-mono text-[var(--text-primary)]"
                />
              </label>
              <label className="text-[11px] text-[var(--text-secondary)]">
                Minimum crown cover from project specification (m)
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={coverRequirementText}
                  onChange={(e) => setCoverRequirementText(e.target.value)}
                  placeholder="Enter approved criterion"
                  aria-label="Minimum crown cover from project specification"
                  className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-black/30 px-3 py-2 text-xs font-mono text-[var(--text-primary)]"
                />
              </label>
              <label className="text-[11px] text-[var(--text-secondary)]">
                Set-out interval along straight pipe chord (m)
                <input type="number" min="0.001" step="0.1" value={stationIntervalText} onChange={e => setStationIntervalText(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-black/30 px-3 py-2 text-xs font-mono text-[var(--text-primary)]" />
              </label>
              <label className="text-[11px] text-[var(--text-secondary)]">
                Starting chainage (m, optional)
                <input type="number" step="0.001" value={stationStartChainageText} onChange={e => setStationStartChainageText(e.target.value)} placeholder="Blank = run-relative zero" className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-black/30 px-3 py-2 text-xs font-mono text-[var(--text-primary)]" />
              </label>
              <label className="text-[11px] text-[var(--text-secondary)]">
                Downstream pipe outlet HGL boundary (m RL)
                <input type="number" step="0.001" value={outfallHglText} onChange={e => setOutfallHglText(e.target.value)} placeholder="Enter approved outlet HGL" className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-black/30 px-3 py-2 text-xs font-mono text-[var(--text-primary)]" />
                <span className="block mt-1 text-[10px]">Enter the approved HGL at the outlet pipe section in the project's vertical datum. METARDU does not derive tailwater or critical depth.</span>
              </label>
            </div>
          )}

          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:col-span-2">
            <button
              onClick={() => setShowRunoffCalc(true)}
              className="py-2 px-3 rounded-xl border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-xs font-bold text-cyan-400 flex items-center gap-1.5 transition-colors"
            >
              <Droplets className="w-3.5 h-3.5" /> Rational Runoff (Q=CIA)
            </button>
            <button
              onClick={() => setShowAutoGradeModal(true)}
      disabled={!canAutoGrade}
              className="py-2 px-3 rounded-xl border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-xs font-bold text-purple-400 flex items-center gap-1.5 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5" /> Auto-Grade Inverts
            </button>
            <button
              onClick={handleAutoSize}
              disabled={!canAutoSize}
              title="Selects the smallest listed hydraulic diameter meeting full-pipe Manning capacity using the displayed material roughness preset."
              className="py-2 px-3.5 rounded-xl bg-[var(--accent)] text-black font-bold text-xs flex items-center gap-1.5 hover:opacity-90 transition-opacity shadow-md shadow-[var(--accent)]/15 disabled:opacity-40"
            >
              <Wand2 className="w-3.5 h-3.5" /> Size by full-flow capacity
            </button>
            <button
              onClick={handleExportDxf}
              disabled={!exportReady}
              title={demoMode ? 'Example data cannot be exported' : !exportReady ? exportIssues.join(' ') : undefined}
              className="py-2 px-3 rounded-xl border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5 text-[var(--accent)]" /> Export DXF
            </button>
            <button
              onClick={handleExportCsv}
              disabled={!exportReady}
              title={demoMode ? 'Example data cannot be exported' : !exportReady ? exportIssues.join(' ') : undefined}
              className="py-2 px-3 rounded-xl border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" /> Export CSV
            </button>
          </div>
        </div>

        {/* Plan and longitudinal profile views */}
        {calculationIssues.length > 0 && !demoMode && (
          <section aria-labelledby="drainage-input-check-title" className="border border-amber-500/40 bg-amber-950/20 rounded-2xl p-5">
            <h2 id="drainage-input-check-title" className="font-semibold text-amber-200">Project calculations are waiting for required inputs</h2>
            <p className="text-xs text-amber-100/80 mt-1">METARDU will not substitute missing survey levels, invert elevations, coordinates, or gradients.</p>
            <ul className="mt-3 list-disc pl-5 space-y-1 text-xs text-amber-100/90">
              {calculationIssues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}
            </ul>
          </section>
        )}
        {calculationIssues.length > 0 && demoMode && (
          <section aria-label="Illustrative example calculation limits" className="border border-amber-500/40 bg-amber-950/20 rounded-xl p-4 text-xs text-amber-100">
            <strong>This example cannot be calculated completely:</strong> {calculationIssues.join(' ')}
          </section>
        )}
        {calculationReady && !demoMode && !coverRequirementIssue && (
          <p className="text-xs text-[var(--text-secondary)]">Coordinates are used as entered in {projectCrs.trim()}; no transformation is performed. Confirm coordinate and vertical datum provenance in the project records before field use.</p>
        )}

        <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
            <div className="flex items-center gap-3">
              <div className="flex p-0.5 bg-black/40 border border-white/10 rounded-xl">
                <button
                  onClick={() => setActiveView('profile')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                    activeView === 'profile'
                      ? 'bg-[var(--accent)] text-black shadow'
                      : 'text-[var(--text-secondary)] hover:text-white'
                  }`}
                >
                  <TrendingDown className="w-3.5 h-3.5" /> Profile View (Longitudinal)
                </button>
                <button
                  onClick={() => setActiveView('plan')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                    activeView === 'plan'
                      ? 'bg-[var(--accent)] text-black shadow'
                      : 'text-[var(--text-secondary)] hover:text-white'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5" /> Plan View (2D Map)
                </button>
              </div>
              <p className="hidden md:block text-[11px] text-[var(--text-secondary)] font-mono">
                {activeView === 'profile'
                  ? `Manhole ground RLs (connected for display only) • Crown (cyan) • Invert (blue) • Uniform-flow depth estimate${pressurizedHglAssessment?.ok ? ' • Full-bore pressure HGL (orange dashed)' : ''}`
                  : 'North-up Coordinate Grid (E, N) • Pipe Flow Vectors • Manhole Inspection Nodes'}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono text-[var(--text-secondary)]">
              <span>{pipes.length} segments</span>
              <span>•</span>
              <span>{manholes.length} manholes</span>
            </div>
          </div>

          {/* VIEW RENDERER */}
          <div className="w-full h-80 bg-black/40 border border-[var(--border-color)] rounded-xl overflow-hidden flex items-center justify-center relative p-3">
            {activeView === 'profile' && profileBounds && (
              <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${profileBounds.width} ${profileBounds.height}`}
                className="select-none"
              >
                {/* Horizontal Grid lines for Elevations */}
                {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                  const elev = profileBounds.vMinElev + pct * (profileBounds.vMaxElev - profileBounds.vMinElev)
                  const y = profileBounds.toY(elev)
                  return (
                    <g key={i}>
                      <line x1="65" y1={y} x2={profileBounds.width - 55} y2={y} stroke="rgba(255,255,255,0.06)" />
                      <text x="20" y={y + 3} fill="#71717a" fontSize="9" fontFamily="monospace">
                        {elev.toFixed(1)}m
                      </text>
                    </g>
                  )
                })}

                {/* Manhole ground levels connected for display; intermediate ground is not surveyed. */}
                {(() => {
                  const groundPoints = manholes
                    .map((m) => {
                      const ch = profileBounds.mhChainages[m.id] || 0
                      return `${profileBounds.toX(ch)},${profileBounds.toY(m.groundLevel as number)}`
                    })
                    .join(' ')

                  return (
                    <polyline
                      points={groundPoints}
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="2.5"
                      strokeDasharray="5 2.5"
                    />
                  )
                })()}

                {/* Pipe Barrel, Invert, Crown, and Partial Flow Water Depth */}
                {results.map((p) => {
                  const m1 = manholes.find((m) => m.id === p.fromId)
                  const m2 = manholes.find((m) => m.id === p.toId)
                  if (!m1 || !m2) return null

                  const ch1 = profileBounds.mhChainages[m1.id] || 0
                  const ch2 = profileBounds.mhChainages[m2.id] || 0
                  const inv1 = m1.invertOut as number
                  const inv2 = m2.invertIn as number

                  const x1 = profileBounds.toX(ch1)
                  const y1 = profileBounds.toY(inv1)
                  const x2 = profileBounds.toX(ch2)
                  const y2 = profileBounds.toY(inv2)

                  const diamM = (p.outsideDiameterMm as number) / 1000
                  const crownY1 = profileBounds.toY(inv1 + diamM)
                  const crownY2 = profileBounds.toY(inv2 + diamM)

                  // Partial flow water surface height
                  const waterDepthM = (p.partial.flowDepthMm || 0) / 1000
                  const waterY1 = profileBounds.toY(inv1 + waterDepthM)
                  const waterY2 = profileBounds.toY(inv2 + waterDepthM)

                  return (
                    <g key={p.id}>
                      {/* Pipe Barrel Polygon */}
                      <polygon
                        points={`${x1},${y1} ${x2},${y2} ${x2},${crownY2} ${x1},${crownY1}`}
                        fill="rgba(6, 182, 212, 0.12)"
                        stroke="#06b6d4"
                        strokeWidth="1.5"
                      />

                      {/* Partial Flow Water Depth Fill (Darker Blue) */}
                      {waterDepthM > 0 && p.partial.flowCondition === 'Free surface' && (
                        <polygon
                          points={`${x1},${y1} ${x2},${y2} ${x2},${waterY2} ${x1},${waterY1}`}
                          fill="rgba(59, 130, 246, 0.45)"
                          stroke="#3b82f6"
                          strokeWidth="1"
                          strokeDasharray="2 2"
                        />
                      )}

                      {/* Label on Pipe */}
                      <text
                        x={(x1 + x2) / 2}
                        y={(y1 + y2) / 2 - 9}
                        fill="#fafafa"
                        fontSize="9"
                        textAnchor="middle"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {p.id} (Ø{p.diameterMm}mm • {p.partial.flowCondition === 'Free surface'
                          ? `d/D: ${(p.partial.depthRatio * 100).toFixed(1)}% • ${p.partial.actualVelocity.toFixed(2)}m/s`
                          : 'pressure-flow review required'})
                      </text>
                    </g>
                  )
                })}

                {pressurizedHglAssessment?.ok && pressurizedHglAssessment.reaches.map(reach => {
                  const pipe = pipes.find(candidate => candidate.id === reach.pipeId)
                  if (!pipe) return null
                  const fromChainage = profileBounds.mhChainages[pipe.fromId] || 0
                  const toChainage = profileBounds.mhChainages[pipe.toId] || 0
                  const x1 = profileBounds.toX(fromChainage)
                  const x2 = profileBounds.toX(toChainage)
                  const y1 = profileBounds.toY(reach.upstreamHglM)
                  const y2 = profileBounds.toY(reach.downstreamHglM)
                  return (
                    <g key={`pressure-hgl-${reach.pipeId}`}>
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fb923c" strokeWidth="2.5" strokeDasharray="8 3" />
                      <circle cx={x1} cy={y1} r="3.5" fill="#fb923c" />
                      <circle cx={x2} cy={y2} r="3.5" fill="#fb923c" />
                    </g>
                  )
                })}

                {/* Manhole Shafts & Inverts */}
                {manholes.map((m) => {
                  const ch = profileBounds.mhChainages[m.id] || 0
                  const x = profileBounds.toX(ch)
                  const groundLevel = m.groundLevel as number
                  const topY = profileBounds.toY(groundLevel)
                  const botY = profileBounds.toY(Math.min(m.invertIn ?? groundLevel, m.invertOut ?? groundLevel))

                  return (
                    <g key={m.id}>
                      <rect x={x - 8} y={topY} width="16" height={Math.max(botY - topY, 15)} fill="#27272a" stroke="#52525b" />
                      <circle cx={x} cy={topY} r="5.5" fill="#a1a1aa" stroke="#22c55e" strokeWidth="2" />
                      <text
                        x={x}
                        y={topY - 10}
                        fill="#fafafa"
                        fontSize="10"
                        fontFamily="monospace"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {m.id}
                      </text>
                      <text
                        x={x}
                        y={topY - 22}
                        fill="#a1a1aa"
                        fontSize="8.5"
                        fontFamily="monospace"
                        textAnchor="middle"
                      >
                        GL:{groundLevel.toFixed(2)}m
                      </text>
                    </g>
                  )
                })}
              </svg>
            )}

            {activeView === 'plan' && planBounds && (
              <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${planBounds.width} ${planBounds.height}`}
                className="select-none"
              >
                {/* North Arrow */}
                <g transform="translate(800, 45)">
                  <circle cx="0" cy="0" r="18" fill="#18181b" stroke="#3f3f46" />
                  <path d="M 0 -12 L 5 4 L 0 1 L -5 4 Z" fill="#ef4444" />
                  <path d="M 0 12 L 5 4 L 0 1 L -5 4 Z" fill="#71717a" />
                  <text x="0" y="-14" fill="#ef4444" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="monospace">N</text>
                </g>

                {/* Coordinate Grid Lines */}
                {[0.2, 0.5, 0.8].map((pct, i) => {
                  const e = planBounds.vMinE + pct * (planBounds.vMaxE - planBounds.vMinE)
                  const x = planBounds.toPlanX(e)
                  return (
                    <g key={`egrid-${i}`}>
                      <line x1={x} y1="30" x2={x} y2={planBounds.height - 30} stroke="rgba(255,255,255,0.05)" />
                      <text x={x} y={planBounds.height - 15} fill="#52525b" fontSize="8" textAnchor="middle" fontFamily="monospace">
                        E {e.toFixed(0)}
                      </text>
                    </g>
                  )
                })}

                {/* Pipes in Plan View */}
                {results.map((p) => {
                  const mh1 = manholes.find((m) => m.id === p.fromId)
                  const mh2 = manholes.find((m) => m.id === p.toId)
                  if (!mh1 || !mh2) return null

                  const route = [
                    { easting: mh1.easting as number, northing: mh1.northing as number },
                    ...(p.alignmentVertices ?? []),
                    { easting: mh2.easting as number, northing: mh2.northing as number },
                  ]
                  const planPoints = route.map(point => `${planBounds.toPlanX(point.easting)},${planBounds.toPlanY(point.northing)}`).join(' ')
                  const start = route[0]
                  const next = route[1]
                  const x1 = planBounds.toPlanX(start.easting)
                  const y1 = planBounds.toPlanY(start.northing)
                  const x2 = planBounds.toPlanX(next.easting)
                  const y2 = planBounds.toPlanY(next.northing)
                  const midX = (x1 + x2) / 2
                  const midY = (y1 + y2) / 2
                  const labelPoint = pipeRouteMidpoint(route)
                  const labelX = planBounds.toPlanX(labelPoint.easting)
                  const labelY = planBounds.toPlanY(labelPoint.northing)
                  const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI)

                  return (
                    <g key={p.id}>
                      <polyline points={planPoints} fill="none" stroke="#06b6d4" strokeWidth="3" />
                      {/* Flow Arrow marker */}
                      <polygon
                        points="-6,-4 6,0 -6,4"
                        fill="#06b6d4"
                        transform={`translate(${midX},${midY}) rotate(${angle})`}
                      />
                      <text
                        x={labelX}
                        y={labelY - 10}
                        fill="#f4f4f5"
                        fontSize="9"
                        textAnchor="middle"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {p.id} (Ø{p.diameterMm}mm • L: {p.horizontalLengthM.toFixed(1)}m)
                      </text>
                    </g>
                  )
                })}

                {/* Manholes in Plan View */}
                {manholes.map((m) => {
                  const x = planBounds.toPlanX(m.easting as number)
                  const y = planBounds.toPlanY(m.northing as number)
                  const groundLevel = m.groundLevel as number

                  return (
                    <g key={m.id}>
                      <circle cx={x} cy={y} r="8" fill="#27272a" stroke="#06b6d4" strokeWidth="2" />
                      <circle cx={x} cy={y} r="2.5" fill="#facc15" />
                      <text
                        x={x}
                        y={y - 12}
                        fill="#fafafa"
                        fontSize="10"
                        fontFamily="monospace"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {m.id}
                      </text>
                      <text
                        x={x}
                        y={y + 19}
                        fill="#71717a"
                        fontSize="8.5"
                        fontFamily="monospace"
                        textAnchor="middle"
                      >
                        GL:{groundLevel.toFixed(2)}m
                      </text>
                    </g>
                  )
                })}
              </svg>
            )}

            {activeView === 'profile' && !profileBounds && (
              <div className="max-w-lg px-6 text-center text-sm text-zinc-400">
                {manholes.length === 0
                  ? 'Add surveyed manholes and a pipe run to see the longitudinal profile.'
                  : 'The profile needs surveyed ground and invert levels, manufacturer outside diameters, and one ordered unbranched run. The ground line between manholes is only a visual connection, not surveyed terrain.'}
              </div>
            )}
            {activeView === 'plan' && !planBounds && (
              <div className="max-w-lg px-6 text-center text-sm text-zinc-400">
                Add finite projected Easting and Northing values to the manholes to see the coordinate plan.
              </div>
            )}

            {/* View Legend */}
            <div className="absolute bottom-2 left-2 text-[10px] text-[var(--text-secondary)] bg-black/85 px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-3">
              {activeView === 'profile' ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-emerald-500" />
                    <span>Ground at manholes; connected for display only</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-2 bg-cyan-500/20 border border-cyan-400" />
                    <span>Pipe crown uses manufacturer outside diameter</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-2 bg-blue-500/60 border border-blue-400" />
                    <span>Uniform-flow depth estimate</span>
                  </div>
                  {pressurizedHglAssessment?.ok && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-orange-400" />
                      <span>Full-bore pressure HGL</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-zinc-700 border border-zinc-500" />
                    <span>Manhole Shaft</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-cyan-400" />
                    <span>Pipe Alignment</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-700 border border-cyan-400" />
                    <span>Manhole Junction</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-zinc-400 font-mono">Coordinates: {demoMode ? 'synthetic example' : projectCrs || 'CRS not supplied'}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {pressurizedHglAssessment && (
          <section aria-labelledby="pressurized-hgl-title" className="border border-orange-500/35 bg-[var(--bg-secondary)] rounded-2xl p-5 space-y-3">
            <div>
              <h2 id="pressurized-hgl-title" className="text-sm font-bold text-orange-200">Full-bore pressure energy profile</h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">Calculated upstream from the entered HGL at the downstream pipe outlet using full-pipe Manning friction and the engineer-entered junction K. This bounded check requires one unbranched route, one continuous flow, all reaches above their maximum free-surface capacity, positive invert fall, and HGL at or above each pipe crown. It does not derive tailwater, outlet/transition losses, mixed-flow transitions, transient surcharge, or standards compliance.</p>
            </div>
            {!pressurizedHglAssessment.ok ? (
              <div role="status" className="rounded-xl border border-amber-500/35 bg-amber-950/20 p-3 text-xs text-amber-100">{pressurizedHglAssessment.message}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[760px] w-full text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="py-2 pr-3">Pipe</th><th className="py-2 pr-3">Velocity</th><th className="py-2 pr-3">Friction loss</th>
                      <th className="py-2 pr-3">Upstream HGL</th><th className="py-2 pr-3">Downstream HGL</th><th className="py-2 pr-3">Crown margin</th><th className="py-2">Ground check at manholes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pressurizedHglAssessment.reaches.map(reach => {
                      const surchargeM = Math.max(
                        reach.upstreamGroundM === undefined ? 0 : reach.upstreamHglM - reach.upstreamGroundM,
                        reach.downstreamGroundM === undefined ? 0 : reach.downstreamHglM - reach.downstreamGroundM,
                      )
                      const crownMarginM = Math.min(reach.upstreamHglM - reach.upstreamCrownM, reach.downstreamHglM - reach.downstreamCrownM)
                      return (
                        <tr key={reach.pipeId} className="border-t border-white/5 font-mono">
                          <td className="py-2 pr-3 font-bold text-[var(--text-primary)]">{reach.pipeId}</td>
                          <td className="py-2 pr-3">{reach.velocityMps.toFixed(3)} m/s</td>
                          <td className="py-2 pr-3">{reach.frictionLossM.toFixed(3)} m</td>
                          <td className="py-2 pr-3 text-orange-200">{reach.upstreamHglM.toFixed(3)} m</td>
                          <td className="py-2 pr-3 text-orange-200">{reach.downstreamHglM.toFixed(3)} m</td>
                          <td className="py-2 pr-3">{crownMarginM.toFixed(3)} m</td>
                          <td className={surchargeM > 0 ? 'py-2 text-red-300' : 'py-2 text-emerald-300'}>{surchargeM > 0 ? `${surchargeM.toFixed(3)} m above entered ground RL` : 'Below entered ground RL at ends'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <p className="mt-2 text-[10px] text-zinc-500">Ground comparison uses entered manhole ground levels only; terrain between manholes is not surveyed by this calculation. Review every boundary and loss assumption before design or field use.</p>
              </div>
            )}
          </section>
        )}

        {/* Rational Runoff Hydrology Calculator Drawer/Modal */}
        {showRunoffCalc && (
          <div className="border border-cyan-500/40 bg-[var(--bg-secondary)] rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <div className="flex items-center gap-2">
                <Droplets className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold">Rational Method Storm Runoff Calculator (Q = CIA / 360)</h3>
              </div>
              <button
                onClick={() => setShowRunoffCalc(false)}
                className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded-lg border border-white/10"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Surface Catchment Type (C):</label>
                <select
                  value={runoffPresetKey}
                  onChange={(e) => {
                    setRunoffPresetKey(e.target.value)
                    const p = RUNOFF_PRESETS[e.target.value]
                    setCustomC(p?.c ?? null)
                  }}
                  className="w-full bg-black/30 border border-[var(--border-color)] rounded-xl px-2.5 py-1.5 text-xs font-medium"
                >
                  <option value="" className="bg-[var(--bg-secondary)]">Select a surface preset</option>
                  {Object.entries(RUNOFF_PRESETS).map(([k, v]) => (
                    <option key={k} value={k} className="bg-[var(--bg-secondary)]">
                      {v.label} (C = {v.c})
                    </option>
                  ))}
                </select>
                <label className="text-zinc-400 block mt-2 mb-1">Runoff coefficient C (verify for this site):</label>
                <input type="number" min="0" max="1" step="0.01" value={customC ?? ''} onChange={e => setCustomC(e.target.value === '' ? null : Number(e.target.value))} className="w-full bg-black/30 border border-[var(--border-color)] rounded-xl px-2.5 py-1.5 text-xs font-mono" />
                <div className="text-[10px] text-zinc-500 mt-1">Illustrative surface presets only; confirm coefficient and rainfall for this project. {RUNOFF_PRESETS[runoffPresetKey]?.desc}</div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Approved design rainfall intensity (I, mm/hr):</label>
                <input
                  type="number"
                  value={stormIntensity}
                  onChange={(e) => setStormIntensity(parseFloat(e.target.value) || 0)}
                  className="w-full bg-black/30 border border-[var(--border-color)] rounded-xl px-2.5 py-1.5 text-xs font-mono"
                />
                <div className="text-[10px] text-zinc-500 mt-1">Enter intensity from the project storm analysis.</div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Contributing catchment area (A, hectares):</label>
                <input
                  type="number"
                  step="0.05"
                  value={catchmentArea}
                  onChange={(e) => setCatchmentArea(parseFloat(e.target.value) || 0)}
                  className="w-full bg-black/30 border border-[var(--border-color)] rounded-xl px-2.5 py-1.5 text-xs font-mono"
                />
                <div className="text-[10px] text-zinc-500 mt-1">1 Ha = 10,000 m²</div>
              </div>

              <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-3 flex flex-col justify-between">
                <div>
                  <div className="text-[10px] text-cyan-300 font-bold uppercase">Computed Storm Discharge (Q)</div>
                  {calculatedRunoff ? (
                    <>
                      <div className="text-xl font-bold font-mono text-cyan-400">{calculatedRunoff.flowLs.toFixed(1)} L/s</div>
                      <div className="text-[10px] text-zinc-400 font-mono">({calculatedRunoff.flowM3s.toFixed(3)} m³/s)</div>
                    </>
                  ) : <p className="text-xs text-amber-300">Enter a coefficient from 0 to 1 and positive rainfall and area.</p>}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <select
                    value={targetPipeForRunoff}
                    onChange={(e) => setTargetPipeForRunoff(e.target.value)}
                    className="bg-black/40 border border-cyan-500/40 rounded-lg px-2 py-1 text-[11px] font-mono text-white flex-1"
                  >
                    <option value="">Select Pipe...</option>
                    {pipes.map((p) => (
                      <option key={p.id} value={p.id} className="bg-[var(--bg-secondary)]">
                        {p.id} ({p.fromId}→{p.toId})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleApplyRunoff}
                    disabled={!targetPipeForRunoff || !calculatedRunoff}
                    className="py-1 px-2.5 rounded-lg bg-cyan-400 text-black font-bold text-xs disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Auto-Grade Inverts Modal */}
        {showAutoGradeModal && (
          <div className="border border-purple-500/40 bg-[var(--bg-secondary)] rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm font-bold">Auto-Grade Invert Levels (Continuous Positive Gravity Slope)</h3>
              </div>
              <button
                onClick={() => setShowAutoGradeModal(false)}
                className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded-lg border border-white/10"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Target design slope from approved profile (%):</label>
                <input
                  type="number"
                  step="0.1"
                  value={targetSlopePct}
                  onChange={(e) => setTargetSlopePct(e.target.value)}
                  className="w-full bg-black/30 border border-[var(--border-color)] rounded-xl px-2.5 py-1.5 text-xs font-mono"
                />
                <div className="text-[10px] text-zinc-500 mt-1">No default is applied; enter the approved design value.</div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Project minimum crown cover (m):</label>
                <input
                  type="number"
                  step="0.1"
                  value={coverRequirementText}
                  onChange={(e) => setCoverRequirementText(e.target.value)}
                  className="w-full bg-black/30 border border-[var(--border-color)] rounded-xl px-2.5 py-1.5 text-xs font-mono"
                />
                <div className="text-[10px] text-zinc-500 mt-1">Enter the requirement from the approved project specification.</div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Manhole invert drop (mm):</label>
                <input
                  type="number"
                  value={mhDropStepMm}
                  onChange={(e) => setMhDropStepMm(e.target.value)}
                  className="w-full bg-black/30 border border-[var(--border-color)] rounded-xl px-2.5 py-1.5 text-xs font-mono"
                />
                <div className="text-[10px] text-zinc-500 mt-1">Enter the junction drop required by the design.</div>
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Starting invert out RL (m, optional):</label>
                <input type="number" step="0.001" value={startInvertText} onChange={e => setStartInvertText(e.target.value)} placeholder="Derive from first GL" className="w-full bg-black/30 border border-[var(--border-color)] rounded-xl px-2.5 py-1.5 text-xs font-mono" />
                <div className="text-[10px] text-zinc-500 mt-1">Blank derives it from the first surveyed ground RL, entered crown-cover criterion, and first pipe diameter.</div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-color)]">
              <button
                onClick={() => setShowAutoGradeModal(false)}
                className="py-1.5 px-3 rounded-xl border border-[var(--border-color)] text-xs text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteAutoGrade}
                disabled={!canAutoGrade}
                className="py-1.5 px-4 rounded-xl bg-purple-500 hover:bg-purple-400 text-black font-bold text-xs shadow"
              >
                Calculate &amp; Apply Inverts
              </button>
            </div>
          </div>
        )}

        {/* 2-Column Tables: Manholes on Left (5 cols), Pipes & Hydraulics on Right (7 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Manholes Manager & Drop Checks */}
          <div className="lg:col-span-5 border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Layers className="w-4 h-4 text-[var(--accent)]" />
                Manholes ({manholes.length})
              </h3>
              <button
                onClick={addManhole}
                className="py-1 px-2.5 rounded-lg bg-[var(--accent)] text-black text-xs font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add MH
              </button>
            </div>

            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              {manholes.map((mh, idx) => {
                const dropInfo = dropAnalyses.find((d) => d.manholeId === mh.id)

                return (
                  <div
                    key={mh.id}
                    className="p-3 rounded-xl border border-[var(--border-color)] bg-black/20 space-y-2 text-xs"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={mh.id}
                          onChange={(e) => updateManhole(idx, 'id', e.target.value)}
                          className="font-mono font-bold text-sm bg-transparent text-[var(--accent)] focus:outline-none w-24"
                        />
                        {dropInfo?.type === 'Positive Step' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                            Positive invert step ({(dropInfo.dropM * 1000).toFixed(0)}mm)
                          </span>
                        )}
                        {dropInfo?.type === 'Adverse Step' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                            Adverse Sump!
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => removeManhole(idx)}
                        className="text-red-400 hover:text-red-300 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-zinc-500">Easting (m):</span>
                        <input
                          type="number"
                          step="0.1"
                          value={mh.easting ?? ''}
                          placeholder="Surveyed E"
                          onChange={(e) => updateManhole(idx, 'easting', e.target.value === '' ? undefined : Number(e.target.value))}
                          className="w-full bg-transparent font-mono focus:outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-zinc-500">Northing (m):</span>
                        <input
                          type="number"
                          step="0.1"
                          value={mh.northing ?? ''}
                          placeholder="Surveyed N"
                          onChange={(e) => updateManhole(idx, 'northing', e.target.value === '' ? undefined : Number(e.target.value))}
                          className="w-full bg-transparent font-mono focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[11px] pt-1 border-t border-[var(--border-color)]/40">
                      <div>
                        <span className="text-zinc-500">Ground (GL):</span>
                        <input
                          type="number"
                          step="0.01"
                          value={mh.groundLevel ?? ''}
                          placeholder="Surveyed/design GL"
                          onChange={(e) => updateManhole(idx, 'groundLevel', e.target.value === '' ? undefined : Number(e.target.value))}
                          className="w-full bg-transparent font-mono focus:outline-none font-semibold text-emerald-400"
                        />
                      </div>
                      <div>
                        <span className="text-zinc-500">Invert In:</span>
                        <input
                          type="number"
                          step="0.01"
                          value={mh.invertIn ?? ''}
                          placeholder="Measured/design invert in"
                          onChange={(e) => updateManhole(idx, 'invertIn', e.target.value === '' ? undefined : Number(e.target.value))}
                          className="w-full bg-transparent font-mono focus:outline-none text-cyan-400"
                        />
                      </div>
                      <div>
                        <span className="text-zinc-500">Invert Out:</span>
                        <input
                          type="number"
                          step="0.01"
                          value={mh.invertOut ?? ''}
                          placeholder="Measured/design invert out"
                          onChange={(e) => updateManhole(idx, 'invertOut', e.target.value === '' ? undefined : Number(e.target.value))}
                          className="w-full bg-transparent font-mono focus:outline-none text-cyan-400"
                        />
                      </div>
                    </div>
                    {idx > 0 && idx < manholes.length - 1 && (
                      <label className="block text-[11px] text-zinc-400">
                        Junction loss coefficient K (engineer supplied; downstream-pipe velocity basis)
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={mh.junctionLossK ?? ''}
                          placeholder="Required for full-bore HGL"
                          onChange={(e) => updateManhole(idx, 'junctionLossK', e.target.value === '' ? undefined : Number(e.target.value))}
                          className="mt-1 w-full bg-transparent border border-[var(--border-color)] rounded px-2 py-1.5 font-mono text-[var(--text-primary)]"
                        />
                        <span className="block mt-1 text-[10px] text-zinc-500">No default is assumed. Select K from the approved junction method; this solver uses h = K × V²/(2g) with the downstream pipe velocity.</span>
                      </label>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right Column: Pipes & Hydraulic Results */}
          <div className="lg:col-span-7 border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Activity className="w-4 h-4 text-[var(--accent)]" />
                Pipe Segments, Partial Hydraulics &amp; Cover ({pipes.length})
              </h3>
              <button
                onClick={addPipe}
                disabled={manholes.length < 2}
                title={manholes.length < 2 ? 'Add at least two manholes first' : undefined}
                className="py-1 px-2.5 rounded-lg bg-[var(--accent)] text-black text-xs font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Pipe
              </button>
            </div>

            <div className="space-y-3.5 max-h-[500px] overflow-y-auto pr-1">
              {!calculationReady && pipes.map((pipe, idx) => (
                <div key={pipe.id} className="p-3 rounded-xl border border-amber-500/30 bg-black/20 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <strong className="font-mono text-[var(--accent)]">{pipe.id} · inputs required</strong>
                    <button type="button" onClick={() => removePipe(idx)} aria-label={`Remove ${pipe.id}`} className="text-red-400 hover:text-red-300 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-zinc-400">Upstream manhole
                      <select value={pipe.fromId} onChange={e => updatePipe(idx, 'fromId', e.target.value)} className="mt-1 w-full bg-black/30 border border-[var(--border-color)] rounded px-2 py-1.5 text-white">
                        <option value="">Select manhole</option>{manholes.map(mh => <option key={mh.id} value={mh.id}>{mh.id}</option>)}
                      </select>
                    </label>
                    <label className="text-zinc-400">Downstream manhole
                      <select value={pipe.toId} onChange={e => updatePipe(idx, 'toId', e.target.value)} className="mt-1 w-full bg-black/30 border border-[var(--border-color)] rounded px-2 py-1.5 text-white">
                        <option value="">Select manhole</option>{manholes.map(mh => <option key={mh.id} value={mh.id}>{mh.id}</option>)}
                      </select>
                    </label>
                    <label className="text-zinc-400">Hydraulic internal diameter (mm)
                      <input type="number" min="0.001" step="0.001" value={pipe.diameterMm || ''} placeholder="Supplier bore" onChange={e => updatePipe(idx, 'diameterMm', e.target.value === '' ? 0 : Number(e.target.value))} className="mt-1 w-full bg-black/30 border border-[var(--border-color)] rounded px-2 py-1.5 text-white" />
                    </label>
                    <label className="text-zinc-400">Manufacturer outside diameter (mm)
                      <input type="number" min="0.001" step="0.001" value={pipe.outsideDiameterMm ?? ''} placeholder="Supplier OD" onChange={e => updatePipe(idx, 'outsideDiameterMm', e.target.value === '' ? undefined : Number(e.target.value))} className="mt-1 w-full bg-black/30 border border-[var(--border-color)] rounded px-2 py-1.5 text-white" />
                    </label>
                    <label className="text-zinc-400">Material
                      <select value={pipe.material} onChange={e => updatePipe(idx, 'material', e.target.value as Pipe['material'])} className="mt-1 w-full bg-black/30 border border-[var(--border-color)] rounded px-2 py-1.5 text-white">
                        {Object.keys(MANNING_N).map(material => <option key={material} value={material}>{material}</option>)}
                      </select>
                    </label>
                    <label className="text-zinc-400">Manning n (preset shown; verify)
                      <input type="number" min="0.000001" step="0.001" value={pipe.manningN ?? MANNING_N[pipe.material]} onChange={e => updatePipe(idx, 'manningN', e.target.value === '' ? undefined : Number(e.target.value))} className="mt-1 w-full bg-black/30 border border-[var(--border-color)] rounded px-2 py-1.5 font-mono text-white" />
                    </label>
                    <label className="text-zinc-400 col-span-2">Design flow (L/s)
                      <input type="number" min="0" step="0.1" value={pipe.designFlowLs || ''} placeholder="Enter approved design flow" onChange={e => updatePipe(idx, 'designFlowLs', e.target.value === '' ? 0 : Number(e.target.value))} className="mt-1 w-full bg-black/30 border border-[var(--border-color)] rounded px-2 py-1.5 font-mono text-white" />
                    </label>
                    {renderAlignmentEditor(pipe)}
                  </div>
                </div>
              ))}
              {pipes.length === 0 && <p className="text-xs text-zinc-500">Add at least two manholes, then add a pipe segment. No example geometry or design flow is inserted.</p>}
              {results.map((p, idx) => (
                <div
                  key={p.id}
                  className="p-3.5 rounded-xl border border-[var(--border-color)] bg-black/20 space-y-2.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-sm text-[var(--text-primary)]">{p.id}</span>
                      <label className="sr-only" htmlFor={`pipe-${idx}-from`}>Upstream manhole</label>
                      <select id={`pipe-${idx}-from`} value={p.fromId} onChange={e => updatePipe(idx, 'fromId', e.target.value)} className="bg-black/30 border border-[var(--border-color)] rounded px-2 py-1 text-[10px] text-white">
                        {manholes.map(mh => <option key={mh.id} value={mh.id}>{mh.id}</option>)}
                      </select>
                      <ArrowRight className="w-3 h-3 text-zinc-500" />
                      <label className="sr-only" htmlFor={`pipe-${idx}-to`}>Downstream manhole</label>
                      <select id={`pipe-${idx}-to`} value={p.toId} onChange={e => updatePipe(idx, 'toId', e.target.value)} className="bg-black/30 border border-[var(--border-color)] rounded px-2 py-1 text-[10px] text-white">
                        {manholes.map(mh => <option key={mh.id} value={mh.id}>{mh.id}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {/* Hydraulic Status Badge */}
                        {p.status === 'Within Screening Range' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          Within screening range
                        </span>
                      )}
                      {p.status === 'Outside Screening Range' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                          Velocity outside 0.75–3.00 m/s screen
                        </span>
                      )}
                      {p.status === 'Near-Crown Free-Surface Flow' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Above full-bore rate; near-crown free-surface flow
                        </span>
                      )}
                      {p.status === 'Open-Channel Capacity Exceeded' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          Exceeds open-channel capacity; pressure-flow analysis required
                        </span>
                      )}

                      {/* Cover Depth Status Badge */}
                      {p.cover.status === 'Below Criterion' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
                          Below entered cover criterion ({p.cover.minCover?.toFixed(2)}m)
                        </span>
                      )}
                      {p.cover.status === 'Daylight' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600/30 text-red-300 border border-red-500">
                          Daylight Hazard!
                        </span>
                      )}
                      {p.cover.status === 'Not Assessed' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-500/20 text-zinc-300 border border-zinc-500/30" title={p.cover.message}>
                          Cover not assessed
                        </span>
                      )}

                      <button
                        onClick={() => removePipe(idx)}
                        className="text-red-400 hover:text-red-300 p-1 ml-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-[11px]">
                    <div>
                      <label className="text-zinc-500 block">Hydraulic internal diameter (mm):
                        <input type="number" min="0.001" step="0.001" value={p.diameterMm || ''} onChange={e => updatePipe(idx, 'diameterMm', e.target.value === '' ? 0 : Number(e.target.value))} className="w-full bg-transparent border border-[var(--border-color)] rounded px-1.5 py-0.5 text-xs font-mono font-semibold" />
                      </label>
                    </div>
                    <div>
                      <label className="text-zinc-500 block">Manufacturer outside diameter (mm):
                        <input type="number" min="0.001" step="0.001" value={p.outsideDiameterMm ?? ''} onChange={e => updatePipe(idx, 'outsideDiameterMm', e.target.value === '' ? undefined : Number(e.target.value))} className="w-full bg-transparent border border-[var(--border-color)] rounded px-1.5 py-0.5 text-xs font-mono font-semibold" />
                      </label>
                    </div>

                    <div>
                      <span className="text-zinc-500 block">Material:</span>
                      <select
                        value={p.material}
                        onChange={(e) => updatePipe(idx, 'material', e.target.value as Pipe['material'])}
                        className="w-full bg-transparent border border-[var(--border-color)] rounded px-1.5 py-0.5 text-xs"
                      >
                        <option value="Concrete" className="bg-[var(--bg-secondary)]">Concrete</option>
                        <option value="HDPE" className="bg-[var(--bg-secondary)]">HDPE</option>
                        <option value="uPVC" className="bg-[var(--bg-secondary)]">uPVC</option>
                        <option value="Corrugated Metal" className="bg-[var(--bg-secondary)]">Corrugated metal</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-zinc-500 block">Manning n (default preset; verify):
                        <input type="number" min="0.000001" step="0.001" value={p.manningN ?? MANNING_N[p.material]} onChange={e => updatePipe(idx, 'manningN', e.target.value === '' ? undefined : Number(e.target.value))} className="w-full bg-transparent border border-[var(--border-color)] rounded px-1.5 py-0.5 text-xs font-mono" />
                      </label>
                    </div>

                    <div>
                      <label htmlFor={`pipe-result-${idx}-design-flow`} className="text-zinc-500 block">Design flow (L/s):</label>
                      <input
                        id={`pipe-result-${idx}-design-flow`}
                        type="number"
                        min="0"
                        step="0.1"
                        value={p.designFlowLs || ''}
                        placeholder="Design Q"
                        onChange={(e) => updatePipe(idx, 'designFlowLs', e.target.value === '' ? 0 : Number(e.target.value))}
                        className="w-full bg-transparent border border-[var(--border-color)] rounded px-1.5 py-0.5 text-xs font-mono font-semibold text-cyan-400"
                      />
                    </div>

                    <div>
                      <span className="text-zinc-500 block">Full-bore capacity (L/s):</span>
                      <div className="font-mono font-bold text-xs py-0.5 text-zinc-300">
                        {p.capacityLs.toFixed(1)} L/s
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        Open-channel maximum: {p.partial.maxFreeSurfaceCapacityLs.toFixed(1)} L/s
                      </div>
                    </div>
                    {renderAlignmentEditor(p)}
                  </div>

                  {/* Partial Flow & Hydraulic Elements Row */}
                  <div className="p-2.5 rounded-lg bg-black/30 border border-white/5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
                    <div>
                      <span className="text-zinc-500 block">Flow Depth (d/D):</span>
                      <span className="text-cyan-400 font-bold">
                        {p.partial.flowCondition === 'Free surface'
                          ? `${p.partial.flowDepthMm}mm (${(p.partial.depthRatio * 100).toFixed(0)}%)`
                          : 'Not solved under pressure'}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block">
                        {p.partial.flowCondition === 'Free surface' ? 'Actual Velocity:' : 'Full-area mean velocity:'}
                      </span>
                      <span className={p.partial.flowCondition === 'Pressure flow analysis required'
                        ? 'text-zinc-300 font-bold'
                        : p.status === 'Outside Screening Range' || p.status === 'Near-Crown Free-Surface Flow'
                          ? 'text-amber-400 font-bold'
                          : 'text-emerald-400 font-bold'}>
                        {p.partial.actualVelocity.toFixed(2)} m/s
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block">Froude (Regime):</span>
                      <span className="text-zinc-300">
                        {p.partial.froudeNumber === null
                          ? 'Not assessed; pressure flow'
                          : `Fr=${p.partial.froudeNumber.toFixed(2)} (${p.partial.regime})`}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block">Minimum crown cover:</span>
                      <span className={p.cover.status === 'Below Criterion' || p.cover.status === 'Daylight' ? 'text-orange-400 font-bold' : p.cover.status === 'Not Assessed' ? 'text-amber-300' : 'text-zinc-300'}>
                        {p.cover.minCover === undefined ? 'Not assessed' : `${p.cover.minCover.toFixed(2)} m`}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-[var(--border-color)]/50 font-mono">
                    <span>Plan length: {p.horizontalLengthM.toFixed(1)}m</span>
                    <span>Slope: {p.slopePercent.toFixed(2)}% ({p.slope.toFixed(4)} m/m)</span>
                    <span>Manning n={p.manningN ?? MANNING_N[p.material]} (verify against product/design)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

