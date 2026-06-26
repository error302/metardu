'use client'

// Verification tables — renders the common-points verification table and
// the calibration residuals table.
//
// Extracted from src/app/tools/cassini-utm/page.tsx.

import { ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react'
import type { VerificationResult } from '@/lib/geo/cassini'

interface CommonPointsVerificationProps {
  showVerification: boolean
  setShowVerification: (v: boolean) => void
  commonPointCount: number
  verificationResults: VerificationResult[]
}

/** Collapsible common-points verification table embedded in the sheet selector card. */
export function CommonPointsVerification({
  showVerification,
  setShowVerification,
  commonPointCount,
  verificationResults,
}: CommonPointsVerificationProps) {
  return (
    <div>
      <button
        onClick={() => setShowVerification(!showVerification)}
        className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
      >
        {showVerification ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <ShieldCheck className="h-3 w-3" />
        Verify common points ({commonPointCount} stations)
      </button>
      {showVerification && verificationResults.length > 0 && (
        <div className="mt-2 max-h-48 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0">
              <tr className="table-header">
                <th className="table-cell text-left py-1.5 px-2">Station</th>
                <th className="table-cell text-right py-1.5 px-2">dE (m)</th>
                <th className="table-cell text-right py-1.5 px-2">dN (m)</th>
              </tr>
            </thead>
            <tbody>
              {verificationResults.map((v) => (
                <tr key={v.station} className="table-row">
                  <td className="table-cell py-1.5 px-2 font-medium">{v.station}</td>
                  <td className={`table-cell py-1.5 px-2 text-right font-mono ${
                    Math.abs(v.residualE) < 0.1 ? 'text-[var(--success)]' : 'text-[var(--warning)]'
                  }`}>
                    {v.residualE.toFixed(4)}
                  </td>
                  <td className={`table-cell py-1.5 px-2 text-right font-mono ${
                    Math.abs(v.residualN) < 0.1 ? 'text-[var(--success)]' : 'text-[var(--warning)]'
                  }`}>
                    {v.residualN.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

interface CalibrationResidualsTableProps {
  residuals: VerificationResult[]
}

/** Calibration residuals table shown after a custom Helmert fit. */
export function CalibrationResidualsTable({ residuals }: CalibrationResidualsTableProps) {
  if (residuals.length === 0) return null
  return (
    <div>
      <p className="text-[10px] text-[var(--text-muted)] font-medium mb-1 uppercase tracking-wider">Calibration Residuals</p>
      <div className="max-h-32 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0">
            <tr className="table-header">
              <th className="table-cell text-left py-1.5 px-2">Station</th>
              <th className="table-cell text-right py-1.5 px-2">dE (m)</th>
              <th className="table-cell text-right py-1.5 px-2">dN (m)</th>
            </tr>
          </thead>
          <tbody>
            {residuals.map((v) => (
              <tr key={v.station} className="table-row">
                <td className="table-cell py-1.5 px-2 font-medium">{v.station}</td>
                <td className={`table-cell py-1.5 px-2 text-right font-mono ${
                  Math.abs(v.residualE) < 0.1 ? 'text-[var(--success)]' : 'text-[var(--warning)]'
                }`}>
                  {v.residualE.toFixed(4)}
                </td>
                <td className={`table-cell py-1.5 px-2 text-right font-mono ${
                  Math.abs(v.residualN) < 0.1 ? 'text-[var(--success)]' : 'text-[var(--warning)]'
                }`}>
                  {v.residualN.toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
