'use client'

/**
 * QADashboard — Single view of all quality checks for a project
 *
 * Shows:
 * - Topology check results (overlaps, slivers, self-intersections)
 * - Area reconciliation (parent vs sum of parts)
 * - Traverse precision (linear + angular closure)
 * - Beacon validation (duplicates, missing coordinates)
 * - Document review status
 * - Manual registry handoff review
 *
 * Green = pass, Amber = warning, Red = fail
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  ShieldCheck, AlertTriangle, AlertCircle, CheckCircle2,
  Loader2, RefreshCw, FileText, MapPin, Ruler, Calculator,
  Layers, Building2,
} from 'lucide-react'
import { runTopologyCheck, type ExistingParcel } from '@/lib/survey/topologyChecker'
import { evaluateTraversePrecision, type TraverseCategory } from '@/lib/engine/computationalAccuracy'
import { computeAreaWithPrecision } from '@/lib/engine/computationalAccuracy'
import type { StageReference } from '@/lib/workspaces/stageReference'
import { memoize } from '@/lib/performance'

// Memoized area computation — caches results for same vertex sets
const memoizedComputeArea = memoize(computeAreaWithPrecision, {
  keyFn: (vertices) => JSON.stringify(vertices[0]),
  maxSize: 200,
})

interface QACheck {
  id: string
  category: 'topology' | 'area' | 'traverse' | 'beacons' | 'documents' | 'nlims'
  name: string
  status: 'pass' | 'warning' | 'fail' | 'pending'
  message: string
  details?: string
  count?: number
  measuredValue?: number
  thresholdValue?: number
  unit?: string
  comparison?: 'lte' | 'gte' | 'eq'
}

interface QADashboardProps {
  projectId: string
  reference?: StageReference
  parcels?: ExistingParcel[]
  traverseData?: {
    linearErrorM: number
    totalDistanceM: number
    angularMisclosureSec: number
    stationCount: number
  }
  parentAreaHa?: number
  surveyCategory?: TraverseCategory
}

const CATEGORY_ICONS = {
  topology: Layers,
  area: Calculator,
  traverse: Ruler,
  beacons: MapPin,
  documents: FileText,
  nlims: Building2,
}

const STATUS_CONFIG = {
  pass: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'PASS' },
  warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: 'WARNING' },
  fail: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', label: 'FAIL' },
  pending: { icon: Loader2, color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/30', label: 'PENDING' },
}

/**
 * Stable empty default. A fresh `[]` literal per render changes the
 * `runAllChecks` identity on every render, which re-triggers the effect that
 * calls it — an infinite render loop on any project without parcels.
 */
const EMPTY_PARCELS: ExistingParcel[] = []

/** Evidence persistence is best-effort; never let it hold up the dashboard. */
const QA_PERSIST_TIMEOUT_MS = 10000

export function QADashboard({
  projectId,
  reference,
  parcels = EMPTY_PARCELS,
  traverseData,
  parentAreaHa,
  surveyCategory = 'urban',
}: QADashboardProps) {
  const [checks, setChecks] = useState<QACheck[]>([])
  const [running, setRunning] = useState(false)
  const persistedRuns = useRef<Set<string>>(new Set())
  const savingRuns = useRef<Set<string>>(new Set())
  const [evidenceState, setEvidenceState] = useState<'saving' | 'saved' | 'failed'>('saving')
  const currentProject = useRef(projectId)
  currentProject.current = projectId
  const runSequence = useRef(0)

  /**
   * Persist the run as QA evidence (blueprint §2.5): a PASS must carry the
   * rule, the measurement and the revision, otherwise this dashboard is
   * decoration. Fingerprinted so re-renders never spam the ledger, and
   * time-boxed so a slow or unavailable register can never block a surveyor
   * from seeing their own results.
   */
  const persistQaRun = useCallback(
    async (results: QACheck[]) => {
      const payload = {
        trigger: 'manual',
        inputSnapshot: JSON.stringify({ reference, parcels, traverseData, parentAreaHa, surveyCategory }),
        results: results.map(check => ({
          checkType: `dashboard.${check.id}`,
          result: check.status === 'pass' ? 'PASS' : check.status === 'warning' ? 'WARN' : check.status === 'fail' ? 'FAIL' : 'INFO',
          message: check.message,
          measuredValue: check.measuredValue ?? check.count ?? null,
          thresholdValue: check.thresholdValue ?? null,
          unit: check.unit ?? null,
          details: { category: check.category, rule: check.details ?? check.message, comparison: check.comparison },
        })),
      }
      const fingerprint = JSON.stringify({ projectId, ...payload })
      if (persistedRuns.current.has(fingerprint)) {
        setEvidenceState('saved')
        return
      }
      if (savingRuns.current.has(fingerprint)) return
      savingRuns.current.add(fingerprint)
      setEvidenceState('saving')
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), QA_PERSIST_TIMEOUT_MS)
      try {
        const response = await fetch(`/api/project/${projectId}/qa`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          signal: controller.signal, body: JSON.stringify(payload),
        })
        if (!response.ok) throw new Error('QA record was not saved')
        persistedRuns.current.add(fingerprint)
        if (currentProject.current === projectId) setEvidenceState('saved')
      } catch {
        if (currentProject.current === projectId) setEvidenceState('failed')
      } finally {
        clearTimeout(timer)
        savingRuns.current.delete(fingerprint)
      }
    },
    [projectId, reference, parcels, traverseData, parentAreaHa, surveyCategory]
  )

  const runAllChecks = useCallback(async () => {
    const sequence = ++runSequence.current
    setRunning(true)

    const results: QACheck[] = []
    const epsg = reference?.source === 'declared' ? reference.code : null
    try {
    if (!epsg) results.push({ id: 'qa-reference', category: 'topology', name: 'Project Reference System', status: 'pending', message: 'Declare a projected reference system in project settings before checking spatial data.' })

    // ─── 1. Topology Checks ──────────────────────────────────
    if (epsg && parcels.length > 0) {
      if (parcels.some(parcel => parcel.vertices.length < 3)) throw new Error('Parcel boundary is incomplete')
      let totalOverlaps = 0
      let totalSlivers = 0
      let totalSelfIntersections = 0

      for (const parcel of parcels) {
        const otherParcels = parcels.filter(p => p.id !== parcel.id)
        const topoResult = await runTopologyCheck({
          newVertices: parcel.vertices, epsg,
          existingParcels: otherParcels,
        })

        totalOverlaps += topoResult.issues.filter(i => i.type === 'overlap').length
        totalSlivers += topoResult.issues.filter(i => i.type === 'sliver').length
        totalSelfIntersections += topoResult.issues.filter(i => i.type === 'self_intersection').length
      }

      results.push({
        id: 'topo-overlap',
        category: 'topology',
        name: 'Parcel Overlaps',
        status: totalOverlaps === 0 ? 'pass' : 'fail',
        message: totalOverlaps === 0 ? 'No overlapping parcels detected' : `${totalOverlaps} overlap(s) found`,
        details: 'Review flagged overlaps with a licensed surveyor and check the current official process.',
        count: totalOverlaps, thresholdValue: 0, unit: 'count', comparison: 'eq',
      })

      results.push({
        id: 'topo-sliver',
        category: 'topology',
        name: 'Sliver Gaps',
        status: totalSlivers === 0 ? 'pass' : 'warning',
        message: totalSlivers === 0 ? 'No sliver gaps detected' : `${totalSlivers} sliver gap(s) found`,
        details: 'Micro-gaps between adjacent parcels may cause registration issues',
        count: totalSlivers, thresholdValue: 0, unit: 'count', comparison: 'eq',
      })

      results.push({
        id: 'topo-self-int',
        category: 'topology',
        name: 'Self-Intersections',
        status: totalSelfIntersections === 0 ? 'pass' : 'fail',
        message: totalSelfIntersections === 0 ? 'No self-intersections detected' : `${totalSelfIntersections} self-intersection(s) found`,
        details: 'A boundary that crosses itself produces an invalid parcel',
        count: totalSelfIntersections, thresholdValue: 0, unit: 'count', comparison: 'eq',
      })
    } else {
      results.push({
        id: 'topo-empty',
        category: 'topology',
        name: 'Parcel Data',
        status: 'pending',
        message: 'No parcels to check — import parcels first',
      })
    }

    // ─── 2. Area Reconciliation ──────────────────────────────
    if (epsg && typeof parentAreaHa === 'number' && Number.isFinite(parentAreaHa) && parentAreaHa > 0 && parcels.length > 0) {
      const sumOfParts = parcels.reduce((sum, p) => {
        const area = memoizedComputeArea(p.vertices)
        return sum + area.areaHectares
      }, 0)

      const difference = Math.abs(parentAreaHa - sumOfParts)
      const tolerance = 0.001 // 10 m²

      results.push({
        id: 'area-recon',
        category: 'area',
        name: 'Area Reconciliation',
        status: difference <= tolerance ? 'pass' : 'fail',
        message: difference <= tolerance
          ? `Sum of parts (${sumOfParts.toFixed(4)} ha) matches parent (${parentAreaHa.toFixed(4)} ha)`
          : `Mismatch: parent ${parentAreaHa.toFixed(4)} ha vs parts ${sumOfParts.toFixed(4)} ha (diff ${difference.toFixed(4)} ha)`,
        details: 'Sum of subdivision parts must equal parent title area within ±0.001 ha',
      })
    }

    // ─── 3. Traverse Precision ───────────────────────────────
    if (epsg && traverseData) {
      const precision = evaluateTraversePrecision(
        Math.abs(traverseData.linearErrorM),
        traverseData.totalDistanceM,
        Math.abs(traverseData.angularMisclosureSec),
        traverseData.stationCount,
        surveyCategory,
      )

      const linearMeasured = Number.isFinite(traverseData.linearErrorM) && traverseData.linearErrorM >= 0
        && Number.isFinite(traverseData.totalDistanceM) && traverseData.totalDistanceM > 0
      const maximumLinearError = traverseData.totalDistanceM / precision.minRequiredLinear
      results.push({
        id: 'trav-linear',
        category: 'traverse',
        name: 'Linear Precision',
        status: !linearMeasured ? 'pending' : traverseData.linearErrorM <= maximumLinearError ? 'pass' : 'fail',
        message: linearMeasured ? `${traverseData.linearErrorM.toFixed(4)} m closure (max ${maximumLinearError.toFixed(4)} m; 1:${precision.minRequiredLinear})` : 'Valid measured linear closure and traverse distance were not supplied.',
        details: `Absolute linear closure <= perimeter / ${precision.minRequiredLinear}; METARDU ${surveyCategory} preset requires surveyor confirmation`,
        measuredValue: linearMeasured ? traverseData.linearErrorM : undefined, thresholdValue: linearMeasured ? maximumLinearError : undefined, unit: 'm', comparison: 'lte',
      })

      // A misclosure that was never measured is PENDING, not a failure: when
      // independent angle readings are not supplied there is nothing to
      // judge, and reporting FAIL (NaN <= max is false) turns missing data
      // into a verdict against the surveyor's work.
      const angularMeasured = Number.isFinite(traverseData.angularMisclosureSec) && Number.isInteger(traverseData.stationCount) && traverseData.stationCount >= 3
      results.push({
        id: 'trav-angular',
        category: 'traverse',
        name: 'Angular Closure',
        status: !angularMeasured ? 'pending' : precision.passesAngular ? 'pass' : 'fail',
        message: angularMeasured
          ? `${precision.angularMisclosure.toFixed(1)}" (max ${precision.maxAllowedAngular.toFixed(1)}")`
          : 'Independent angular observations were not supplied.',
        details: angularMeasured
          ? `Maximum allowed: ${precision.maxAllowedAngular.toFixed(1)}" for ${precision.stationCount} stations`
          : 'Angular misclosure needs observed horizontal angles and at least three stations; supply them to complete this check.',
        measuredValue: angularMeasured ? Math.abs(traverseData.angularMisclosureSec) : undefined, thresholdValue: angularMeasured ? precision.maxAllowedAngular : undefined, unit: 'arcsec', comparison: 'lte',
      })
    }

    // ─── 4. Beacon Validation ────────────────────────────────
    if (epsg && parcels.length > 0) {
      const allBeacons = parcels.flatMap(p => p.vertices)
      let duplicates = 0

      for (let i = 0; i < allBeacons.length; i++) {
        for (let j = i + 1; j < allBeacons.length; j++) {
          const dE = allBeacons[i].easting - allBeacons[j].easting
          const dN = allBeacons[i].northing - allBeacons[j].northing
          if (Math.sqrt(dE * dE + dN * dN) < 0.1) duplicates++
        }
      }

      results.push({
        id: 'beacon-dup',
        category: 'beacons',
        name: 'Duplicate Beacons',
        status: duplicates === 0 ? 'pass' : 'warning',
        message: duplicates === 0 ? 'No duplicate beacons' : `${duplicates} potential duplicate(s) found`,
        details: 'Beacons less than 0.1m apart may be the same physical beacon',
        count: duplicates, thresholdValue: 0, unit: 'count', comparison: 'eq',
      })
    }

    // ─── 5. Document review ──────────────────────────────
    results.push({
      id: 'doc-sok',
      category: 'documents',
      name: 'Document review',
      status: 'pending',
      message: 'A generated document has not been reviewed by a licensed surveyor.',
      details: 'Review the plan, reference system, signatures and current requirements with a licensed surveyor. METARDU does not certify legal or registry compliance.',
    })

    // ─── 6. NLIMS Readiness ──────────────────────────────────
    results.push({
      id: 'nlims-ready',
      category: 'nlims',
      name: 'Manual registry handoff review',
      status: 'pending',
      message: 'A surveyor has not completed the manual handoff review for this project.',
      details: 'METARDU does not submit to a government registry. Check the current official process, ownership records and required documents before filing.',
    })

    if (sequence !== runSequence.current) return
    setChecks(results)
    setRunning(false)

    // Evidence is additive: a failure here must never hide the results the
    // surveyor is waiting for.
    void persistQaRun(results).catch(() => {})
    } catch {
      if (sequence !== runSequence.current) return
      setRunning(false)
      setEvidenceState('failed')
      setChecks([{ id: 'qa-incomplete', category: 'topology', name: 'QA checks incomplete', status: 'pending', message: 'Review the coordinates and declared reference system, then retry.' }])
    }
  }, [reference, parcels, parentAreaHa, traverseData, surveyCategory, persistQaRun])

  // Auto-run on mount / when the inputs change. This is a side effect, so it
  // belongs in an effect — running it during render (via useMemo) re-entered
  // on every render and could loop.
  useEffect(() => {
    void runAllChecks()
  }, [runAllChecks])

  const stats = useMemo(() => {
    return {
      total: checks.length,
      pass: checks.filter(c => c.status === 'pass').length,
      warning: checks.filter(c => c.status === 'warning').length,
      fail: checks.filter(c => c.status === 'fail').length,
      pending: checks.filter(c => c.status === 'pending').length,
    }
  }, [checks])

  // Readiness is only claimable when every check has a verdict: a pending
  // check (no parcels, no observations, nothing to measure) is not a pass.
  // Reporting "READY FOR SUBMISSION" for an empty project is the exact false
  // assurance this dashboard must never give (blueprint §2.5).
  const overallStatus = stats.fail > 0
    ? 'fail'
    : stats.warning > 0
      ? 'warning'
      : stats.pending > 0 || stats.total === 0 || stats.pass === 0
        ? 'pending'
        : 'pass'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              overallStatus === 'pass' ? 'bg-emerald-500/10' :
              overallStatus === 'warning' ? 'bg-amber-500/10' :
              overallStatus === 'fail' ? 'bg-red-500/10' : 'bg-gray-500/10'
            }`}>
              <ShieldCheck className={`w-5 h-5 ${
                overallStatus === 'pass' ? 'text-emerald-400' :
                overallStatus === 'warning' ? 'text-amber-400' :
                overallStatus === 'fail' ? 'text-red-400' : 'text-gray-400'
              }`} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">QA Validation Dashboard</h2>
              <p className="text-[10px] text-gray-500">All quality checks in one view</p>
            </div>
          </div>
          <button
            onClick={runAllChecks}
            disabled={running}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] text-xs font-medium hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
            Re-run Checks
          </button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-2">
          <StatBox label="Passed" value={stats.pass} color="text-emerald-400" bg="bg-emerald-500/10" />
          <StatBox label="Warnings" value={stats.warning} color="text-amber-400" bg="bg-amber-500/10" />
          <StatBox label="Failed" value={stats.fail} color="text-red-400" bg="bg-red-500/10" />
          <StatBox label="Pending" value={stats.pending} color="text-gray-400" bg="bg-gray-500/10" />
        </div>
      </div>

      <p role="status" className="text-xs text-[var(--text-secondary)]">
        {evidenceState === 'saved' ? 'Saved as reported QA evidence. These checks do not certify a survey or registry submission.' : evidenceState === 'saving' ? 'Saving QA evidence…' : 'Checks are visible, but this run was not saved. Re-run checks to retry.'}
      </p>

      {/* Checks by category */}
      {Object.entries(CATEGORY_ICONS).map(([cat, CatIcon]) => {
        const catChecks = checks.filter(c => c.category === cat)
        if (catChecks.length === 0) return null

        return (
          <div key={cat} className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <CatIcon className="w-4 h-4 text-[var(--accent)]" />
              <span className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                {cat}
              </span>
            </div>
            <div className="space-y-2">
              {catChecks.map(check => {
                const cfg = STATUS_CONFIG[check.status]
                const StatusIcon = cfg.icon
                return (
                  <div
                    key={check.id}
                    className={`flex items-start gap-3 p-2.5 rounded-lg border ${cfg.bg} ${cfg.border}`}
                  >
                    <StatusIcon className={`w-4 h-4 ${cfg.color} shrink-0 mt-0.5 ${check.status === 'pending' ? 'animate-spin' : ''}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-[var(--text-primary)]">{check.name}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        {check.count != null && check.count > 0 && (
                          <span className="text-[9px] text-gray-500">({check.count})</span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">{check.message}</p>
                      {check.details && (
                        <p className="text-[10px] text-gray-600 mt-0.5">{check.details}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Overall verdict */}
      {checks.length > 0 && (
        <div className={`card p-4 ${
          overallStatus === 'pass' ? 'border-emerald-500/30' :
          overallStatus === 'warning' ? 'border-amber-500/30' :
          'border-red-500/30'
        }`}>
          <div className="flex items-center gap-2">
            {overallStatus === 'pass' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
            {overallStatus === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400" />}
            {overallStatus === 'fail' && <AlertCircle className="w-5 h-5 text-red-400" />}
            <div>
              <span className={`text-sm font-bold ${
                overallStatus === 'pass' ? 'text-emerald-400' :
                overallStatus === 'warning' ? 'text-amber-400' :
                'text-red-400'
              }`}>
                {overallStatus === 'pass' ? 'AVAILABLE CHECKS PASSED' :
                 overallStatus === 'warning' ? 'REVIEW WARNINGS' :
                 overallStatus === 'pending' ? 'NOT ASSESSED YET' :
                 'NOT READY — FIX ERRORS'}
              </span>
              <p className="text-[10px] text-gray-500 mt-0.5">
                {stats.fail > 0 ? `${stats.fail} check(s) failed — review measurements and inputs` :
                 stats.warning > 0 ? `${stats.warning} warning(s) — review recommended` :
                 stats.pending > 0 || stats.pass === 0
                   ? `${stats.pending} check(s) cannot be judged until there is data — Generated plans require surveyor review before submission`
                   : 'All quality checks passed'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`p-2 rounded-lg ${bg} border border-white/[0.04] text-center`}>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[9px] text-gray-500 uppercase tracking-wider">{label}</div>
    </div>
  )
}
