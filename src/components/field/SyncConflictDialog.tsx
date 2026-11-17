'use client';

/**
 * SyncConflictDialog — let a person choose which copy of a record survives.
 *
 * The offline queue used to resolve this silently: whichever device synced last
 * overwrote the other, and nobody was told. Survey work is the one thing a crew
 * cannot re-do from memory, so the queue now retains the local edit and asks
 * here. Nothing is written until one of these buttons is pressed.
 */

import type { ConflictRecord } from '@/lib/offline/syncQueue'

interface SyncConflictDialogProps {
  conflict: ConflictRecord
  onResolve: (resolution: 'local' | 'remote') => void
  sunlightMode?: boolean
}

const TABLE_LABELS: Record<string, string> = {
  observations: 'field observation',
  survey_points: 'survey point',
  parcels: 'parcel',
  projects: 'project',
}

export function SyncConflictDialog({ conflict, onResolve, sunlightMode = false }: SyncConflictDialogProps) {
  const recordId = String(conflict.localOp.data.id ?? '')
  const fields = conflict.conflictingFields ?? []
  const label = TABLE_LABELS[conflict.localOp.table] ?? conflict.localOp.table

  const card = sunlightMode
    ? 'bg-white text-black border-2 border-black'
    : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-color)]'

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="sync-conflict-heading">
      <div className={`w-full max-w-md rounded-xl p-4 shadow-2xl ${card}`}>
        <h2 id="sync-conflict-heading" className="text-base font-bold">
          This {label} changed on another device
        </h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Your edit is still on this device and nothing has been written to the server. Choose which version to keep —
          the other one is discarded for this record.
        </p>

        <dl className="mt-3 space-y-1 text-xs text-[var(--text-secondary)]">
          <div className="flex gap-2">
            <dt className="font-semibold">Record</dt>
            <dd className="truncate font-mono">{recordId}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold">Your edit</dt>
            <dd className="font-mono">{conflict.localOp.timestamp}</dd>
          </div>
          {fields.length > 0 && (
            <div className="flex gap-2">
              <dt className="font-semibold">Differing fields</dt>
              <dd className="font-mono break-words">{fields.join(', ')}</dd>
            </div>
          )}
        </dl>

        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={() => onResolve('local')}
            className="btn btn-secondary min-h-11"
          >
            Keep this device’s version
          </button>
          <button
            type="button"
            onClick={() => onResolve('remote')}
            className="btn btn-secondary min-h-11"
          >
            Keep the server version
          </button>
        </div>

        <p className="mt-3 text-xs text-[var(--text-muted)]">
          To keep both, copy the values you need from this device first and re-enter them after choosing.
        </p>
      </div>
    </div>
  )
}

export default SyncConflictDialog
