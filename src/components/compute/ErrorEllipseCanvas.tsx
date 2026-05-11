'use client'

import { useMemo } from 'react'
import type { AdjustedStation } from '@/lib/survey/networkAdjustment'
import type { Observation } from '@/lib/survey/networkAdjustment'

/**
 * Phase 22: SVG canvas rendering error ellipses at each adjusted station.
 * Shows 95% confidence ellipses (scale factor 2.447) at each free station.
 * Fixed stations shown as solid squares, free stations as circles.
 */

interface Props {
  stations: AdjustedStation[]
  observations: Observation[]
  width?: number
  height?: number
  ellipseScale?: number
}

export function ErrorEllipseCanvas({
  stations,
  observations,
  width = 600,
  height = 400,
  ellipseScale = 2.447, // 95% confidence
}: Props) {
  const viewBox = useMemo(() => {
    if (stations.length === 0) return { minE: 0, maxE: 100, minN: 0, maxN: 100, scale: 1 }

    let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity
    for (const s of stations) {
      if (s.easting < minE) minE = s.easting
      if (s.easting > maxE) maxE = s.easting
      if (s.northing < minN) minN = s.northing
      if (s.northing > maxN) maxN = s.northing
    }

    const rangeE = maxE - minE || 100
    const rangeN = maxN - minN || 100
    const padding = Math.max(rangeE, rangeN) * 0.15
    minE -= padding; maxE += padding
    minN -= padding; maxN += padding

    const scaleE = (width - 80) / (maxE - minE)
    const scaleN = (height - 80) / (maxN - minN)
    const scale = Math.min(scaleE, scaleN)

    return { minE, maxE, minN, maxN, scale }
  }, [stations, width, height])

  const toSVG = (e: number, n: number) => ({
    x: 40 + (e - viewBox.minE) * viewBox.scale,
    y: height - 40 - (n - viewBox.minN) * viewBox.scale,
  })

  // Compute max ellipse size for scaling display
  const maxSemiMajor = Math.max(...stations.filter(s => !s.isFixed).map(s => s.semiMajor), 0.001)
  const ellipseDisplayScale = Math.min(40, (Math.min(width, height) * 0.08) / maxSemiMajor)

  if (stations.length === 0) {
    return (
      <div className="flex items-center justify-center border border-dashed border-[var(--border-color)] rounded h-64">
        <p className="text-sm text-[var(--text-muted)]">Run adjustment to see error ellipses</p>
      </div>
    )
  }

  return (
    <div className="card p-4">
      <h3 className="font-medium text-sm text-[var(--text-secondary)] mb-3">
        Network Diagram — 95% Confidence Ellipses
      </h3>
      <svg
        width={width}
        height={height}
        className="bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-color)]"
        style={{ maxWidth: '100%', height: 'auto' }}
        viewBox={`0 0 ${width} ${height}`}
      >
        {/* Observation lines (baselines) */}
        {observations.map((obs, i) => {
          const fromStn = stations.find(s => s.id === obs.from)
          const toStn = stations.find(s => s.id === obs.to)
          if (!fromStn || !toStn) return null
          const from = toSVG(fromStn.easting, fromStn.northing)
          const to = toSVG(toStn.easting, toStn.northing)
          return (
            <line
              key={`obs-${i}`}
              x1={from.x} y1={from.y}
              x2={to.x} y2={to.y}
              stroke="rgba(59, 130, 246, 0.4)"
              strokeWidth={1.5}
              strokeDasharray="4,3"
            />
          )
        })}

        {/* Error ellipses for free stations */}
        {stations.filter(s => !s.isFixed).map(s => {
          const pos = toSVG(s.easting, s.northing)
          const a = s.semiMajor * ellipseScale * ellipseDisplayScale
          const b = s.semiMinor * ellipseScale * ellipseDisplayScale
          const rot = -s.orientation // SVG rotation is CW, orientation is CCW from E

          return (
            <g key={`ellipse-${s.id}`}>
              <ellipse
                cx={pos.x} cy={pos.y}
                rx={Math.max(a, 2)} ry={Math.max(b, 1)}
                transform={`rotate(${rot} ${pos.x} ${pos.y})`}
                fill="rgba(234, 179, 8, 0.15)"
                stroke="rgba(234, 179, 8, 0.7)"
                strokeWidth={1.5}
              />
              {/* Semi-major axis line */}
              <line
                x1={pos.x - Math.max(a, 2) * Math.cos(rot * Math.PI / 180)}
                y1={pos.y + Math.max(a, 2) * Math.sin(rot * Math.PI / 180)}
                x2={pos.x + Math.max(a, 2) * Math.cos(rot * Math.PI / 180)}
                y2={pos.y - Math.max(a, 2) * Math.sin(rot * Math.PI / 180)}
                stroke="rgba(234, 179, 8, 0.4)"
                strokeWidth={0.5}
              />
            </g>
          )
        })}

        {/* Station markers */}
        {stations.map(s => {
          const pos = toSVG(s.easting, s.northing)

          if (s.isFixed) {
            return (
              <g key={`stn-${s.id}`}>
                <rect
                  x={pos.x - 5} y={pos.y - 5}
                  width={10} height={10}
                  fill="#ef4444"
                  stroke="#fff"
                  strokeWidth={1}
                  transform={`rotate(45 ${pos.x} ${pos.y})`}
                />
                <text
                  x={pos.x + 10} y={pos.y - 8}
                  fontSize={11} fill="#f87171" fontWeight="600"
                >
                  {s.name || s.id} 🔒
                </text>
              </g>
            )
          }

          return (
            <g key={`stn-${s.id}`}>
              <circle cx={pos.x} cy={pos.y} r={4} fill="#3b82f6" stroke="#fff" strokeWidth={1} />
              <text x={pos.x + 8} y={pos.y - 6} fontSize={11} fill="#93c5fd" fontWeight="500">
                {s.name || s.id}
              </text>
              <text x={pos.x + 8} y={pos.y + 6} fontSize={8} fill="#6b7280">
                σ={s.semiMajor.toFixed(4)}m
              </text>
            </g>
          )
        })}

        {/* Legend */}
        <g transform={`translate(${width - 180}, 15)`}>
          <rect x={0} y={0} width={170} height={60} rx={4} fill="rgba(0,0,0,0.6)" stroke="rgba(255,255,255,0.1)" />
          <rect x={10} y={10} width={8} height={8} fill="#ef4444" transform="rotate(45 14 14)" />
          <text x={28} y={18} fontSize={9} fill="#d4d4d8">Fixed Control</text>
          <circle cx={14} cy={30} r={3} fill="#3b82f6" />
          <text x={28} y={33} fontSize={9} fill="#d4d4d8">Free Station</text>
          <ellipse cx={14} cy={46} rx={8} ry={5} fill="rgba(234,179,8,0.2)" stroke="rgba(234,179,8,0.6)" strokeWidth={1} />
          <text x={28} y={49} fontSize={9} fill="#d4d4d8">95% Error Ellipse</text>
        </g>
      </svg>
    </div>
  )
}
