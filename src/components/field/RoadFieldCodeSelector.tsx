'use client'

import { ROAD_FIELD_CODE_OPTIONS } from '@/lib/engineering/roadFieldPlan'
import type { RoadFieldFeatureCode } from '@/types/engineering'

interface RoadFieldCodeSelectorProps {
  codes: readonly RoadFieldFeatureCode[]
  value: RoadFieldFeatureCode | ''
  capturedCodes: readonly RoadFieldFeatureCode[]
  sunlightMode?: boolean
  onChange: (code: RoadFieldFeatureCode) => void
}

export function RoadFieldCodeSelector({
  codes,
  value,
  capturedCodes,
  sunlightMode = false,
  onChange,
}: RoadFieldCodeSelectorProps) {
  return (
    <fieldset className="w-full max-w-2xl">
      <legend className="text-sm font-semibold text-[var(--text-secondary)]">Code for the next road point</legend>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Saved-code badges refer to the selected chainage only; they do not assess whether the field work is complete.
      </p>
      <div role="group" aria-label="Road point feature codes" className="mt-3 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {codes.map((code) => {
          const option = ROAD_FIELD_CODE_OPTIONS.find((item) => item.code === code)
          const isSelected = value === code
          const isCaptured = capturedCodes.includes(code)

          return (
            <button
              key={code}
              type="button"
              aria-label={`${code} — ${option?.label ?? code}${isCaptured ? ', a point with this code is saved at this chainage' : ''}`}
              aria-pressed={isSelected}
              onClick={() => onChange(code)}
              className={`flex min-h-12 min-w-36 shrink-0 flex-col justify-center rounded-lg border px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                isSelected
                  ? sunlightMode
                    ? 'border-black bg-black text-white'
                    : 'border-[var(--accent)] bg-[var(--accent)] text-black'
                  : sunlightMode
                    ? 'border-black bg-white text-black'
                    : 'border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)]'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold">{code}</span>
                {isCaptured && (
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    sunlightMode ? 'bg-green-100 text-green-950' : 'bg-emerald-500/15 text-emerald-300'
                  }`}>
                    Saved here
                  </span>
                )}
              </span>
              <span className="mt-0.5 text-xs leading-4">{option?.label ?? code}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
