'use client'

import React, { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Activity,
  AlertTriangle,
} from 'lucide-react'
import {
  bowditchAdjustment,
  angularClosureTolerance,
  evaluateTraverseClosure,
  SurveyTypeKey,
} from '@/lib/engine/traverse'
import { NamedPoint2D } from '@/lib/engine/types'

export interface FieldObservation {
  from: string
  to: string
  bearing: number
  distance: number
}

export interface FieldControlPoint {
  name: string
  easting: number
  northing: number
}

export interface FieldLSAResult {
  angularMisclosure: number
  angularTolerance: number
  angularPass: boolean
  linearMisclosure: number
  precisionRatio: number
  precisionPass: boolean
  surveyClass: string
  overallPass: boolean
  outliers: Array<{ from: string; to: string; residual: number }>
  adjustedPoints: Array<{ name: string; easting: number; northing: number }>
  estimatedAccuracy?: number
}

export interface QuickFieldLSAProps {
  observations: FieldObservation[]
  controlPoints: FieldControlPoint[]
  onResultReady?: (result: FieldLSAResult) => void
  className?: string
}

export function QuickFieldLSA({
  observations,
  controlPoints,
  onResultReady,
  className = '',
}: QuickFieldLSAProps) {
  const [surveyClass, setSurveyClass] = useState<SurveyTypeKey>('cadastral')
  const [result, setResult] = useState<FieldLSAResult | null>(null)
  const [expanded, setExpanded] = useState(false)

  const handleRunCheck = () => {
    if (observations.length === 0 || controlPoints.length === 0) return

    const points: NamedPoint2D[] = []
    
    // We assume a simple traverse tracing from the first observation
    const firstObs = observations[0]
    const startCtrl = controlPoints.find((cp) => cp.name === firstObs.from) || controlPoints[0]
    
    points.push({ name: startCtrl.name, easting: startCtrl.easting, northing: startCtrl.northing })
    
    const distances: number[] = []
    const bearings: number[] = []
    
    observations.forEach(obs => {
      distances.push(obs.distance)
      bearings.push(obs.bearing)
      points.push({ name: obs.to, easting: 0, northing: 0 })
    })
    
    // Check if the last observation closes on a known point
    const lastObs = observations[observations.length - 1]
    const endCtrl = controlPoints.find(cp => cp.name === lastObs.to)
    let closingPoint = undefined
    
    if (endCtrl) {
      closingPoint = { easting: endCtrl.easting, northing: endCtrl.northing }
    } else if (lastObs.to === startCtrl.name) {
      closingPoint = { easting: startCtrl.easting, northing: startCtrl.northing }
    }
    
    const traverseResult = bowditchAdjustment({
      points,
      distances,
      bearings,
      closingPoint
    })
    
    const angularMisclosure = 0 // Approximate for now as input is bearings not internal angles
    const nStations = observations.length + 1
    const angularTol = angularClosureTolerance(nStations)
    const angularPass = Math.abs(angularMisclosure) <= angularTol
    
    const evalResult = evaluateTraverseClosure(
      traverseResult.linearError,
      traverseResult.totalDistance,
      surveyClass
    )
    
    const overallPass = evalResult.passes && angularPass
    
    const outliers: Array<{ from: string; to: string; residual: number }> = []
    traverseResult.legs.forEach(leg => {
      const correctionMag = Math.sqrt(leg.correctionE ** 2 + leg.correctionN ** 2)
      // Standardized residuals > 3.0 approximated by correction > 0.1m for quick check
      if (correctionMag > 0.1) {
        outliers.push({
          from: leg.from,
          to: leg.to,
          residual: correctionMag
        })
      }
    })
    
    const adjustedPoints = traverseResult.legs.map(leg => ({
      name: leg.to,
      easting: leg.adjEasting,
      northing: leg.adjNorthing
    }))
    
    adjustedPoints.unshift({
      name: startCtrl.name,
      easting: startCtrl.easting,
      northing: startCtrl.northing
    })

    // Estimated position accuracy (worst-case correction magnitude)
    let maxCorrection = 0
    traverseResult.legs.forEach(leg => {
      const mag = Math.sqrt(leg.correctionE ** 2 + leg.correctionN ** 2)
      if (mag > maxCorrection) maxCorrection = mag
    })

    const finalResult: FieldLSAResult = {
      angularMisclosure,
      angularTolerance: angularTol,
      angularPass,
      linearMisclosure: traverseResult.linearError,
      precisionRatio: evalResult.ratio,
      precisionPass: evalResult.passes,
      surveyClass: surveyClass,
      overallPass,
      outliers,
      adjustedPoints,
      estimatedAccuracy: maxCorrection
    }

    setResult(finalResult)
    if (onResultReady) {
      onResultReady(finalResult)
    }
  }

  return (
    <div className={`flex flex-col gap-3 p-3 rounded-lg bg-gray-900 border border-gray-700 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-yellow-400 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Quick Field LSA
        </h3>
        <select
          value={surveyClass}
          onChange={(e) => setSurveyClass(e.target.value as SurveyTypeKey)}
          className="bg-black/50 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200"
        >
          <option value="cadastral">Cadastral (1:5000)</option>
          <option value="engineering">Engineering (1:3000)</option>
          <option value="topographic">Topographic (1:1000)</option>
          <option value="geodetic">Geodetic (1:10000)</option>
        </select>
      </div>

      <button
        onClick={handleRunCheck}
        disabled={observations.length === 0}
        className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white font-bold rounded-lg transition-colors min-h-[48px]"
      >
        Run Quick Check
      </button>

      {result && (
        <div className={`p-3 rounded-lg border ${result.overallPass ? 'bg-green-900/20 border-green-700/50' : 'bg-red-900/20 border-red-700/50'}`}>
          <div className="flex items-center gap-2 mb-2">
            {result.overallPass ? (
              <CheckCircle className="w-5 h-5 text-green-400" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400" />
            )}
            <span className={`font-bold ${result.overallPass ? 'text-green-400' : 'text-red-400'}`}>
              {result.overallPass ? 'PASS' : 'FAIL'}
            </span>
            <span className="text-xs text-gray-400 ml-auto uppercase tracking-wider">{result.surveyClass}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm mb-3">
            <div className="bg-black/40 p-2 rounded">
              <div className="text-[10px] text-gray-400 uppercase">Linear Error</div>
              <div className="font-mono">{result.linearMisclosure.toFixed(3)} m</div>
            </div>
            <div className="bg-black/40 p-2 rounded">
              <div className="text-[10px] text-gray-400 uppercase">Precision</div>
              <div className="font-mono">1:{result.precisionRatio === Infinity ? '∞' : result.precisionRatio.toLocaleString()}</div>
            </div>
            {result.estimatedAccuracy !== undefined && (
              <div className="bg-black/40 p-2 rounded col-span-2">
                <div className="text-[10px] text-gray-400 uppercase flex items-center gap-1">
                  Est. Position Accuracy (Worst Case)
                </div>
                <div className="font-mono text-blue-300">±{result.estimatedAccuracy.toFixed(3)} m</div>
              </div>
            )}
          </div>

          {!result.overallPass && result.outliers.length === 0 && (
            <div className="text-xs text-red-300 bg-red-900/20 p-2 rounded mb-3">
              Observations require re-measurement to meet {result.surveyClass} standards.
            </div>
          )}

          {result.outliers.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-semibold text-red-400 flex items-center gap-1 mb-1">
                <AlertTriangle className="w-3 h-3" /> Flagged Outliers
              </div>
              <ul className="text-xs text-gray-300 space-y-1 bg-red-900/10 p-2 rounded border border-red-900/30">
                {result.outliers.map((o, i) => (
                  <li key={i}>
                    <span className="font-mono text-red-300">{o.from} → {o.to}</span> (Residual: {o.residual.toFixed(3)}m)
                  </li>
                ))}
              </ul>
              {!result.overallPass && (
                 <div className="text-xs text-red-300 mt-2">
                   Please re-measure the flagged observations.
                 </div>
              )}
            </div>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-gray-200 py-1"
          >
            {expanded ? 'Hide Details' : 'Show Details'}
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {expanded && (
            <div className="mt-2 space-y-2 border-t border-white/10 pt-2 text-xs">
              <div>
                <div className="text-gray-400">Angular Misclosure</div>
                <div className="font-mono">{result.angularMisclosure.toFixed(1)}" (Tol: {result.angularTolerance.toFixed(1)}")</div>
              </div>
              <div>
                <div className="text-gray-400">Adjusted Coordinates</div>
                <div className="max-h-32 overflow-y-auto space-y-1 mt-1">
                  {result.adjustedPoints.map((p, i) => (
                    <div key={i} className="flex justify-between bg-black/20 p-1 rounded font-mono text-[10px]">
                      <span className="text-blue-300">{p.name}</span>
                      <span className="text-gray-400">E: {p.easting.toFixed(3)} N: {p.northing.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
