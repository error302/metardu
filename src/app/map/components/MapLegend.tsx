'use client'

import { memo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

/**
 * Map legend — sketches and survey data are different things and must never
 * be read as one. Sketches are dashed sienna drawing aids (excluded from
 * survey exports); observed points are solid; control points are rings.
 */
export interface LegendEntry {
  id: 'sketch' | 'survey-point' | 'control-point' | 'measure'
  label: string
  hint: string
  /** Preview swatch rendered with a CSS class so colours live in one place. */
  swatch: 'sketch-line' | 'survey-dot' | 'control-ring' | 'measure-line'
}

export const LEGEND_ENTRIES: readonly LegendEntry[] = [
  { id: 'sketch', label: 'Sketch', hint: 'Drawing aid — dashed, excluded from survey exports', swatch: 'sketch-line' },
  { id: 'survey-point', label: 'Survey point', hint: 'Observed / keyed point in the register', swatch: 'survey-dot' },
  { id: 'control-point', label: 'Control point', hint: 'Survey control with a known coordinate', swatch: 'control-ring' },
  { id: 'measure', label: 'Measurement', hint: 'Live distance / area measurement', swatch: 'measure-line' },
]

export const MapLegend = memo(function MapLegend() {
  const [open, setOpen] = useState(false)
  return (
    <div className="map-legend" data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className="map-legend-toggle"
        aria-expanded={open}
        aria-controls="map-legend-entries"
        onClick={() => setOpen((value) => !value)}
      >
        Legend
        {open ? <ChevronDown className="h-3 w-3" aria-hidden /> : <ChevronUp className="h-3 w-3" aria-hidden />}
      </button>
      {open && (
        <ul id="map-legend-entries" className="map-legend-entries">
          {LEGEND_ENTRIES.map((entry) => (
            <li key={entry.id} title={entry.hint}>
              <span className={`map-legend-swatch map-legend-swatch--${entry.swatch}`} aria-hidden />
              <span className="map-legend-label">{entry.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})
