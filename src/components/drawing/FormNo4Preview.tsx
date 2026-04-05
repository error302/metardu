'use client'

import { useMemo } from 'react'
import {
  CoordinateCanvas,
  type CanvasPoint,
  type CanvasLine
} from './CoordinateCanvas'
import type { SubmissionPackage } from '@/lib/submission/types'

interface FormNo4PreviewProps {
  pkg: SubmissionPackage
  width?: number
  height?: number
}

export function FormNo4Preview({
  pkg,
  width = 800,
  height = 600
}: FormNo4PreviewProps) {
  const { points, lines } = useMemo(() => {
    const pts: CanvasPoint[] = pkg.traverse.points.map(p => ({
      id: p.pointName,
      name: p.pointName,
      easting: p.adjustedEasting,
      northing: p.adjustedNorthing,
      type: 'beacon' as const
    }))

    const lns: CanvasLine[] = pts.map((pt, i) => ({
      from: pt.id,
      to: pts[(i + 1) % pts.length].id,
      style: 'solid' as const
    }))

    return { points: pts, lines: lns }
  }, [pkg])

  return (
    <div className="space-y-3">
      <div className="bg-[#1a1a1a] border rounded-t-lg px-4 py-3 flex items-center justify-between text-sm">
        <div>
          <p className="font-semibold">FORM NO. 4 — SURVEY PLAN</p>
          <p className="text-[var(--text-muted)] text-xs mt-0.5">
            {pkg.parcel.lrNumber} · {pkg.parcel.county} · Arc 1960 / UTM Zone 37S
          </p>
        </div>
        <div className="text-right text-xs text-[var(--text-muted)]">
          <p>{pkg.surveyor.fullName}</p>
          <p>{pkg.surveyor.registrationNumber}</p>
          <p>{new Date(pkg.generatedAt).toLocaleDateString('en-KE')}</p>
        </div>
      </div>

      <CoordinateCanvas
        points={points}
        lines={lines}
        width={width}
        height={height}
        showNorthArrow
        showScaleBar
        showGrid
      />

      <div className="bg-[#1a1a1a] border rounded-b-lg px-4 py-3 grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-[var(--text-muted)] text-xs">Area</p>
          <p className="font-medium">{(pkg.parcel.areaM2 / 10000).toFixed(4)} Ha</p>
          <p className="text-[var(--text-muted)] text-xs">{pkg.parcel.areaM2.toFixed(2)} m²</p>
        </div>
        <div>
          <p className="text-[var(--text-muted)] text-xs">Perimeter</p>
          <p className="font-medium">{pkg.parcel.perimeterM.toFixed(3)} m</p>
        </div>
        <div>
          <p className="text-[var(--text-muted)] text-xs">Precision</p>
          <p className="font-medium">{pkg.traverse.precisionRatio}</p>
          <p className="text-[var(--text-muted)] text-xs">{pkg.traverse.adjustmentMethod}</p>
        </div>
      </div>
    </div>
  )
}
