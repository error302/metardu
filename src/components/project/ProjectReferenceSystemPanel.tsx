'use client'

/**
 * Project Reference System declaration panel (blueprint §4.2).
 *
 * Reads and writes GET/PUT /api/project/[id]/reference-system. The horizontal
 * CRS shown is DERIVED from the datum / UTM zone / hemisphere selectors in
 * project settings and validated by the CRS authority — this panel never
 * types or hard-codes an EPSG code, and a declaration that fails validation
 * is reported as an error rather than saved with a fallback.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { assertProjectedCrs, combinedScaleFactor } from '@/lib/spatial/projectCrs'
import {
  horizontalCrsFor,
  type ProjectReferenceSystemRecord,
} from '@/lib/spatial/projectReferenceSystem'

interface PanelProps {
  projectId: string
  /** Current (parent) settings selection — the CRS is derived from these. */
  datum: string
  utmZone: number
  hemisphere: 'N' | 'S'
}

interface DerivedCrs {
  code: string | null
  name: string | null
  error: string | null
}

function humanize(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.replace(/^\[[A-Z_]+\]\s*/, '')
}

export default function ProjectReferenceSystemPanel({
  projectId,
  datum,
  utmZone,
  hemisphere,
}: PanelProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [declared, setDeclared] = useState<ProjectReferenceSystemRecord | null>(null)
  const [description, setDescription] = useState<string[]>([])
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  const [verticalDatum, setVerticalDatum] = useState('')
  const [verticalReference, setVerticalReference] = useState('')
  const [geoidModel, setGeoidModel] = useState('')
  const [benchmarkBasis, setBenchmarkBasis] = useState('')
  const [calibrationVersion, setCalibrationVersion] = useState('')
  const [calibrationNotes, setCalibrationNotes] = useState('')
  const [distanceMode, setDistanceMode] = useState<'grid' | 'ground'>('grid')
  const [csf, setCsf] = useState('')
  const [csfProvenance, setCsfProvenance] = useState<'computed' | 'surveyor' | ''>('')
  const [csfEasting, setCsfEasting] = useState('')
  const [csfNorthing, setCsfNorthing] = useState('')
  const [csfHeight, setCsfHeight] = useState('')
  const [coordinatePrecision, setCoordinatePrecision] = useState(3)
  const [notes, setNotes] = useState('')

  // Derived horizontal CRS from the settings selectors (authority-checked).
  const derived: DerivedCrs = useMemo(() => {
    try {
      const info = assertProjectedCrs(horizontalCrsFor(datum, utmZone, hemisphere))
      return { code: info.code, name: info.name, error: null }
    } catch (err) {
      return { code: null, name: null, error: humanize(err) }
    }
  }, [datum, utmZone, hemisphere])

  const load = useCallback(async () => {
    // jsdom (component evidence tests) has no fetch — report "not loaded"
    // rather than throwing out of the effect. Browsers always have fetch.
    if (typeof fetch !== 'function') {
      setLoading(false)
      return
    }
    try {
      const res = await fetch(`/api/project/${projectId}/reference-system`)
      if (res.ok) {
        const json = (await res.json()) as {
          referenceSystem: ProjectReferenceSystemRecord | null
          description?: string[]
        }
        setDeclared(json.referenceSystem)
        setDescription(json.description ?? [])
        const record = json.referenceSystem
        if (record) {
          setVerticalDatum(record.prs.verticalDatum ?? '')
          setVerticalReference(record.prs.verticalReference ?? '')
          setGeoidModel(record.geoidModel ?? '')
          setBenchmarkBasis(record.benchmarkBasis ?? '')
          setCalibrationVersion(record.calibrationVersion ?? '')
          setCalibrationNotes(record.calibrationNotes ?? '')
          setDistanceMode(record.prs.distanceMode)
          setCsf(
            record.prs.combinedScaleFactor !== undefined
              ? String(record.prs.combinedScaleFactor)
              : ''
          )
          setCsfProvenance(record.csfProvenance ?? '')
          setCsfEasting(record.csfReference ? String(record.csfReference.easting) : '')
          setCsfNorthing(record.csfReference ? String(record.csfReference.northing) : '')
          setCsfHeight(
            record.csfReference?.height !== undefined ? String(record.csfReference.height) : ''
          )
          setCoordinatePrecision(record.prs.coordinatePrecision)
          setNotes(record.prs.notes ?? '')
        }
      }
    } catch {
      // Offline / test environment — leave the panel in its undeclared state.
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  const computeCsf = () => {
    setMessage(null)
    try {
      if (!derived.code) throw new Error('The selected datum/zone does not resolve to a registered projected CRS.')
      const easting = Number(csfEasting)
      const northing = Number(csfNorthing)
      if (!Number.isFinite(easting) || !Number.isFinite(northing)) {
        throw new Error('Enter the reference easting and northing (grid metres) where the factor applies.')
      }
      const height = csfHeight.trim() === '' ? 0 : Number(csfHeight)
      if (!Number.isFinite(height)) throw new Error('Reference height must be a number (metres).')
      const factor = combinedScaleFactor(easting, northing, derived.code, height)
      setCsf(factor.toFixed(9))
      setCsfProvenance('computed')
      setMessage({
        kind: 'ok',
        text: `Computed combined scale factor at E ${easting.toFixed(3)}, N ${northing.toFixed(3)}: ${factor.toFixed(9)}`,
      })
    } catch (err) {
      setMessage({ kind: 'error', text: humanize(err) })
    }
  }

  const save = async () => {
    setMessage(null)
    const factor = csf.trim() === '' ? undefined : Number(csf)
    if (factor !== undefined && (!Number.isFinite(factor) || factor <= 0)) {
      setMessage({ kind: 'error', text: 'Combined scale factor must be a positive number, or left empty.' })
      return
    }
    if (factor !== undefined && !csfProvenance) {
      setMessage({
        kind: 'error',
        text: 'State whether the adopted combined scale factor was computed or surveyor-adopted.',
      })
      return
    }

    if (typeof fetch !== 'function') {
      setMessage({ kind: 'error', text: 'Network unavailable — cannot declare the reference system.' })
      return
    }

    setSaving(true)
    const res = await fetch(`/api/project/${projectId}/reference-system`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        datum,
        utmZone,
        hemisphere,
        verticalDatum: verticalDatum || undefined,
        verticalReference: verticalReference || undefined,
        geoidModel: geoidModel || undefined,
        benchmarkBasis: benchmarkBasis || undefined,
        calibrationVersion: calibrationVersion || undefined,
        calibrationNotes: calibrationNotes || undefined,
        distanceMode,
        combinedScaleFactor: factor ?? null,
        csfProvenance: factor !== undefined ? csfProvenance : undefined,
        csfReference:
          csfEasting.trim() !== '' && csfNorthing.trim() !== ''
            ? {
                easting: Number(csfEasting),
                northing: Number(csfNorthing),
                height: csfHeight.trim() === '' ? undefined : Number(csfHeight),
              }
            : undefined,
        coordinatePrecision,
        notes: notes || undefined,
      }),
    })

    const json = (await res.json().catch(() => ({}))) as {
      error?: string
      referenceSystem?: ProjectReferenceSystemRecord
      description?: string[]
    }
    if (!res.ok) {
      setMessage({ kind: 'error', text: json.error ?? `Declaration failed (HTTP ${res.status}).` })
    } else {
      setDeclared(json.referenceSystem ?? null)
      setDescription(json.description ?? [])
      setMessage({ kind: 'ok', text: 'Project reference system declared and saved.' })
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="bg-[var(--bg-secondary)] p-4 rounded border border-[var(--border-color)] text-sm text-[var(--text-secondary)]">
        Loading reference system...
      </div>
    )
  }

  return (
    <div className="border-t border-[var(--border-color)] pt-6 mt-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">
          Project Reference System
        </h3>
        <span
          className={`text-xs px-2 py-1 rounded ${
            declared
              ? 'bg-green-900/40 text-green-400'
              : 'bg-amber-900/40 text-amber-400'
          }`}
        >
          {declared
            ? `Declared ${declared.declaredAt ? new Date(declared.declaredAt).toLocaleDateString() : ''}`
            : 'Not declared'}
        </span>
      </div>
      <p className="text-xs text-[var(--text-secondary)] mb-4">
        Every export, drawing, report, and coordinate schedule states this reference system.
        METARDU never substitutes a default — an undeclared project reports that it has none.
      </p>

      {!declared && (
        <div className="p-3 rounded mb-4 bg-amber-900/20 text-amber-400 text-sm">
          This project has no declared reference system yet. Deliverables cannot state a CRS
          until you declare one below.
        </div>
      )}

      {message && (
        <div
          className={`p-3 rounded mb-4 text-sm ${
            message.kind === 'ok'
              ? 'bg-green-900/30 text-green-400'
              : 'bg-red-900/30 text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-[var(--bg-tertiary)] p-4 rounded border border-[var(--border-color)] mb-4">
        <div className="text-xs uppercase tracking-wide text-[var(--text-secondary)] mb-2">
          Horizontal (from the datum / zone / hemisphere selectors above)
        </div>
        {derived.code ? (
          <>
            <div className="font-mono text-[var(--text-primary)]">{derived.code}</div>
            <div className="text-sm text-[var(--text-secondary)]">{derived.name}</div>
          </>
        ) : (
          <div className="text-sm text-red-400">{derived.error}</div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="verticalDatum"
            className="block text-sm text-[var(--text-primary)] mb-2"
          >
            Vertical Datum
          </label>
          <input
            id="verticalDatum"
            type="text"
            value={verticalDatum}
            onChange={(e) => setVerticalDatum(e.target.value)}
            placeholder="e.g. Kenya orthometric (mean sea level)"
            className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
          />
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Heights are meaningless without it — leave blank only if the project has no levels.
          </p>
        </div>
        <div>
          <label
            htmlFor="verticalReference"
            className="block text-sm text-[var(--text-primary)] mb-2"
          >
            Height Type
          </label>
          <select
            id="verticalReference"
            value={verticalReference}
            onChange={(e) => setVerticalReference(e.target.value)}
            className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
          >
            <option value="">Not specified</option>
            <option value="orthometric">Orthometric (gravity-related)</option>
            <option value="ellipsoidal">Ellipsoidal (ellipsoid)</option>
            <option value="trig">Trigonometrical height</option>
            <option value="local">Local / assumed datum</option>
          </select>
        </div>
        <div>
          <label htmlFor="geoidModel" className="block text-sm text-[var(--text-primary)] mb-2">
            Geoid / Model
          </label>
          <input
            id="geoidModel"
            type="text"
            value={geoidModel}
            onChange={(e) => setGeoidModel(e.target.value)}
            placeholder="e.g. EGM2008, local geoid model"
            className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
          />
        </div>
        <div>
          <label
            htmlFor="benchmarkBasis"
            className="block text-sm text-[var(--text-primary)] mb-2"
          >
            Benchmark Basis
          </label>
          <input
            id="benchmarkBasis"
            type="text"
            value={benchmarkBasis}
            onChange={(e) => setBenchmarkBasis(e.target.value)}
            placeholder="e.g. BM 1234 / ARP benchmark"
            className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
          />
        </div>
      </div>

      <div className="mt-4">
        <span className="block text-sm text-[var(--text-primary)] mb-2">Distances stated as</span>
        <div className="flex gap-6">
          <label htmlFor="distanceModeGrid" className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input
              id="distanceModeGrid"
              type="radio"
              name="distanceMode"
              checked={distanceMode === 'grid'}
              onChange={() => setDistanceMode('grid')}
            />
            Grid (projection plane)
          </label>
          <label htmlFor="distanceModeGround" className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input
              id="distanceModeGround"
              type="radio"
              name="distanceMode"
              checked={distanceMode === 'ground'}
              onChange={() => setDistanceMode('ground')}
            />
            Ground (ellipsoid / sea level)
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4">
        <div>
          <label htmlFor="combinedScaleFactor" className="block text-sm text-[var(--text-primary)] mb-2">
            Adopted Combined Scale Factor
          </label>
          <input
            id="combinedScaleFactor"
            type="text"
            inputMode="decimal"
            value={csf}
            onChange={(e) => setCsf(e.target.value)}
            placeholder="Empty = compute per point"
            className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] font-mono"
          />
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            k × elevation factor. Leave empty to compute from each coordinate and height.
          </p>
        </div>
        <div>
          <label htmlFor="csfProvenance" className="block text-sm text-[var(--text-primary)] mb-2">
            Factor Provenance
          </label>
          <select
            id="csfProvenance"
            value={csfProvenance}
            onChange={(e) => setCsfProvenance(e.target.value as 'computed' | 'surveyor' | '')}
            className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
          >
            <option value="">Not declared</option>
            <option value="computed">Computed from coordinates</option>
            <option value="surveyor">Surveyor-adopted (field/office evidence)</option>
          </select>
        </div>
        <div>
          <label htmlFor="csfEasting" className="block text-sm text-[var(--text-primary)] mb-2">
            Reference Point Easting (m)
          </label>
          <input
            id="csfEasting"
            type="text"
            inputMode="decimal"
            value={csfEasting}
            onChange={(e) => setCsfEasting(e.target.value)}
            placeholder="e.g. 450000"
            className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] font-mono"
          />
        </div>
        <div>
          <label htmlFor="csfNorthing" className="block text-sm text-[var(--text-primary)] mb-2">
            Reference Point Northing (m)
          </label>
          <input
            id="csfNorthing"
            type="text"
            inputMode="decimal"
            value={csfNorthing}
            onChange={(e) => setCsfNorthing(e.target.value)}
            placeholder="e.g. 9858000"
            className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] font-mono"
          />
        </div>
      </div>

      <div className="flex items-end gap-4 mt-4">
        <div>
          <label htmlFor="csfHeight" className="block text-sm text-[var(--text-primary)] mb-2">
            Reference Height (m)
          </label>
          <input
            id="csfHeight"
            type="text"
            inputMode="decimal"
            value={csfHeight}
            onChange={(e) => setCsfHeight(e.target.value)}
            placeholder="e.g. 1600"
            className="w-40 px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] font-mono"
          />
        </div>
        <button
          type="button"
          onClick={computeCsf}
          className="px-4 py-3 border border-[var(--border-color)] text-[var(--text-primary)] rounded hover:bg-[var(--bg-tertiary)] text-sm"
        >
          Compute at Point
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4">
        <div>
          <label
            htmlFor="coordinatePrecision"
            className="block text-sm text-[var(--text-primary)] mb-2"
          >
            Coordinate Precision (decimals)
          </label>
          <select
            id="coordinatePrecision"
            value={String(coordinatePrecision)}
            onChange={(e) => setCoordinatePrecision(Number(e.target.value))}
            className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
          >
            {[2, 3, 4, 5, 6].map((dp) => (
              <option key={dp} value={dp}>
                {dp} dp
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="calibrationVersion"
            className="block text-sm text-[var(--text-primary)] mb-2"
          >
            Site Calibration / Transformation Version
          </label>
          <input
            id="calibrationVersion"
            type="text"
            value={calibrationVersion}
            onChange={(e) => setCalibrationVersion(e.target.value)}
            placeholder="e.g. CAL-2026-01"
            className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
          />
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="calibrationNotes" className="block text-sm text-[var(--text-primary)] mb-2">
          Calibration Notes / Residuals
        </label>
        <textarea
          id="calibrationNotes"
          value={calibrationNotes}
          onChange={(e) => setCalibrationNotes(e.target.value)}
          placeholder="Transformation parameters, residual statistics, checkpoint results"
          className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] h-20"
        />
      </div>

      <div className="mt-4">
        <label htmlFor="prsNotes" className="block text-sm text-[var(--text-primary)] mb-2">
          Reference System Notes
        </label>
        <textarea
          id="prsNotes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Provenance recorded on deliverables"
          className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] h-20"
        />
      </div>

      {description.length > 0 && (
        <div className="mt-4 p-3 rounded bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
          <div className="text-xs uppercase tracking-wide text-[var(--text-secondary)] mb-1">
            Stated on deliverables
          </div>
          {description.map((line) => (
            <div key={line} className="text-xs text-[var(--text-primary)] font-mono">
              {line}
            </div>
          ))}
        </div>
      )}

      <div className="pt-4">
        <button
          type="button"
          onClick={save}
          disabled={saving || !derived.code}
          className="px-6 py-3 bg-amber-500 text-black font-bold rounded hover:bg-amber-400 disabled:opacity-50"
        >
          {saving ? 'Declaring...' : declared ? 'Update Declaration' : 'Declare Reference System'}
        </button>
      </div>
    </div>
  )
}
