'use client'

interface ValidationResult {
  status: 'GREEN' | 'YELLOW' | 'RED' | 'ERROR'
  flags: string[]
  details?: {
    max_gradient_desirable?: number
    max_gradient_absolute?: number
    min_gradient?: number
    min_radius?: number
    required_ssd?: number
    k_crest?: number | string
  }
  road_class?: string
  terrain?: string
}

interface Props {
  result: ValidationResult
  onDismiss?: () => void
}

export default function DepartureWarning({ result, onDismiss }: Props) {
  if (result.status !== 'RED') return null

  return (
    <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-red-400 mb-1">DEPARTURE FROM STANDARD</h3>
          <p className="text-xs text-red-300 mb-2">
            The following parameters exceed allowable values for {result.road_class || 'the selected road class'} {result.terrain || ''} terrain. Written approval from the Chief Engineer (Roads) is required before this design may proceed — RDM 1.3 Section 1.6.2.
          </p>
          <ul className="space-y-1">
            {result.flags.map((flag, i) => (
              <li key={i} className="text-xs text-red-300 flex items-start gap-2">
                <span className="text-red-500 mt-0.5">•</span>
                <span>{flag}</span>
              </li>
            ))}
          </ul>
          {onDismiss && (
            <button onClick={onDismiss} className="mt-3 text-xs text-red-400 underline hover:text-red-300">
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
