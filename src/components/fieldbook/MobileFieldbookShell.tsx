'use client';

/**
 * MobileFieldbookShell
 * ---------------------
 * Renders the active survey type as a list of touch-friendly cards
 * instead of wide desktop tables.  Designed for the field — where
 * the surveyor's primary device is a phone.
 *
 * Includes:
 *   • Sticky top status bar (online/offline, sync, last saved)
 *   • Survey type selector as horizontally scrollable chips
 *   • Card list of readings with swipe-to-delete
 *   • Floating Action Button (FAB) for quick add
 *   • Pull-to-refresh-style sync affordance
 */

import { useState } from 'react'
import { Wifi, WifiOff, CloudUpload, Plus, Trash2, ChevronUp, CheckCircle2, AlertTriangle, Clock, History } from 'lucide-react'
import type { MobileSurveyType } from './UniversalMobileObservationForm'
import { UniversalMobileObservationForm } from './UniversalMobileObservationForm'
import type { CapturedBeaconPhoto } from './BeaconPhotoCapture'

type Row = { id: string; [key: string]: string }

interface MobileFieldbookShellProps {
  surveyType: MobileSurveyType
  onSurveyTypeChange: (t: MobileSurveyType) => void
  rows: Row[]
  onAddRow: (row: Record<string, string>, photos: CapturedBeaconPhoto[]) => void
  onRemoveRow: (id: string) => void
  online: boolean
  lastSaved?: string | null
  unsyncedCount?: number
  onSync?: () => void
  stationName?: string
  /** When provided, shows a "Pull from instrument" button in the add form. */
  onPullInstrumentReading?: () => Promise<Partial<Record<string, string>>>
  /** When provided, shows an audit-trail button in the status bar. */
  onViewAuditLog?: () => void
}

const TYPE_LABELS: Record<MobileSurveyType, { label: string; emoji: string }> = {
  leveling:     { label: 'Leveling',     emoji: '📏' },
  traverse:     { label: 'Traverse',     emoji: '🧭' },
  control:      { label: 'Control',      emoji: '📍' },
  hydrographic: { label: 'Hydrographic', emoji: '🌊' },
  mining:       { label: 'Mining',       emoji: '⛏️' },
}

/** Per-survey-type primary fields to display on each card (in order). */
const CARD_FIELDS: Record<MobileSurveyType, { key: string; label: string; mono?: boolean }[]> = {
  leveling: [
    { key: 'station', label: 'Station' },
    { key: 'bs', label: 'BS', mono: true },
    { key: 'is', label: 'IS', mono: true },
    { key: 'fs', label: 'FS', mono: true },
  ],
  traverse: [
    { key: 'station', label: 'Station' },
    { key: 'bearing', label: 'Bearing', mono: true },
    { key: 'slopeDist', label: 'Dist', mono: true },
    { key: 'vaDeg', label: 'VA', mono: true },
  ],
  control: [
    { key: 'pointId', label: 'Point' },
    { key: 'bearing', label: 'Bearing', mono: true },
    { key: 'slopeDistance', label: 'Dist', mono: true },
    { key: 'verticalAngle', label: 'VA', mono: true },
  ],
  hydrographic: [
    { key: 'soundingId', label: 'Sounding' },
    { key: 'depth', label: 'Depth', mono: true },
    { key: 'easting', label: 'E', mono: true },
    { key: 'northing', label: 'N', mono: true },
  ],
  mining: [
    { key: 'pointId', label: 'Point' },
    { key: 'bearing', label: 'Bearing', mono: true },
    { key: 'slopeDistance', label: 'Dist', mono: true },
    { key: 'verticalAngle', label: 'VA', mono: true },
  ],
}

export function MobileFieldbookShell({
  surveyType,
  onSurveyTypeChange,
  rows,
  onAddRow,
  onRemoveRow,
  online,
  lastSaved,
  unsyncedCount = 0,
  onSync,
  stationName,
  onPullInstrumentReading,
  onViewAuditLog,
}: MobileFieldbookShellProps) {
  const [showForm, setShowForm] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const lastStation = rows.length > 0
    ? (rows[rows.length - 1].station || rows[rows.length - 1].pointId || rows[rows.length - 1].soundingId || '')
    : ''

  const cardFields = CARD_FIELDS[surveyType]

  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)] bg-[var(--bg-primary)]">
      {/* ─── Sticky status bar ─── */}
      <div className="sticky top-0 z-30 bg-[var(--bg-secondary)]/90 backdrop-blur-md border-b border-[var(--border-color)] px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={[
            'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
            online ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
          ].join(' ')}>
            {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{online ? 'Online' : 'Offline'}</span>
          </div>
          {unsyncedCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              {unsyncedCount} pending
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {lastSaved && (
            <span className="text-[10px] text-[var(--text-muted)] hidden xs:inline">
              <Clock className="w-3 h-3 inline mr-0.5" />
              {new Date(lastSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {onViewAuditLog && (
            <button
              onClick={onViewAuditLog}
              className="grid place-items-center w-7 h-7 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              aria-label="View audit log"
              title="Audit trail"
            >
              <History className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onSync}
            disabled={!online || !onSync || unsyncedCount === 0}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition',
              online && onSync && unsyncedCount > 0
                ? 'bg-[var(--accent)] text-black active:scale-95'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed',
            ].join(' ')}
          >
            <CloudUpload className="w-3.5 h-3.5" />
            Sync
          </button>
        </div>
      </div>

      {/* ─── Survey type chips ─── */}
      <div className="sticky top-[44px] z-20 bg-[var(--bg-primary)]/95 backdrop-blur-sm border-b border-[var(--border-color)] px-4 py-2.5">
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
          {(Object.keys(TYPE_LABELS) as MobileSurveyType[]).map((t) => {
            const meta = TYPE_LABELS[t]
            const active = t === surveyType
            return (
              <button
                key={t}
                onClick={() => onSurveyTypeChange(t)}
                className={[
                  'flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all active:scale-95',
                  active
                    ? 'bg-[var(--accent)] text-black shadow-md shadow-[var(--accent)]/25'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--accent)]/40',
                ].join(' ')}
              >
                <span className="text-base leading-none">{meta.emoji}</span>
                <span>{meta.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── Card list ─── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 pb-28">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="grid place-items-center w-16 h-16 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-color)] mb-4">
              <Plus className="w-7 h-7 text-[var(--text-muted)]" />
            </div>
            <p className="text-base font-medium text-[var(--text-secondary)] mb-1">No readings yet</p>
            <p className="text-sm text-[var(--text-muted)] max-w-xs">
              Tap the <span className="text-[var(--accent)] font-semibold">+</span> button below to record your first {TYPE_LABELS[surveyType].label.toLowerCase()} observation.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* Summary line at top */}
            <div className="flex items-center justify-between px-1 pb-1 text-xs text-[var(--text-muted)]">
              <span>{rows.length} reading{rows.length !== 1 ? 's' : ''}</span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Auto-saved locally
              </span>
            </div>

            {rows.map((row, idx) => {
              const isDeleting = confirmDelete === row.id
              return (
                <div
                  key={row.id}
                  className={[
                    'relative bg-[var(--bg-card)] rounded-xl border transition-all overflow-hidden',
                    isDeleting
                      ? 'border-red-500/50 ring-2 ring-red-500/30'
                      : 'border-[var(--border-color)] hover:border-[var(--accent)]/30',
                  ].join(' ')}
                >
                  <div className="flex items-stretch">
                    {/* Card body */}
                    <div className="flex-1 p-3.5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-[var(--text-muted)]">
                          #{String(idx + 1).padStart(2, '0')}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] font-mono">
                          {row._timestamp ? new Date(row._timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        {cardFields.map((f) => {
                          const val = row[f.key]
                          return (
                            <div key={f.key} className="min-w-0">
                              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] truncate">{f.label}</div>
                              <div className={[
                                'text-sm truncate',
                                f.mono ? 'font-mono text-[var(--text-primary)]' : 'font-semibold text-[var(--accent)]',
                              ].join(' ')}>
                                {val || '—'}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      {row.remarks && (
                        <p className="mt-2 text-xs text-[var(--text-secondary)] italic line-clamp-2">
                          “{row.remarks}”
                        </p>
                      )}
                    </div>

                    {/* Delete button column */}
                    <button
                      onClick={() => {
                        if (isDeleting) {
                          onRemoveRow(row.id)
                          setConfirmDelete(null)
                        } else {
                          setConfirmDelete(row.id)
                          setTimeout(() => setConfirmDelete(null), 3000)
                        }
                      }}
                      className={[
                        'flex flex-col items-center justify-center w-14 transition-colors',
                        isDeleting
                          ? 'bg-red-500/15 text-red-400'
                          : 'bg-[var(--bg-secondary)]/30 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400',
                      ].join(' ')}
                      aria-label="Delete reading"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="text-[9px] mt-0.5 uppercase tracking-wider">
                        {isDeleting ? 'Tap again' : 'Delete'}
                      </span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ─── Floating Action Button ─── */}
      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-6 right-5 z-40 grid place-items-center w-16 h-16 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dim)] text-black shadow-2xl shadow-[var(--accent)]/40 active:scale-95 transition-all"
        aria-label={`Add ${TYPE_LABELS[surveyType].label} reading`}
      >
        <Plus className="w-7 h-7" strokeWidth={2.5} />
        <span className="sr-only">Add reading</span>
      </button>

      {showForm && (
        <UniversalMobileObservationForm
          surveyType={surveyType}
          stationName={stationName}
          lastStation={lastStation}
          onPullInstrumentReading={onPullInstrumentReading}
          onAdd={async (row, photos) => {
            onAddRow({ ...row, _timestamp: new Date().toISOString() }, photos)
            setShowForm(false)
          }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}
