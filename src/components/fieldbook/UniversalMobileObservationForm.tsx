'use client';

/**
 * UniversalMobileObservationForm
 * ------------------------------
 * A single bottom-sheet form that adapts its fields to whichever
 * FieldbookType is currently active on the /fieldbook page.
 *
 * Why this exists:
 *   The old QuickAddModal only supported polar observations
 *   (HA / VA / SD) and was therefore unusable for leveling,
 *   hydrographic, mining, etc.  Field surveyors on phones
 *   needed ONE quick-entry surface that works for every
 *   survey type METARDU supports.
 */

import { useState, useEffect, useMemo } from 'react'
import { X, Camera, Check, ChevronDown, MapPin, Ruler, Compass, Mountain, Waves, Pickaxe } from 'lucide-react'

export type MobileSurveyType = 'leveling' | 'traverse' | 'control' | 'hydrographic' | 'mining'

interface FieldDef {
  key: string
  label: string
  placeholder?: string
  inputMode?: 'decimal' | 'numeric' | 'text'
  step?: string
  default?: string
  required?: boolean
  /** when true, uppercase + auto-advance on Enter */
  station?: boolean
}

const FIELD_SETS: Record<MobileSurveyType, FieldDef[]> = {
  leveling: [
    { key: 'station', label: 'Station / TP', placeholder: 'TP1', station: true, required: true },
    { key: 'bs', label: 'Backsight (BS)', placeholder: '1.245', inputMode: 'decimal', step: '0.001' },
    { key: 'is', label: 'Intermediate (IS)', placeholder: '1.502', inputMode: 'decimal', step: '0.001' },
    { key: 'fs', label: 'Foresight (FS)', placeholder: '0.873', inputMode: 'decimal', step: '0.001' },
    { key: 'remarks', label: 'Remarks', placeholder: 'Concrete BM, flush' },
  ],
  traverse: [
    { key: 'station', label: 'Station', placeholder: 'A1', station: true, required: true },
    { key: 'bearing', label: 'Bearing', placeholder: '45°30\'20"', inputMode: 'decimal' },
    { key: 'slopeDist', label: 'Slope Dist (m)', placeholder: '125.456', inputMode: 'decimal', step: '0.001', required: true },
    { key: 'vaDeg', label: 'Vert. Angle (°)', placeholder: '90.0000', inputMode: 'decimal', step: '0.0001' },
    { key: 'ih', label: 'HI (m)', placeholder: '1.500', inputMode: 'decimal', step: '0.001', default: '1.500' },
    { key: 'th', label: 'TH (m)', placeholder: '1.500', inputMode: 'decimal', step: '0.001', default: '1.500' },
    { key: 'remarks', label: 'Remarks', placeholder: 'Road centerline' },
  ],
  control: [
    { key: 'pointId', label: 'Point ID', placeholder: 'P1', station: true, required: true },
    { key: 'bearing', label: 'Bearing', placeholder: '120°15\'00"', inputMode: 'decimal' },
    { key: 'verticalAngle', label: 'Vert. Angle (°)', placeholder: '90.0000', inputMode: 'decimal', step: '0.0001' },
    { key: 'slopeDistance', label: 'Slope Dist (m)', placeholder: '85.234', inputMode: 'decimal', step: '0.001', required: true },
    { key: 'instrumentHeight', label: 'IH (m)', placeholder: '1.500', inputMode: 'decimal', step: '0.001', default: '1.500' },
    { key: 'targetHeight', label: 'TH (m)', placeholder: '1.500', inputMode: 'decimal', step: '0.001', default: '1.500' },
    { key: 'remarks', label: 'Remarks', placeholder: 'Wall corner beacon' },
  ],
  hydrographic: [
    { key: 'soundingId', label: 'Sounding ID', placeholder: 'S01', station: true, required: true },
    { key: 'easting', label: 'Easting', placeholder: '275640.123', inputMode: 'decimal', step: '0.001' },
    { key: 'northing', label: 'Northing', placeholder: '9854321.456', inputMode: 'decimal', step: '0.001' },
    { key: 'depth', label: 'Depth (m)', placeholder: '4.250', inputMode: 'decimal', step: '0.001', required: true },
    { key: 'tide', label: 'Tide Correction (m)', placeholder: '+0.320', inputMode: 'decimal', step: '0.001' },
    { key: 'remarks', label: 'Remarks', placeholder: 'Sandy bottom' },
  ],
  mining: [
    { key: 'pointId', label: 'Point ID', placeholder: 'M01', station: true, required: true },
    { key: 'bearing', label: 'Bearing', placeholder: '235°45\'00"', inputMode: 'decimal' },
    { key: 'verticalAngle', label: 'Vert. Angle (°)', placeholder: '88.5000', inputMode: 'decimal', step: '0.0001' },
    { key: 'slopeDistance', label: 'Slope Dist (m)', placeholder: '42.150', inputMode: 'decimal', step: '0.001', required: true },
    { key: 'remarks', label: 'Remarks', placeholder: 'Tunnel wall, NW drive' },
  ],
}

const TYPE_META: Record<MobileSurveyType, { label: string; icon: typeof Compass; accent: string }> = {
  leveling:     { label: 'Leveling',     icon: Ruler,    accent: 'text-sky-400' },
  traverse:     { label: 'Traverse',     icon: Compass,  accent: 'text-amber-400' },
  control:      { label: 'Control',      icon: MapPin,   accent: 'text-emerald-400' },
  hydrographic: { label: 'Hydrographic', icon: Waves,    accent: 'text-cyan-400' },
  mining:       { label: 'Mining',       icon: Pickaxe,  accent: 'text-orange-400' },
}

export interface UniversalMobileObservationFormProps {
  surveyType: MobileSurveyType
  /** station context (for control / mining where station header exists) */
  stationName?: string
  onAdd: (row: Record<string, string>) => void
  onClose: () => void
  /** auto-increment last station name (e.g. P1 -> P2) */
  lastStation?: string
}

export function UniversalMobileObservationForm({
  surveyType,
  stationName,
  onAdd,
  onClose,
  lastStation,
}: UniversalMobileObservationFormProps) {
  const fields = FIELD_SETS[surveyType]
  const meta = TYPE_META[surveyType]

  // Build initial form state with defaults
  const initial = useMemo(() => {
    const obj: Record<string, string> = {}
    for (const f of fields) obj[f.key] = f.default ?? ''
    // Smart next-station suggestion
    if (lastStation && fields[0]?.station) {
      const next = suggestNextStation(lastStation)
      if (next) obj[fields[0].key] = next
    }
    return obj
  }, [fields, lastStation])

  const [form, setForm] = useState<Record<string, string>>(initial)
  const [saving, setSaving] = useState(false)

  // Reset form when survey type changes (so reopening doesn't keep stale values)
  useEffect(() => {
    setForm(initial)
  }, [initial])

  const handleChange = (key: string, value: string, field: FieldDef) => {
    setForm((prev) => ({ ...prev, [key]: field.station ? value.toUpperCase() : value }))
  }

  const requiredFields = fields.filter((f) => f.required)
  const isComplete = requiredFields.every((f) => form[f.key]?.trim() !== '')

  const handleSubmit = async () => {
    if (!isComplete) return
    setSaving(true)
    try {
      await onAdd(form)
    } finally {
      setSaving(false)
    }
  }

  /** "Save & Add Another" — keep the form open for rapid entry */
  const handleSaveAndNew = async () => {
    if (!isComplete) return
    setSaving(true)
    try {
      await onAdd(form)
      // suggest next station
      const firstStationField = fields.find((f) => f.station)
      if (firstStationField && form[firstStationField.key]) {
        const next = suggestNextStation(form[firstStationField.key])
        const reset: Record<string, string> = {}
        for (const f of fields) reset[f.key] = f.default ?? ''
        if (next) reset[firstStationField.key] = next
        setForm(reset)
      }
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full px-4 py-3.5 text-base bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30 focus:outline-none transition-all'
  const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5'

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end animate-[slideUp_0.2s_ease-out]">
      <div className="w-full bg-[var(--bg-primary)] border-t border-[var(--border-color)] rounded-t-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Drag handle */}
        <div className="pt-2 pb-1 flex justify-center">
          <div className="w-12 h-1.5 bg-[var(--border-color)] rounded-full" />
        </div>

        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/50">
          <div className="flex items-center gap-2.5">
            <div className="grid place-items-center w-9 h-9 rounded-lg bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/30">
              <meta.icon className={`w-5 h-5 ${meta.accent}`} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">New {meta.label} Reading</h2>
              {stationName && (
                <p className="text-xs text-[var(--text-muted)]">Station: {stationName}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] active:scale-95 transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 overscroll-contain">
          {fields.map((field) => (
            <div key={field.key}>
              <label className={labelClass}>
                {field.label}
                {field.required && <span className="text-[var(--accent)] ml-1">*</span>}
              </label>
              <input
                type={field.inputMode === 'decimal' || field.inputMode === 'numeric' ? 'number' : 'text'}
                inputMode={field.inputMode}
                step={field.step}
                value={form[field.key]}
                onChange={(e) => handleChange(field.key, e.target.value, field)}
                className={inputClass}
                placeholder={field.placeholder}
                autoFocus={field === fields[0]}
                autoComplete="off"
                autoCapitalize={field.station ? 'characters' : 'off'}
              />
            </div>
          ))}

          {/* Photo attach — universal across all survey types */}
          <button
            type="button"
            className="w-full p-4 border-2 border-dashed border-[var(--border-color)] rounded-xl flex items-center justify-center gap-2 text-[var(--text-secondary)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)] hover:bg-[var(--accent)]/5 transition active:scale-[0.99]"
          >
            <Camera className="w-5 h-5" />
            <span className="text-sm font-medium">Attach Beacon / Site Photo</span>
          </button>
        </div>

        {/* Sticky action bar — large touch targets */}
        <div className="border-t border-[var(--border-color)] bg-[var(--bg-secondary)]/80 backdrop-blur-md p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2">
          <button
            onClick={handleSubmit}
            disabled={!isComplete || saving}
            className={[
              'w-full py-4 rounded-xl font-semibold text-base transition-all flex items-center justify-center gap-2',
              isComplete && !saving
                ? 'bg-[var(--accent)] text-black active:bg-[var(--accent-dim)] shadow-lg shadow-[var(--accent)]/20'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed',
            ].join(' ')}
          >
            {saving ? (
              <>
                <span className="w-5 h-5 border-2 border-black/40 border-t-black rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                Save Reading
              </>
            )}
          </button>

          <button
            onClick={handleSaveAndNew}
            disabled={!isComplete || saving}
            className={[
              'w-full py-3 rounded-xl font-medium text-sm transition-all border',
              isComplete && !saving
                ? 'border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] active:scale-[0.99]'
                : 'border-transparent text-[var(--text-muted)] cursor-not-allowed',
            ].join(' ')}
          >
            Save & Add Another →
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

/** Suggest the next station name based on simple patterns:
 *  P1 -> P2, A1 -> A2, BM1 -> BM2, TP1 -> TP2, etc. */
function suggestNextStation(prev: string): string | null {
  if (!prev) return null
  const match = prev.match(/^([A-Za-z]+)(\d+)$/)
  if (!match) return null
  const [, prefix, num] = match
  const next = (parseInt(num, 10) + 1).toString().padStart(num.length, '0')
  return `${prefix}${next}`
}
