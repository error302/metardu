'use client'

/**
 * VerifyStagePanel — Quality assurance, tolerance checks, and cryptographic evidence timeline.
 *
 * Blueprint reference:
 *   §2.5 Every PASS must have evidence
 *   §5.5 Verify — topology, closure, area reconciliation, tolerances, evidence
 *   §14 METARDU Assure
 *   §14.3 Evidence events timeline
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { ShieldCheck, History, RefreshCw, Lock } from 'lucide-react'
import { QADashboard } from '@/components/dashboard/QADashboard'
import type { EvidenceEvent } from '@/lib/observations/observationBatches'

interface Props {
  projectId: string
  projectName: string
  /**
   * Project geometry already loaded by the stage shell. QA checks run against
   * the surveyor's own boundary; without it the dashboard can only ever show
   * "pending", which reads like a pass and is not one.
   */
  boundaryData?: { adjustedStations?: StationLike[] | null; stations?: StationLike[] } | null
}

interface StationLike {
  pointName?: string
  name?: string
  adjustedEasting?: number
  easting?: number
  adjustedNorthing?: number
  northing?: number
  elevation?: number | null
}

export default function VerifyStagePanel({ projectId, projectName, boundaryData }: Props) {
  const [activeTab, setActiveTab] = useState<'qa' | 'evidence'>('qa')
  const [events, setEvents] = useState<EvidenceEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)

  /**
   * Build the QA input from the project's own measured geometry (adjusted
   * stations first, raw stations as a fallback). The dashboard runs topology,
   * closure and area checks on this — previously it received no geometry at
   * all and every row silently reported PENDING.
   */
  const qaParcels = useMemo(() => {
    const stations = boundaryData?.adjustedStations ?? boundaryData?.stations ?? [];
    const vertices = stations
      .map((station, index) => ({
        name: station.pointName ?? station.name ?? `P${index + 1}`,
        easting: Number(station.adjustedEasting ?? station.easting ?? NaN),
        northing: Number(station.adjustedNorthing ?? station.northing ?? NaN),
        elevation: station.elevation ?? null,
      }))
      .filter((point) => Number.isFinite(point.easting) && Number.isFinite(point.northing));
    if (vertices.length < 3) return [];
    return [{ id: `${projectId}-boundary`, name: `${projectName} boundary`, vertices }];
  }, [boundaryData, projectId, projectName]);

  const fetchEvidence = useCallback(async () => {
    try {
      setLoadingEvents(true)
      const res = await fetch(`/api/project/${projectId}/evidence`)
      if (!res.ok) throw new Error('Failed to load evidence timeline')
      const json: unknown = await res.json()
      const events = (json as { data?: { events?: unknown } } | null)?.data?.events
      setEvents(Array.isArray(events) ? events as EvidenceEvent[] : [])
    } catch {
      // Preserve the empty timeline when evidence cannot be loaded.
    } finally {
      setLoadingEvents(false)
    }
  }, [projectId])

  useEffect(() => {
    if (activeTab === 'evidence') {
      fetchEvidence()
    }
  }, [activeTab, fetchEvidence])

  return (
    <div className="space-y-4">
      {/* Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-[var(--border-color)] pb-2">
        <button
          onClick={() => setActiveTab('qa')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'qa'
              ? 'bg-[var(--accent)] text-black'
              : 'text-[var(--text-muted)] hover:text-white hover:bg-white/5'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Automated Quality Gates
        </button>
        <button
          onClick={() => setActiveTab('evidence')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'evidence'
              ? 'bg-[var(--accent)] text-black'
              : 'text-[var(--text-muted)] hover:text-white hover:bg-white/5'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          Evidence Ledger ({events.length})
        </button>
      </div>

      {activeTab === 'qa' ? (
        <div className="space-y-4">
          {qaParcels.length > 0 ? (
            <QADashboard projectId={projectId} parcels={qaParcels} />
          ) : (
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] p-4 text-xs text-[var(--text-muted)]">
              No project geometry to verify yet. Run the Compute stage (or open the survey map and
              load the scheme) so boundary coordinates exist — QA checks need measured geometry, and
              an empty dashboard is not a pass.
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                Cryptographic Evidence Audit Trail
              </h3>
            </div>
            <button
              onClick={fetchEvidence}
              className="p-1.5 rounded-md hover:bg-white/5 text-[var(--text-muted)] transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingEvents ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <p className="text-[11px] text-[var(--text-muted)]">
            This timeline records observation batch creation and status changes with linked SHA-256 hashes. Review the source observations and QA results before relying on an output.
          </p>

          {loadingEvents && events.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)]">
              Loading evidence chain...
            </div>
          ) : events.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)] border border-[var(--border-color)] rounded-xl bg-[var(--bg-secondary)]">
              No evidence events recorded yet. Record an observation batch to start the timeline.
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((ev, idx) => (
                <div
                  key={ev.id}
                  className="p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[var(--text-primary)]">
                        #{events.length - idx} {ev.event_type}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-secondary)] font-mono">
                        {ev.entity_type}
                      </span>
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">
                      {new Date(ev.created_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="text-[10px] font-mono bg-black/30 p-2 rounded border border-[var(--border-color)] space-y-0.5">
                    <div className="text-emerald-400 truncate">
                      Event Hash: {ev.event_hash}
                    </div>
                    <div className="text-[var(--text-muted)] truncate">
                      Prev Hash: {ev.previous_hash || 'GENESIS'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
