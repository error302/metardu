'use client'

import { AlertTriangle, CheckCircle, MapPin } from 'lucide-react'
import type { ValidationResult } from '@/types/cadastra'

interface ComparisonPanelProps {
  result: ValidationResult
}

export default function ComparisonPanel({ result }: ComparisonPanelProps) {
  const getScoreColor = (score: number) => {
    if (score >= 75) return 'text-green-500'
    if (score >= 50) return 'text-yellow-500'
    return 'text-red-500'
  }
  
  const getRiskBadge = (risk: string) => {
    const colors: Record<string, string> = {
      low: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      high: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    }
    return colors[risk] || colors.low
  }
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold mb-4">Validation Results</h3>
      
      <div className="flex items-center gap-4 mb-6">
        <div className={`text-4xl font-bold ${getScoreColor(result.score)}`}>
          {result.score}
        </div>
        <div>
          <p className="text-lg font-medium">Dispute Probability Score</p>
          <span className={`px-2 py-1 rounded-full text-sm ${getRiskBadge(result.summary.risk_level)}`}>
            {result.summary.risk_level.toUpperCase()} RISK
          </span>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <span className="font-medium">Overlaps</span>
          </div>
          <p className="text-2xl font-bold">{result.overlaps.length}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">{result.summary.total_overlap_area} m²</p>
        </div>
        
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="h-5 w-5 text-yellow-500" />
            <span className="font-medium">Gaps</span>
          </div>
          <p className="text-2xl font-bold">{result.gaps.length}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">{result.summary.total_gap_area} m²</p>
        </div>
      </div>
      
      {result.overlaps.length > 0 && (
        <div className="mb-4">
          <h4 className="font-medium mb-2">Detected Overlaps</h4>
          <div className="space-y-2">
            {result.overlaps.map((overlap) => (
              <div key={overlap.id} className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm">
                <span className={`px-2 py-0.5 rounded text-xs ${overlap.severity === 'severe' ? 'bg-red-500 text-white' : 'bg-yellow-500 text-white'}`}>
                  {overlap.severity}
                </span>
                <p className="mt-1">{overlap.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {result.gaps.length > 0 && (
        <div>
          <h4 className="font-medium mb-2">Detected Gaps</h4>
          <div className="space-y-2">
            {result.gaps.map((gap) => (
              <div key={gap.id} className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-sm">
                <span className={`px-2 py-0.5 rounded text-xs ${gap.severity === 'severe' ? 'bg-red-500 text-white' : 'bg-yellow-500 text-white'}`}>
                  {gap.severity}
                </span>
                <p className="mt-1">{gap.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {result.overlaps.length === 0 && result.gaps.length === 0 && (
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle className="h-5 w-5" />
          <span>No issues detected - boundary is clean!</span>
        </div>
      )}
    </div>
  )
}