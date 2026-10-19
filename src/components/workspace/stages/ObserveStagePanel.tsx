'use client'

/**
 * ObserveStagePanel — Observation batches and field observation management.
 *
 * Blueprint reference:
 *   §2.3 Raw observations are immutable — batch model preserves original evidence
 *   §5.2 Observe — observation batches, raw file hashes, operator, crew, instrument metadata
 *   §6.4 Observation batches (traceability, rollback, instrument link)
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Eye, Plus, FileText, RefreshCw, Hash, Copy, Check, BookOpen } from 'lucide-react'
import type { ObservationBatch, ObservationSourceType } from '@/lib/observations/observationBatches'
import type { SurveyType } from '@/types/project'
import DynamicFieldBook from '@/components/workspace/DynamicFieldBook'

interface Props {
  projectId: string
  surveyType?: SurveyType
}

export default function ObserveStagePanel({ projectId, surveyType = 'cadastral' }: Props) {
  const [activeTab, setActiveTab] = useState<'batches' | 'fieldbook'>('batches')
  const [batches, setBatches] = useState<ObservationBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedHash, setCopiedHash] = useState<string | null>(null)

  // Form state
  const [batchNumber, setBatchNumber] = useState('')
  const [sourceType, setSourceType] = useState<ObservationSourceType>('total_station')
  const [sourceFileName, setSourceFileName] = useState('')
  const [operator, setOperator] = useState('')
  const [crew, setCrew] = useState('')
  const [instrumentName, setInstrumentName] = useState('')
  const [station, setStation] = useState('')
  const [backsight, setBacksight] = useState('')
  const [ih, setIh] = useState('')
  const [th, setTh] = useState('')
  const [notes, setNotes] = useState('')

  const fetchBatches = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/project/${projectId}/batches`)
      if (!res.ok) throw new Error('Failed to load observation batches')
      const json = (await res.json()) as { data?: { batches?: ObservationBatch[] } }
      setBatches(json.data?.batches || [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading batches')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchBatches()
  }, [fetchBatches])

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      setError(null)

      const res = await fetch(`/api/project/${projectId}/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchNumber: batchNumber.trim(),
          sourceType,
          sourceFileName: sourceFileName.trim() || undefined,
          operator: operator.trim() || undefined,
          crew: crew.trim() || undefined,
          instrumentName: instrumentName.trim() || undefined,
          station: station.trim() || undefined,
          backsight: backsight.trim() || undefined,
          instrumentHeight: ih ? parseFloat(ih) : undefined,
          targetHeight: th ? parseFloat(th) : undefined,
          notes: notes.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const j = (await res.json()) as { error?: string }
        throw new Error(j.error || 'Failed to create observation batch')
      }

      setBatchNumber('')
      setSourceFileName('')
      setStation('')
      setBacksight('')
      setIh('')
      setTh('')
      setNotes('')
      setShowAddModal(false)
      fetchBatches()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error creating batch')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash)
    setCopiedHash(hash)
    setTimeout(() => setCopiedHash(null), 2000)
  }

  return (
    <div className="space-y-4">
      {/* Sub-navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--border-color)] pb-2">
        <button
          onClick={() => setActiveTab('batches')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'batches'
              ? 'bg-[var(--accent)] text-black'
              : 'text-[var(--text-muted)] hover:text-white hover:bg-white/5'
          }`}
        >
          <Hash className="w-3.5 h-3.5" />
          Observation Batches ({batches.length})
        </button>
        <button
          onClick={() => setActiveTab('fieldbook')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'fieldbook'
              ? 'bg-[var(--accent)] text-black'
              : 'text-[var(--text-muted)] hover:text-white hover:bg-white/5'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          Field Book Entries
        </button>
      </div>

      {activeTab === 'fieldbook' ? (
        <div className="border border-[var(--border-color)] rounded-xl p-4 bg-[var(--bg-secondary)]">
          <DynamicFieldBook projectId={projectId} surveyType={surveyType} />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Batches Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-[var(--accent)]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                Observation Batches
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchBatches}
                className="p-1.5 rounded-md hover:bg-white/5 text-[var(--text-muted)] transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-black text-xs font-semibold hover:bg-[var(--accent-dim)] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                New Batch
              </button>
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
              {error}
            </div>
          )}

          {/* Batches List */}
          {loading && batches.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)]">
              Loading observation batches...
            </div>
          ) : batches.length === 0 ? (
            <div className="p-8 text-center space-y-2 border border-[var(--border-color)] rounded-xl bg-[var(--bg-secondary)]">
              <FileText className="w-6 h-6 mx-auto text-[var(--text-muted)] opacity-50" />
              <p className="text-xs text-[var(--text-muted)]">
                No observation batches registered for this project yet.
              </p>
              <p className="text-[11px] text-[var(--text-muted)] max-w-sm mx-auto">
                Register field sessions and their source file names. A SHA-256 digest is shown only when source content is supplied.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="text-xs text-[var(--accent)] underline hover:text-[var(--accent-dim)]"
              >
                Create first observation batch
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {batches.map((batch) => (
                <div
                  key={batch.id}
                  className="p-3.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] space-y-2 hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 break-all font-mono text-xs font-bold text-[var(--text-primary)]">
                          {batch.batch_number}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full uppercase font-bold bg-white/5 text-[var(--text-secondary)] border border-[var(--border-color)]">
                          {batch.source_type.replace('_', ' ')}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase">
                          {batch.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        {batch.station && <span>Station: <strong className="text-[var(--text-secondary)]">{batch.station}</strong></span>}
                        {batch.backsight && <span>Backsight: <strong className="text-[var(--text-secondary)]">{batch.backsight}</strong></span>}
                        {batch.operator && <span>Observer: <strong className="text-[var(--text-secondary)]">{batch.operator}</strong></span>}
                        {batch.instrument_name && <span>Instrument: <strong className="text-[var(--text-secondary)]">{batch.instrument_name}</strong></span>}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--text-muted)] whitespace-nowrap">
                      {new Date(batch.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {batch.source_file_hash && (
                    <div className="flex items-center justify-between text-[10px] font-mono bg-black/30 px-2 py-1 rounded border border-[var(--border-color)]">
                      <span className="text-[var(--text-muted)] truncate max-w-[280px]">
                        SHA-256: {batch.source_file_hash}
                      </span>
                      <button
                        onClick={() => {
                          if (batch.source_file_hash) handleCopyHash(batch.source_file_hash)
                        }}
                        className="text-[var(--accent)] hover:text-white p-0.5"
                        title="Copy SHA-256 hash"
                      >
                        {copiedHash === batch.source_file_hash ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: Add Observation Batch */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-color)] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Create Observation Batch
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-[var(--text-muted)] hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBatch} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    Batch Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="BATCH-2026-09-01"
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] font-mono focus:border-[var(--accent)] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    Observation Type *
                  </label>
                  <select
                    value={sourceType}
                    onChange={(e) => setSourceType(e.target.value as ObservationSourceType)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
                  >
                    <option value="total_station">Total Station</option>
                    <option value="gnss_rtk">GNSS RTK</option>
                    <option value="gnss_static">GNSS Static</option>
                    <option value="digital_level">Digital Level</option>
                    <option value="auto_level">Optical Level</option>
                    <option value="manual">Manual Field Book</option>
                    <option value="uav_gcp">UAV GCP</option>
                    <option value="as_built">As-Built Check</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    Station Point
                  </label>
                  <input
                    type="text"
                    placeholder="STN-1"
                    value={station}
                    onChange={(e) => setStation(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    Backsight Point
                  </label>
                  <input
                    type="text"
                    placeholder="BM-1"
                    value={backsight}
                    onChange={(e) => setBacksight(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    Instrument Height (m)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    placeholder="1.550"
                    value={ih}
                    onChange={(e) => setIh(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] font-mono focus:border-[var(--accent)] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    Target Height (m)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    placeholder="1.600"
                    value={th}
                    onChange={(e) => setTh(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] font-mono focus:border-[var(--accent)] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    Observer / Surveyor
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Eng. Omondi"
                    value={operator}
                    onChange={(e) => setOperator(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    Instrument Model / ID
                  </label>
                  <input
                    type="text"
                    placeholder="Leica TS06 Plus"
                    value={instrumentName}
                    onChange={(e) => setInstrumentName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  Field crew
                </label>
                <input
                  type="text"
                  placeholder="Crew or team name"
                  value={crew}
                  onChange={(e) => setCrew(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  Source file name (reference only)
                </label>
                <input
                  type="text"
                  placeholder="JOB_20260901.GSI"
                  value={sourceFileName}
                  onChange={(e) => setSourceFileName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] font-mono focus:border-[var(--accent)] outline-none"
                />
                <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                  This form records the filename only. It does not upload or hash the file.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border-color)] text-xs font-semibold hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-[var(--accent)] text-black text-xs font-semibold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
