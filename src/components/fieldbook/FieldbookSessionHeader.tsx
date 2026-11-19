'use client'

/**
 * FieldbookSessionHeader — one collapsible header shared by every observation
 * tab (leveling, traverse, control). It records the conditions an observation
 * was made under, not a certification: the values are saved with the book and
 * printed with the export.
 */

import { ChevronDown } from 'lucide-react'
import type { FieldbookSession } from '@/app/fieldbook/types'

type Props = {
  session: FieldbookSession
  onChange: (patch: Partial<FieldbookSession>) => void
  /** Mobile renders the same fields with larger touch targets. */
  compact?: boolean
}

const inputClass =
  'mt-1 block min-h-11 w-full min-w-0 rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 text-base md:text-sm'

export function FieldbookSessionHeader({ session, onChange, compact = false }: Props) {
  const summaryParts = [
    session.date ? `Date ${session.date}` : 'Date not set',
    session.party.trim() || 'Party not set',
    [session.instrumentMake, session.instrumentModel].filter(Boolean).join(' ') || 'Instrument not set',
    session.crs.trim() ? `CRS ${session.crs}` : 'CRS not set',
  ]

  return (
    <details className="card group p-3" data-testid="fieldbook-session">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]">
            Session header
          </span>
          <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">
            {summaryParts.join(' · ')}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>

      <div className={`mt-3 grid gap-3 ${compact ? 'grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
        <label className="text-xs font-medium text-[var(--text-secondary)]">
          Date
          <input
            type="date"
            className={inputClass}
            value={session.date}
            onChange={(event) => onChange({ date: event.target.value })}
          />
        </label>

        <label className="text-xs font-medium text-[var(--text-secondary)]">
          Party / crew
          <input
            type="text"
            className={inputClass}
            placeholder="Names of the survey party"
            value={session.party}
            onChange={(event) => onChange({ party: event.target.value })}
          />
        </label>

        <label className="text-xs font-medium text-[var(--text-secondary)]">
          Weather
          <input
            type="text"
            className={inputClass}
            placeholder="e.g. overcast, light wind"
            value={session.weather}
            onChange={(event) => onChange({ weather: event.target.value })}
          />
        </label>

        <label className="text-xs font-medium text-[var(--text-secondary)]">
          Instrument make
          <input
            type="text"
            className={inputClass}
            placeholder="e.g. Leica"
            value={session.instrumentMake}
            onChange={(event) => onChange({ instrumentMake: event.target.value })}
          />
        </label>

        <label className="text-xs font-medium text-[var(--text-secondary)]">
          Instrument model
          <input
            type="text"
            className={inputClass}
            placeholder="e.g. TS16"
            value={session.instrumentModel}
            onChange={(event) => onChange({ instrumentModel: event.target.value })}
          />
        </label>

        <label className="text-xs font-medium text-[var(--text-secondary)]">
          Serial number
          <input
            type="text"
            className={inputClass}
            placeholder="Instrument serial"
            value={session.instrumentSerial}
            onChange={(event) => onChange({ instrumentSerial: event.target.value })}
          />
        </label>

        <label className="text-xs font-medium text-[var(--text-secondary)]">
          Calibration date
          <input
            type="date"
            className={inputClass}
            value={session.calibrationDate}
            onChange={(event) => onChange({ calibrationDate: event.target.value })}
          />
        </label>

        <label className="text-xs font-medium text-[var(--text-secondary)]">
          Calibration reference
          <input
            type="text"
            className={inputClass}
            placeholder="Certificate or baseline report"
            value={session.calibrationReference}
            onChange={(event) => onChange({ calibrationReference: event.target.value })}
          />
        </label>

        <label className="text-xs font-medium text-[var(--text-secondary)]">
          Units
          <select
            className={inputClass}
            value={session.units}
            onChange={(event) => onChange({ units: event.target.value === 'feet' ? 'feet' : 'metres' })}
          >
            <option value="metres">Metres</option>
            <option value="feet">Feet</option>
          </select>
        </label>

        <label className="text-xs font-medium text-[var(--text-secondary)]">
          CRS / survey grid
          <input
            type="text"
            className={inputClass}
            placeholder="e.g. EPSG:32637 — as declared"
            value={session.crs}
            onChange={(event) => onChange({ crs: event.target.value })}
          />
        </label>
      </div>

      <p className="mt-3 text-xs text-[var(--text-muted)]">
        Recorded with the book and printed with exports. These are declared field conditions — not a
        certification of accuracy. The map and computations use the project&apos;s declared survey grid.
      </p>
    </details>
  )
}
