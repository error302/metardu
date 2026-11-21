'use client'

/**
 * CrsPicker — the one way a CRS enters the platform: selected from the
 * registry, never typed.
 *
 * Typing an EPSG code invites silent wrong-coordinate bugs (a digit, a
 * transposed zone, EPSG:3857 used as a survey plane). This component only
 * offers codes registered in src/lib/spatial/projectCrs.ts, grouped so a
 * surveyor can find the national grid fast, and it surfaces the datum,
 * units and transformation notes of the chosen code below the field.
 *
 * A filter box narrows the list; it never sets the value. The <select> is
 * the only control that changes the CRS.
 */

import { useMemo, useState } from 'react'
import { describeCrs, listSupportedCrs, type CrsInfo } from '@/lib/spatial/projectCrs'

export interface CrsPickerProps {
  id: string
  /** Visible label above the picker. */
  label: string
  /** Current CRS code (canonical, e.g. 'EPSG:21037'), '' when unset. */
  value: string
  onChange: (code: string) => void
  /**
   * Offer geographic (degree) CRSs too. Survey-plane pickers (contours,
   * imports destined for plane math) should leave this off.
   */
  allowGeographic?: boolean
  /** Fire onChange('') — the picker gains a "no CRS selected" option. */
  required?: boolean
  disabled?: boolean
  /** Shown under the metadata block (e.g. "read this from the export settings"). */
  hint?: string
  /**
   * Where an auto-applied value came from, shown with the summary so a
   * prefilled CRS is never mistaken for a surveyor's own choice.
   */
  provenance?: string
}

const pickerClass =
  'min-h-11 w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50'

/** Sort key so a surveyor meets national grids before the generic UTM wall. */
function optionLabel(info: CrsInfo): string {
  const zone = info.zone ? ` zone ${info.zone}${info.hemisphere ?? ''}` : ''
  return `${info.code} — ${info.datum}${zone}`
}

export function CrsPicker({
  id, label, value, onChange, allowGeographic = false, required = false, disabled = false, hint, provenance,
}: CrsPickerProps) {
  const [filter, setFilter] = useState('')

  const options = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return listSupportedCrs()
      .filter((info) => !info.displayOnly && (allowGeographic || info.projected))
      .filter((info) => !needle ||
        `${info.code} ${info.name} ${info.datum}`.toLowerCase().includes(needle))
      .sort((a, b) => optionLabel(a).localeCompare(optionLabel(b)))
  }, [filter, allowGeographic])

  // The value is described from the registry, never from what the caller
  // happens to hold: legacy typed codes get an honest "not in registry".
  const selected = value ? describeCrs(value) : null
  const selectedUnregistered = Boolean(value) && !selected

  return (
    <div className="min-w-0">
      <label htmlFor={`${id}-select`} className="block text-xs font-medium text-[var(--text-secondary)]">
        {label}
      </label>
      <input
        type="search"
        role="searchbox"
        aria-label={`Filter ${label} by code, name or datum`}
        placeholder="Filter by code, name or datum…"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        autoComplete="off"
        disabled={disabled}
        className={`${pickerClass} mt-1`}
      />
      <select
        id={`${id}-select`}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`${pickerClass} mt-2`}
      >
        {!required && <option value="">No CRS selected</option>}
        {required && !value && <option value="">Choose a CRS…</option>}
        {options.map((info) => (
          <option key={info.code} value={info.code}>{optionLabel(info)}</option>
        ))}
      </select>

      {selectedUnregistered && (
        <p role="alert" className="mt-2 text-xs text-amber-300">
          “{value}” is not in the CRS registry. Select a registered CRS — METARDU never guesses a datum.
        </p>
      )}
      {selected && (
        <p className="mt-2 text-xs text-[var(--text-secondary)]" data-testid={`${id}-summary`}>
          {selected.code} · {selected.name} · datum {selected.datum} · {selected.units}
          {selected.notes ? ` · ${selected.notes}` : ''}
        </p>
      )}
      {selected && provenance && (
        <p className="mt-1 text-xs text-[var(--text-muted)]" data-testid={`${id}-provenance`}>
          Auto-applied {provenance}. Change it here if this work used a different grid.
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  )
}
