'use client'

import { useEffect, useState } from 'react'
import { MANNING_N } from '@/lib/engineering/drainageDesign'
import { calculateProjectDrainageRuns } from '@/lib/engineering/projectDrainageEngine'
import {
  formatDrainageAlignmentVertices,
  orientDrainageMapAlignment,
  parseDrainageAlignmentVertices,
  type DrainageAlignmentVertex,
  type DrainageMapAlignmentSource,
} from '@/lib/engineering/drainageAlignment'
import type { ProjectMapDrainageAlignment } from '@/lib/engineering/projectMapDrainageAlignments'
import { resolveEpsg } from '@/lib/spatial/projectCrs'
import {
  EMPTY_SETOUT_TOLERANCE_PROFILE,
  type SetoutToleranceProfileDraft,
} from '@/lib/engineering/setoutToleranceProfile'
import { SetoutToleranceProfileFields } from '@/components/field/SetoutToleranceProfileFields'
import type { DrainageData, Manhole, PipeMaterial } from '@/types/engineering'

const materialRoughness: Record<PipeMaterial, number> = {
  Concrete: MANNING_N['Concrete pipe'],
  HDPE: MANNING_N.HDPE,
  uPVC: MANNING_N.uPVC,
  VCP: MANNING_N.VCP,
}

function optionalNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function projectCrsMatches(first: string, second: string): boolean {
  try {
    return resolveEpsg(first).code === resolveEpsg(second).code
  } catch {
    return false
  }
}

/** Survey inputs and pipe properties for a single ordered drainage run. */
export function DrainageStep1Manholes({
  data,
  projectId,
  onSave,
}: {
  data: DrainageData | null
  projectId?: string
  onSave: (manholes: Manhole[], settings: Pick<DrainageData, 'projectCrs' | 'minimumCoverM' | 'setoutIntervalM' | 'setoutStartChainageM' | 'setoutToleranceProfile'>) => void | Promise<boolean>
}) {
  const [manholes, setManholes] = useState<Manhole[]>(data?.manholes || [])
  const [alignmentTexts, setAlignmentTexts] = useState<string[]>(() => (data?.manholes || []).map(manhole => formatDrainageAlignmentVertices(manhole.alignmentVerticesOut)))
  const [projectCrs, setProjectCrs] = useState(data?.projectCrs || '')
  const [minimumCoverText, setMinimumCoverText] = useState(data?.minimumCoverM === undefined ? '' : String(data.minimumCoverM))
  const [setoutIntervalText, setSetoutIntervalText] = useState(data?.setoutIntervalM === undefined ? '' : String(data.setoutIntervalM))
  const [setoutStartChainageText, setSetoutStartChainageText] = useState(data?.setoutStartChainageM === undefined ? '' : String(data.setoutStartChainageM))
  const [setoutToleranceProfile, setSetoutToleranceProfile] = useState<SetoutToleranceProfileDraft>(data?.setoutToleranceProfile ?? EMPTY_SETOUT_TOLERANCE_PROFILE)
  const [saveIssues, setSaveIssues] = useState<string[]>([])
  const [projectMapAlignments, setProjectMapAlignments] = useState<ProjectMapDrainageAlignment[]>([])
  const [declaredProjectCrs, setDeclaredProjectCrs] = useState<string | null>(null)
  const [mapAlignmentWarnings, setMapAlignmentWarnings] = useState<string[]>([])
  const [mapAlignmentLoadError, setMapAlignmentLoadError] = useState<string | null>(null)
  const [mapAlignmentLoading, setMapAlignmentLoading] = useState(false)
  const [mapAlignmentSelectionError, setMapAlignmentSelectionError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const markEdited = () => {
    setSaveIssues([])
    setSaved(false)
    setSaveError(null)
  }

  useEffect(() => {
    setManholes(data?.manholes || [])
    setAlignmentTexts((data?.manholes || []).map(manhole => formatDrainageAlignmentVertices(manhole.alignmentVerticesOut)))
    setProjectCrs(data?.projectCrs || '')
    setMinimumCoverText(data?.minimumCoverM === undefined ? '' : String(data.minimumCoverM))
    setSetoutIntervalText(data?.setoutIntervalM === undefined ? '' : String(data.setoutIntervalM))
    setSetoutStartChainageText(data?.setoutStartChainageM === undefined ? '' : String(data.setoutStartChainageM))
    setSetoutToleranceProfile(data?.setoutToleranceProfile ?? EMPTY_SETOUT_TOLERANCE_PROFILE)
  }, [data])

  useEffect(() => {
    if (!projectId) return
    const controller = new AbortController()
    let active = true
    setMapAlignmentLoading(true)
    setMapAlignmentLoadError(null)
    void fetch(`/api/project/${encodeURIComponent(projectId)}/drainage-alignments`, { signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => ({})) as Record<string, unknown>
        if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Could not load saved project map lines.')
        if (typeof payload.projectCrs !== 'string' || !Array.isArray(payload.alignments)) {
          throw new Error('The saved project map-line response was incomplete.')
        }
        const validAlignments = payload.alignments.filter((value): value is ProjectMapDrainageAlignment => {
          if (!value || typeof value !== 'object') return false
          const candidate = value as Partial<ProjectMapDrainageAlignment>
          return typeof candidate.featureKey === 'string'
            && typeof candidate.label === 'string'
            && candidate.sourceCrs === 'EPSG:4326'
            && candidate.projectCrs === payload.projectCrs
            && Array.isArray(candidate.vertices)
            && candidate.vertices.length >= 2
            && candidate.vertices.every(vertex => Number.isFinite(vertex?.easting) && Number.isFinite(vertex?.northing))
        })
        if (active) {
          setProjectMapAlignments(validAlignments)
          setDeclaredProjectCrs(payload.projectCrs)
          setMapAlignmentWarnings(Array.isArray(payload.warnings)
            ? payload.warnings.filter((warning): warning is string => typeof warning === 'string')
            : [])
          setProjectCrs(current => current.trim() ? current : payload.projectCrs as string)
        }
      })
      .catch(error => {
        if (!active || (error instanceof DOMException && error.name === 'AbortError')) return
        setProjectMapAlignments([])
        setMapAlignmentLoadError(error instanceof Error ? error.message : 'Could not load saved project map lines.')
      })
      .finally(() => {
        if (active) setMapAlignmentLoading(false)
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [projectId])

  const updateManhole = (index: number, field: keyof Manhole, value: Manhole[keyof Manhole]) => {
    setManholes(current => current.map((manhole, i) => i === index ? { ...manhole, [field]: value } : manhole))
    markEdited()
  }

  const selectProjectMapAlignment = (index: number, featureKey: string) => {
    setMapAlignmentSelectionError(null)
    if (!featureKey) {
      setManholes(current => current.map((manhole, itemIndex) => {
        if (itemIndex !== index) return manhole
        const { alignmentVerticesOut: _vertices, alignmentSourceOut: _source, ...withoutAlignment } = manhole
        return withoutAlignment
      }))
      setAlignmentTexts(current => current.map((text, itemIndex) => itemIndex === index ? '' : text))
      markEdited()
      return
    }
    const selected = projectMapAlignments.find(alignment => alignment.featureKey === featureKey)
    if (!selected) {
      setMapAlignmentSelectionError('That saved map line is no longer available. Reload the project map lines and select a current line.')
      return
    }
    let enteredCrs: string
    try {
      enteredCrs = resolveEpsg(projectCrs).code
    } catch (error) {
      setMapAlignmentSelectionError(error instanceof Error ? error.message : 'Enter a supported projected project CRS first.')
      return
    }
    if (enteredCrs !== selected.projectCrs || (declaredProjectCrs && enteredCrs !== declaredProjectCrs)) {
      setMapAlignmentSelectionError(`The saved map line is transformed to ${selected.projectCrs}. Reconcile the drainage CRS with the project's declared CRS before using it.`)
      return
    }
    const downstream = manholes[index + 1]
    const upstream = manholes[index]
    if (!downstream || !Number.isFinite(upstream?.easting) || !Number.isFinite(upstream?.northing)
      || !Number.isFinite(downstream.easting) || !Number.isFinite(downstream.northing)) {
      setMapAlignmentSelectionError('Enter both manhole Easting and Northing values before importing a map line; endpoint connectors are part of the route.')
      return
    }

    try {
      const start: DrainageAlignmentVertex = { easting: upstream.easting as number, northing: upstream.northing as number }
      const end: DrainageAlignmentVertex = { easting: downstream.easting as number, northing: downstream.northing as number }
      const oriented = orientDrainageMapAlignment(selected.vertices, start, end)
      const alignmentSourceOut: DrainageMapAlignmentSource = {
        kind: 'saved_project_map_line',
        featureKey: selected.featureKey,
        label: selected.label,
        sourceCrs: selected.sourceCrs,
        projectCrs: selected.projectCrs,
        orientation: oriented.orientation,
        startConnectorM: oriented.startConnectorM,
        endConnectorM: oriented.endConnectorM,
      }
      setManholes(current => current.map((manhole, itemIndex) => itemIndex === index
        ? { ...manhole, alignmentVerticesOut: oriented.vertices, alignmentSourceOut }
        : manhole))
      setAlignmentTexts(current => current.map((text, itemIndex) => itemIndex === index
        ? formatDrainageAlignmentVertices(oriented.vertices)
        : text))
      markEdited()
    } catch (error) {
      setMapAlignmentSelectionError(error instanceof Error ? error.message : 'Could not orient the saved map line between these manholes.')
    }
  }

  const declaredCrsMatches = !declaredProjectCrs || projectCrsMatches(projectCrs, declaredProjectCrs)

  const addManhole = () => {
    setManholes(current => {
      let nextNumber = current.length + 1
      while (current.some(manhole => manhole.id === `MH${nextNumber}`)) nextNumber += 1
      return [...current, { id: `MH${nextNumber}`, name: `MH${nextNumber}` }]
    })
    setAlignmentTexts(current => [...current, ''])
    markEdited()
  }

  const removeManhole = (index: number) => {
    setManholes(current => current.filter((_, i) => i !== index))
    setAlignmentTexts(current => current.filter((_, i) => i !== index))
    markEdited()
  }

  const handleSave = async () => {
    const parsedAlignments = alignmentTexts.map(parseDrainageAlignmentVertices)
    const alignmentParseIssues = parsedAlignments.flatMap((result, index) =>
      result.issues.map(issue => `Pipe after ${manholes[index]?.name || `Manhole ${index + 1}`}: ${issue}`),
    )
    if (alignmentParseIssues.length > 0) {
      setSaveIssues([...new Set(alignmentParseIssues)])
      setSaved(false)
      setSaveError(null)
      return
    }
    const savedManholes = manholes.map((manhole, index) => {
      const { alignmentVerticesOut: _oldVertices, ...withoutOldVertices } = manhole
      const alignmentVerticesOut = parsedAlignments[index]?.vertices ?? []
      return alignmentVerticesOut.length > 0 ? { ...withoutOldVertices, alignmentVerticesOut } : withoutOldVertices
    })
    const issues = calculateProjectDrainageRuns(savedManholes).issues
    savedManholes.forEach((manhole, index) => {
      const label = manhole.name || `Manhole ${index + 1}`
      if (!Number.isFinite(manhole.coverLevel)) issues.push(`${label}: enter its surveyed/design cover top RL.`)
      if (Number.isFinite(manhole.coverLevel) && Number.isFinite(manhole.invertLevelIn) && (manhole.coverLevel as number) <= (manhole.invertLevelIn as number)) {
        issues.push(`${label}: cover top RL must be above the incoming invert to produce a positive shaft depth.`)
      }
      if (Number.isFinite(manhole.coverLevel) && Number.isFinite(manhole.invertLevelOut) && (manhole.coverLevel as number) <= (manhole.invertLevelOut as number)) {
        issues.push(`${label}: cover top RL must be above the outgoing invert to produce a positive shaft depth.`)
      }
    })
    const uniqueIssues = [...new Set(issues)]
    setSaveIssues(uniqueIssues)
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      const result = await onSave(savedManholes, {
        projectCrs: projectCrs.trim() || undefined,
        minimumCoverM: optionalNumber(minimumCoverText),
        setoutIntervalM: optionalNumber(setoutIntervalText),
        setoutStartChainageM: optionalNumber(setoutStartChainageText),
        setoutToleranceProfile,
      })
      if (result === false) {
        setSaveError('METARDU could not save these inputs. Check the connection and try again.')
        return
      }
      setSaved(true)
    } catch {
      setSaveError('METARDU could not save these inputs. Check the connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-1 text-lg font-semibold text-white">Manholes and survey inputs</h3>
        <p className="text-sm text-zinc-400">Enter surveyed chainage, projected coordinates, cover-top RL, pipe inverts and product dimensions. Outgoing pipe properties and optional alignment vertices belong to the run starting at that manhole. Blank fields remain unset; no spacing or levels are assumed.</p>
      </div>

      <section className="grid grid-cols-1 gap-3 rounded-lg border border-zinc-700 bg-zinc-900/50 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor="drainage-project-crs" className="mb-1 block text-xs text-zinc-400">Project CRS for coordinates</label>
          <input id="drainage-project-crs" value={projectCrs} onChange={event => { setProjectCrs(event.target.value); markEdited() }} disabled={saving} placeholder="EPSG:21037" className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white" />
          <p className="mt-1 text-[11px] text-zinc-500">Use the project’s declared projected CRS in metres. Manhole coordinates you enter are used as entered; saved map lines are transformed from WGS84 and flagged for field review.</p>
        </div>
        <div>
          <label htmlFor="drainage-min-cover" className="mb-1 block text-xs text-zinc-400">Minimum crown cover from project specification (m)</label>
          <input id="drainage-min-cover" type="number" min="0" step="0.001" value={minimumCoverText} onChange={event => { setMinimumCoverText(event.target.value); markEdited() }} disabled={saving} className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white" />
        </div>
        <div>
          <label htmlFor="drainage-setout-interval" className="mb-1 block text-xs text-zinc-400">Set-out interval along pipe alignment (m)</label>
          <input id="drainage-setout-interval" type="number" min="0.001" step="0.1" value={setoutIntervalText} onChange={event => { setSetoutIntervalText(event.target.value); markEdited() }} disabled={saving} className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white" />
        </div>
        <div>
          <label htmlFor="drainage-setout-start" className="mb-1 block text-xs text-zinc-400">Schedule start chainage override (m)</label>
          <input id="drainage-setout-start" type="number" step="0.001" value={setoutStartChainageText} onChange={event => { setSetoutStartChainageText(event.target.value); markEdited() }} disabled={saving} placeholder="Blank = first manhole chainage" className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white" />
        </div>
      </section>

      <SetoutToleranceProfileFields
        value={setoutToleranceProfile}
        disabled={saving}
        onChange={value => { setSetoutToleranceProfile(value); markEdited() }}
      />

      {projectId && (
        <section className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
          <h4 className="font-medium text-white">Saved project map lines</h4>
          <p className="text-xs text-zinc-400">METARDU reads saved LineStrings and transforms them from GeoJSON WGS 84 into the project’s declared CRS. Map drawings are preliminary geometry, not approved design or survey control.</p>
          {declaredProjectCrs && <p className="font-mono text-xs text-zinc-300">Project CRS: {declaredProjectCrs}</p>}
          {!declaredProjectCrs && !mapAlignmentLoading && <p role="status" className="text-xs text-amber-200">A declared projected project CRS is required before map lines can be used.</p>}
          {declaredProjectCrs && projectCrs.trim() && !declaredCrsMatches && (
            <p role="alert" className="text-xs text-amber-200">Drainage CRS {projectCrs} differs from the project’s declared CRS {declaredProjectCrs}. Reconcile it before selecting a saved map line or creating set-out targets.</p>
          )}
          {mapAlignmentLoading && <p role="status" className="text-xs text-zinc-400">Loading saved map lines…</p>}
          {mapAlignmentLoadError && <p role="alert" className="text-xs text-amber-200">{mapAlignmentLoadError}</p>}
          {mapAlignmentWarnings.length > 0 && (
            <ul className="list-inside list-disc space-y-1 text-xs text-amber-200">{mapAlignmentWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
          )}
          {!mapAlignmentLoading && !mapAlignmentLoadError && projectMapAlignments.length === 0 && (
            <p className="text-xs text-zinc-500">No usable saved map LineStrings are available. You can still enter project-CRS vertices manually.</p>
          )}
          {mapAlignmentSelectionError && <p role="alert" className="text-xs text-amber-200">{mapAlignmentSelectionError}</p>}
        </section>
      )}

      {manholes.length === 0 ? (
        <div className="py-8 text-center text-zinc-500">Add at least two manholes to define a drainage run.</div>
      ) : (
        <div className="space-y-4">
          {manholes.map((manhole, index) => {
            const defaultN = manhole.pipeMaterial ? materialRoughness[manhole.pipeMaterial] : undefined
            const depth = Number.isFinite(manhole.coverLevel) && Number.isFinite(manhole.invertLevelOut)
              ? (manhole.coverLevel as number) - (manhole.invertLevelOut as number)
              : undefined
            const numberField = (field: keyof Manhole, label: string, value: number | undefined, step = '0.001') => (
              <div key={field}>
                <label htmlFor={`mh-${index}-${field}`} className="mb-1 block text-xs text-zinc-400">{label}</label>
                <input
                  id={`mh-${index}-${field}`}
                  type="number"
                  step={step}
                  value={value ?? ''}
                  onChange={event => updateManhole(index, field, optionalNumber(event.target.value))}
                  disabled={saving}
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white"
                />
              </div>
            )

            return (
              <section key={manhole.id} className="rounded-lg border border-zinc-700 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-medium text-white">Manhole {index + 1}</h4>
                  <button type="button" onClick={() => removeManhole(index)} disabled={saving} className="text-sm text-red-400 hover:text-red-300 disabled:opacity-50">Remove</button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label htmlFor={`mh-${index}-name`} className="mb-1 block text-xs text-zinc-400">Manhole ID</label>
                    <input id={`mh-${index}-name`} value={manhole.name} onChange={event => updateManhole(index, 'name', event.target.value)} disabled={saving} className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white" />
                  </div>
                  {numberField('chainage', 'Chainage (m)', manhole.chainage)}
                  {numberField('easting', 'Easting (m)', manhole.easting)}
                  {numberField('northing', 'Northing (m)', manhole.northing)}
                  {numberField('coverLevel', 'Cover top RL (m)', manhole.coverLevel)}
                  {numberField('invertLevelIn', 'Incoming invert RL (m)', manhole.invertLevelIn)}
                  {numberField('invertLevelOut', 'Outgoing invert RL (m)', manhole.invertLevelOut)}
                  <div>
                    <label htmlFor={`mh-${index}-pipeMaterial`} className="mb-1 block text-xs text-zinc-400">Outgoing pipe material</label>
                    <select
                      id={`mh-${index}-pipeMaterial`}
                      value={manhole.pipeMaterial ?? ''}
                      onChange={event => {
                        const updated = [...manholes]
                        updated[index] = {
                          ...updated[index],
                          pipeMaterial: event.target.value ? event.target.value as PipeMaterial : undefined,
                          pipeManningN: undefined,
                        }
                        setManholes(updated)
                        markEdited()
                      }}
                      disabled={saving}
                      className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white"
                    >
                      <option value="">Select material</option>
                      <option value="Concrete">Concrete</option>
                      <option value="HDPE">HDPE</option>
                      <option value="uPVC">uPVC</option>
                      <option value="VCP">VCP</option>
                    </select>
                  </div>
                  {numberField('pipeDiameterOut', 'Hydraulic internal diameter (mm)', manhole.pipeDiameterOut, '0.1')}
                  {numberField('pipeOutsideDiameterOut', 'Manufacturer outside diameter (mm)', manhole.pipeOutsideDiameterOut, '0.1')}
                  <div>
                    <label htmlFor={`mh-${index}-manningN`} className="mb-1 block text-xs text-zinc-400">Manning n (override)</label>
                    <input
                      id={`mh-${index}-manningN`}
                      type="number"
                      min="0"
                      step="0.001"
                      value={manhole.pipeManningN ?? defaultN ?? ''}
                      onChange={event => updateManhole(index, 'pipeManningN', optionalNumber(event.target.value))}
                      disabled={saving}
                      className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white"
                      aria-describedby={`mh-${index}-manning-help`}
                    />
                    <p id={`mh-${index}-manning-help`} className="mt-1 text-[11px] text-zinc-500">Material preset shown; confirm against pipe specification.</p>
                  </div>
                  {numberField('designFlowOutLs', 'Design flow (L/s, optional)', manhole.designFlowOutLs, '0.01')}
                  {index < manholes.length - 1 && (
                    <div className="sm:col-span-2 xl:col-span-4">
                      <label htmlFor={`mh-${index}-alignment-vertices`} className="mb-1 block text-xs text-zinc-400">Intermediate pipe alignment vertices (project CRS E,N)</label>
                      <textarea
                        id={`mh-${index}-alignment-vertices`}
                        value={alignmentTexts[index] ?? ''}
                        onChange={event => {
                          const value = event.target.value
                          setAlignmentTexts(current => current.map((text, i) => i === index ? value : text))
                          setManholes(current => current.map((item, i) => {
                            if (i !== index || !item.alignmentSourceOut) return item
                            if (!value.trim()) {
                              const { alignmentSourceOut: _source, ...withoutSource } = item
                              return withoutSource
                            }
                            return { ...item, alignmentSourceOut: { ...item.alignmentSourceOut, editedAfterImport: true } }
                          }))
                          markEdited()
                        }}
                        disabled={saving}
                        rows={3}
                        placeholder="One Easting,Northing pair per line; leave blank for a straight run"
                        aria-describedby={`mh-${index}-alignment-help`}
                        className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 font-mono text-xs text-white"
                      />
                      <p id={`mh-${index}-alignment-help`} className="mt-1 text-[11px] text-zinc-500">Enter bend vertices in route order, excluding the two manholes. Their projected polyline length must agree with the manhole chainage interval. Intermediate ground levels are not inferred.</p>
                      {projectId && (
                        <div className="mt-3 max-w-xl">
                          <label htmlFor={`mh-${index}-saved-map-alignment`} className="mb-1 block text-xs text-zinc-400">Or use a saved project map line</label>
                          <select
                            id={`mh-${index}-saved-map-alignment`}
                            value={manhole.alignmentSourceOut?.featureKey ?? ''}
                            onChange={event => selectProjectMapAlignment(index, event.target.value)}
                            disabled={saving || mapAlignmentLoading}
                            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-2 text-sm text-white disabled:opacity-60"
                          >
                            <option value="">Use manually entered vertices</option>
                            {manhole.alignmentSourceOut && !projectMapAlignments.some(line => line.featureKey === manhole.alignmentSourceOut?.featureKey) && (
                              <option value={manhole.alignmentSourceOut.featureKey}>Previously selected: {manhole.alignmentSourceOut.label}</option>
                            )}
                            {projectMapAlignments.map(line => (
                              <option key={line.featureKey} value={line.featureKey}>{line.label} · {line.vertices.length} vertices</option>
                            ))}
                          </select>
                          <p className="mt-1 text-[11px] text-zinc-500">The line is oriented toward the downstream manhole. Connector distances are retained and count toward route length; selection raises a field-review warning.</p>
                          {manhole.alignmentSourceOut && (
                            <p role="note" className="mt-2 rounded border border-amber-800 bg-amber-950/30 p-2 text-[11px] text-amber-200">
                              Map source: {manhole.alignmentSourceOut.label} · {manhole.alignmentSourceOut.orientation} · start connector {manhole.alignmentSourceOut.startConnectorM.toFixed(3)} m · end connector {manhole.alignmentSourceOut.endConnectorM.toFixed(3)} m. Verify this drawing against the approved design and survey control.
                              {manhole.alignmentSourceOut.editedAfterImport ? ' Vertices edited after import.' : ''}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div>
                    <span className="mb-1 block text-xs text-zinc-400">Depth to outgoing invert (m)</span>
                    <output className="block rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300">{depth === undefined ? '—' : depth.toFixed(3)}</output>
                  </div>
                </div>
                {index === manholes.length - 1 && <p className="mt-3 text-xs text-zinc-500">Terminal manhole: incoming invert is required. Outgoing pipe fields are unused unless another manhole is added downstream.</p>}
              </section>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={addManhole} disabled={saving} className="rounded-lg border border-zinc-700 px-4 py-2 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">+ Add Manhole</button>
        <button type="button" onClick={() => void handleSave()} disabled={manholes.length === 0 || saving} className="rounded-lg bg-amber-500 px-6 py-2.5 font-semibold text-black hover:bg-amber-400 disabled:cursor-wait disabled:opacity-40">{saving ? 'Saving…' : 'Save Manhole Inputs'}</button>
        {saveError && <p role="alert" className="text-sm text-red-300">{saveError}</p>}
      </div>
      {saved && <p role="status" className="text-sm text-emerald-400">Manhole inputs saved to the project.{saveIssues.length === 0 ? ' The pipe schedule is ready to calculate.' : ''}</p>}
      {saveIssues.length > 0 && (
        <div role="status" className="rounded-lg border border-amber-700 bg-amber-950/40 p-4 text-sm text-amber-200">
          <p className="mb-2 font-semibold">{saved ? 'Inputs saved as a draft. Complete these fields before calculating pipe runs:' : 'Complete these fields before the pipe schedule can be calculated:'}</p>
          <ul className="list-inside list-disc space-y-1">{saveIssues.map(issue => <li key={issue}>{issue}</li>)}</ul>
        </div>
      )}
    </div>
  )
}
