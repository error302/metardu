'use client';

/**
 * FeatureCodePicker — pick the field code that decides the CAD layer.
 *
 * Replaces the seven hard-coded chips the collector used to show. Those labels
 * were not in KENYA_FIELD_CODE_TABLE, so a code captured on site never reached
 * field-to-finish linework or the DXF layer standard. This picker uses that one
 * table: every choice states the layer it will produce, recent codes come first
 * (a crew shoots fence, then wall, then fence again), and the full list is one
 * search away.
 */

import { useEffect, useId, useMemo, useState } from 'react'
import {
  filterFieldCodes,
  findFieldCode,
  quickFieldCodes,
  readRecentFieldCodes,
  rememberFieldCode,
  surveyProfile,
  type SurveyProfile,
} from '@/lib/field/fieldCodePicker'

interface FeatureCodePickerProps {
  value: string
  onChange: (code: string) => void
  surveyType?: string
  sunlightMode?: boolean
  disabled?: boolean
}

export function FeatureCodePicker({
  value,
  onChange,
  surveyType,
  sunlightMode = false,
  disabled = false,
}: FeatureCodePickerProps) {
  const profile: SurveyProfile = useMemo(() => surveyProfile(surveyType), [surveyType])
  const [recent, setRecent] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const searchId = useId()

  // Read after mount: localStorage is not available during the server render.
  useEffect(() => setRecent(readRecentFieldCodes()), [])

  const quick = useMemo(() => quickFieldCodes(profile, recent), [profile, recent])
  const results = useMemo(() => filterFieldCodes(query, profile), [query, profile])
  const selected = findFieldCode(value)

  function choose(code: string) {
    const next = code.trim().toUpperCase()
    onChange(next)
    setRecent(rememberFieldCode(next))
    setListOpen(false)
    setQuery('')
  }

  const chipClass = (active: boolean) =>
    `min-h-11 shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition-colors ${
      active
        ? 'border-[var(--accent)] bg-[var(--accent)] text-black shadow-md'
        : sunlightMode
          ? 'border-2 border-black bg-white text-black hover:bg-gray-100'
          : 'border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:border-[var(--accent)]'
    }`

  return (
    <div className="w-full max-w-md">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--text-secondary)]">Feature code</span>
        {/* The layer is the point of coding: it tells the crew the drawing it will produce. */}
        <span className="text-xs text-[var(--text-muted)]">
          {selected ? `${selected.label} → layer ${selected.layer}` : 'Uncoded — not sent to a layer'}
        </span>
      </div>

      <div className="flex w-full gap-2 overflow-x-auto pb-2 scrollbar-hide" role="group" aria-label="Quick feature codes">
        {quick.map(definition => (
          <button
            key={definition.code}
            type="button"
            aria-pressed={value.toUpperCase() === definition.code}
            aria-label={`${definition.code} — ${definition.label}, layer ${definition.layer}`}
            title={`${definition.label} → layer ${definition.layer}`}
            disabled={disabled}
            onClick={() => (value.toUpperCase() === definition.code ? onChange('') : choose(definition.code))}
            className={chipClass(value.toUpperCase() === definition.code)}
          >
            {definition.code}
          </button>
        ))}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          aria-expanded={listOpen}
          aria-controls={searchId}
          onClick={() => setListOpen(open => !open)}
          className="min-h-11 rounded-md px-2 text-xs font-semibold text-[var(--accent)] underline underline-offset-2"
        >
          {listOpen ? 'Hide all codes' : `All codes (${quick.length} quick)`}
        </button>
        {value && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange('')}
            className="min-h-11 rounded-md px-2 text-xs text-[var(--text-muted)] underline underline-offset-2"
          >
            Clear code
          </button>
        )}
      </div>

      {listOpen && (
        <div className="mt-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
          <label className="block text-xs font-semibold text-[var(--text-secondary)]" htmlFor={searchId}>
            Search by code, name or category
          </label>
          <input
            id={searchId}
            value={query}
            disabled={disabled}
            onChange={event => setQuery(event.target.value)}
            placeholder="e.g. fence, BLD, utility"
            autoCapitalize="characters"
            spellCheck={false}
            className="mt-1 min-h-11 w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
          />
          <ul className="mt-2 max-h-64 overflow-y-auto" aria-label="Feature codes">
            {results.map(definition => (
              <li key={definition.code}>
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={value.toUpperCase() === definition.code}
                  onClick={() => choose(definition.code)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-2 text-left hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
                >
                  <span className="font-mono text-sm font-bold">{definition.code}</span>
                  <span className="flex-1 truncate text-xs text-[var(--text-secondary)]">{definition.label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{definition.layer}</span>
                </button>
              </li>
            ))}
          </ul>
          {results.length === 0 && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              No code matches “{query.trim()}”. Codes must come from the survey code table so the drawing layers stay consistent.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default FeatureCodePicker
