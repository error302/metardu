'use client';

import { useState, useMemo, useCallback } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  ROAD_RESERVE_STANDARDS,
  getRoadReserveWidth,
  estimateAcquisitionArea,
} from '@/lib/engineering/roadReserve'
import {
  Ruler,
  AlertTriangle,
  Building2,
  ArrowRightLeft,
  Zap,
} from 'lucide-react'

// ────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────

interface RoadReservePanelProps {
  roadClass: string
  roadLength?: number
  existingRoadWidth?: number
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function formatNumber(n: number, decimals = 2): string {
  return n.toLocaleString('en-KE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// ────────────────────────────────────────────────────────────
// SVG Cross-Section Diagram
// ────────────────────────────────────────────────────────────

interface CrossSectionSVGProps {
  reserveWidth: number
  carriagewayWidth: number
  shoulderWidth: number
  wayleaveWidth?: number
}

function CrossSectionDiagram({
  reserveWidth,
  carriagewayWidth,
  shoulderWidth,
  wayleaveWidth,
}: CrossSectionSVGProps) {
  const svgWidth = 700
  const svgHeight = 220
  const padding = 30
  const usableWidth = svgWidth - padding * 2
  const groundY = 110
  const groundLineY = groundY + 50

  // Scale factor: reserveWidth maps to usableWidth
  const scale = usableWidth / reserveWidth
  const centreX = svgWidth / 2

  const cw = carriagewayWidth * scale
  const sw = shoulderWidth * scale
  const rw = reserveWidth * scale

  // Wayleave bands (from reserve edge inward)
  const wlW = wayleaveWidth ? wayleaveWidth * scale : 0

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      className="w-full h-auto rounded-lg border bg-muted/30"
      role="img"
      aria-label="Road reserve cross-section diagram"
    >
      {/* Title */}
      <text x={svgWidth / 2} y={22} textAnchor="middle" className="text-[11px] font-semibold fill-foreground">
        Road Reserve Cross-Section (Not to Scale)
      </text>

      {/* Ground fill */}
      <rect
        x={centreX - rw / 2}
        y={groundY}
        width={rw}
        height={groundLineY - groundY + 30}
        fill="#e2e8f0"
        opacity={0.5}
        rx={2}
      />

      {/* Wayleave bands (left and right) */}
      {wlW > 0 && (
        <>
          <rect
            x={centreX - rw / 2}
            y={groundY}
            width={wlW}
            height={groundLineY - groundY}
            fill="#bae6fd"
            opacity={0.5}
            rx={1}
          />
          <rect
            x={centreX + rw / 2 - wlW}
            y={groundY}
            width={wlW}
            height={groundLineY - groundY}
            fill="#bae6fd"
            opacity={0.5}
            rx={1}
          />
          {/* Wayleave label left */}
          <text x={centreX - rw / 2 + wlW / 2} y={groundLineY + 16} textAnchor="middle" className="text-[9px] fill-sky-700">
            Wayleave
          </text>
          <text x={centreX - rw / 2 + wlW / 2} y={groundLineY + 28} textAnchor="middle" className="text-[9px] fill-sky-700">
            {wayleaveWidth}m
          </text>
          {/* Wayleave label right */}
          <text x={centreX + rw / 2 - wlW / 2} y={groundLineY + 16} textAnchor="middle" className="text-[9px] fill-sky-700">
            Wayleave
          </text>
          <text x={centreX + rw / 2 - wlW / 2} y={groundLineY + 28} textAnchor="middle" className="text-[9px] fill-sky-700">
            {wayleaveWidth}m
          </text>
        </>
      )}

      {/* Left reserve area (green) */}
      <rect
        x={centreX - rw / 2 + (wlW > 0 ? wlW : 0)}
        y={groundY}
        width={rw / 2 - cw / 2 - sw + (wlW > 0 ? -wlW : 0)}
        height={groundLineY - groundY}
        fill="#bbf7d0"
        opacity={0.7}
      />
      {/* Right reserve area (green) */}
      <rect
        x={centreX + cw / 2 + sw}
        y={groundY}
        width={rw / 2 - cw / 2 - sw - (wlW > 0 ? wlW : 0)}
        height={groundLineY - groundY}
        fill="#bbf7d0"
        opacity={0.7}
      />

      {/* Left shoulder */}
      <rect
        x={centreX - cw / 2 - sw}
        y={groundY}
        width={sw}
        height={groundLineY - groundY}
        fill="#94a3b8"
        rx={1}
      />
      {/* Right shoulder */}
      <rect
        x={centreX + cw / 2}
        y={groundY}
        width={sw}
        height={groundLineY - groundY}
        fill="#94a3b8"
        rx={1}
      />

      {/* Carriageway */}
      <rect
        x={centreX - cw / 2}
        y={groundY}
        width={cw}
        height={groundLineY - groundY}
        fill="#64748b"
        rx={2}
      />

      {/* Centreline (dashed) */}
      <line
        x1={centreX}
        y1={groundY - 10}
        x2={centreX}
        y2={groundLineY + 5}
        stroke="#f59e0b"
        strokeWidth={2}
        strokeDasharray="6 4"
      />

      {/* Carriageway edge lines */}
      <line x1={centreX - cw / 2} y1={groundY} x2={centreX - cw / 2} y2={groundLineY} stroke="white" strokeWidth={2} />
      <line x1={centreX + cw / 2} y1={groundY} x2={centreX + cw / 2} y2={groundLineY} stroke="white" strokeWidth={2} />

      {/* Shoulder edge lines */}
      <line x1={centreX - cw / 2 - sw} y1={groundY} x2={centreX - cw / 2 - sw} y2={groundLineY} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="4 3" />
      <line x1={centreX + cw / 2 + sw} y1={groundY} x2={centreX + cw / 2 + sw} y2={groundLineY} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="4 3" />

      {/* Reserve boundary lines */}
      <line x1={centreX - rw / 2} y1={groundY - 5} x2={centreX - rw / 2} y2={groundLineY + 5} stroke="#16a34a" strokeWidth={2.5} />
      <line x1={centreX + rw / 2} y1={groundY - 5} x2={centreX + rw / 2} y2={groundLineY + 5} stroke="#16a34a" strokeWidth={2.5} />

      {/* Width dimension lines and labels */}
      {/* Reserve width — top */}
      <line x1={centreX - rw / 2} y1={groundY - 8} x2={centreX + rw / 2} y2={groundY - 8} stroke="#16a34a" strokeWidth={1} markerStart="url(#arrowStart)" markerEnd="url(#arrowEnd)" />
      <rect x={centreX - 35} y={groundY - 22} width={70} height={14} rx={2} fill="white" opacity={0.9} />
      <text x={centreX} y={groundY - 12} textAnchor="middle" className="text-[10px] font-semibold fill-green-700">
        Reserve {reserveWidth}m
      </text>

      {/* Carriageway — bottom */}
      <line x1={centreX - cw / 2} y1={groundLineY + 8} x2={centreX + cw / 2} y2={groundLineY + 8} stroke="#475569" strokeWidth={1} />
      <rect x={centreX - 40} y={groundLineY + 12} width={80} height={14} rx={2} fill="white" opacity={0.9} />
      <text x={centreX} y={groundLineY + 23} textAnchor="middle" className="text-[10px] font-medium fill-slate-600">
        Carriageway {carriagewayWidth}m
      </text>

      {/* Left shoulder label */}
      <text x={centreX - cw / 2 - sw / 2} y={groundY + (groundLineY - groundY) / 2 + 4} textAnchor="middle" className="text-[9px] fill-white font-medium">
        {shoulderWidth}m
      </text>
      {/* Right shoulder label */}
      <text x={centreX + cw / 2 + sw / 2} y={groundY + (groundLineY - groundY) / 2 + 4} textAnchor="middle" className="text-[9px] fill-white font-medium">
        {shoulderWidth}m
      </text>

      {/* Centreline label */}
      <text x={centreX} y={groundY - 2} textAnchor="middle" className="text-[8px] fill-amber-700 font-semibold">CL</text>

      {/* Legend */}
      <rect x={padding} y={svgHeight - 30} width={12} height={8} rx={1} fill="#bbf7d0" stroke="#16a34a" strokeWidth={0.5} />
      <text x={padding + 16} y={svgHeight - 23} className="text-[9px] fill-muted-foreground">Reserve</text>
      <rect x={padding + 65} y={svgHeight - 30} width={12} height={8} rx={1} fill="#94a3b8" />
      <text x={padding + 81} y={svgHeight - 23} className="text-[9px] fill-muted-foreground">Shoulder</text>
      <rect x={padding + 145} y={svgHeight - 30} width={12} height={8} rx={1} fill="#64748b" />
      <text x={padding + 161} y={svgHeight - 23} className="text-[9px] fill-muted-foreground">Carriageway</text>
      <line x1={padding + 235} y1={svgHeight - 26} x2={padding + 255} y2={svgHeight - 26} stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 3" />
      <text x={padding + 259} y={svgHeight - 23} className="text-[9px] fill-muted-foreground">Centreline</text>
      {wlW > 0 && (
        <>
          <rect x={padding + 325} y={svgHeight - 30} width={12} height={8} rx={1} fill="#bae6fd" opacity={0.5} />
          <text x={padding + 341} y={svgHeight - 23} className="text-[9px] fill-muted-foreground">Wayleave</text>
        </>
      )}

      {/* Arrow markers */}
      <defs>
        <marker id="arrowStart" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
          <path d="M6 0 L0 3 L6 6" fill="none" stroke="#16a34a" strokeWidth={1} />
        </marker>
        <marker id="arrowEnd" markerWidth="6" markerHeight="6" refX="0" refY="3" orient="auto">
          <path d="M0 0 L6 3 L0 6" fill="none" stroke="#16a34a" strokeWidth={1} />
        </marker>
      </defs>
    </svg>
  )
}

// ────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────

export default function RoadReservePanel({
  roadClass,
  roadLength,
  existingRoadWidth: propExistingWidth,
}: RoadReservePanelProps) {
  // ── State ──
  const standards = ROAD_RESERVE_STANDARDS[roadClass]
  const reserveInfo = getRoadReserveWidth(roadClass)

  const [proposedWidth, setProposedWidth] = useState<string>('')
  const [roadLengthInput, setRoadLengthInput] = useState<string>(
    roadLength == null ? '' : String(roadLength),
  )
  const [existingWidth, setExistingWidth] = useState<string>(
    propExistingWidth == null ? '' : String(propExistingWidth),
  )
  const [wayleaveWidth, setWayleaveWidth] = useState<string>('')
  const [showWayleave, setShowWayleave] = useState(true)

  // ── Computed values ──
  const proposedNum = proposedWidth.trim() === '' ? Number.NaN : Number(proposedWidth)
  const roadLengthNum = roadLengthInput.trim() === '' ? Number.NaN : Number(roadLengthInput)
  const existingNum = existingWidth.trim() === '' ? Number.NaN : Number(existingWidth)
  const wayleaveNum = wayleaveWidth.trim() === '' ? Number.NaN : Number(wayleaveWidth)
  const hasProposedWidth = Number.isFinite(proposedNum) && proposedNum > 0
  const hasRoadLength = Number.isFinite(roadLengthNum) && roadLengthNum > 0
  const hasExistingWidth = Number.isFinite(existingNum) && existingNum >= 0

  const envelope = useMemo(
    () => estimateAcquisitionArea(roadLengthNum, proposedNum, hasExistingWidth ? existingNum : 0),
    [roadLengthNum, proposedNum, existingNum, hasExistingWidth],
  )

  const handleProposedWidthChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value
      if (v === '' || /^\d*\.?\d*$/.test(v)) {
        setProposedWidth(v)
      }
    },
    [],
  )

  const handleLengthChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value
      if (v === '' || /^\d*\.?\d*$/.test(v)) {
        setRoadLengthInput(v)
      }
    },
    [],
  )

  const handleExistingWidthChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value
      if (v === '' || /^\d*\.?\d*$/.test(v)) {
        setExistingWidth(v)
      }
    },
    [],
  )

  const handleWayleaveChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value
      if (v === '' || /^\d*\.?\d*$/.test(v)) {
        setWayleaveWidth(v)
      }
    },
    [],
  )

  // ── Render ──
  if (!standards) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground text-sm">
            Select a valid road class to view road reserve information.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* ────────────────────────────────────────────────── */}
      {/* Card 1: Road Reserve Standard                     */}
      {/* ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Ruler className="h-4 w-4 text-primary" />
            <CardTitle>Built-In Road-Class Guide</CardTitle>
          </div>
          <CardDescription>
            Class {roadClass} — {standards.description}. Verify the current governing project standard and legal corridor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground mb-1">Reference floor only</p>
              <p className="text-lg font-bold">{standards.reserveWidthMin}m</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground mb-1">Reference value only</p>
              <p className="text-lg font-bold">{standards.reserveWidthStd}m</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground mb-1">Carriageway</p>
              <p className="text-lg font-bold">{standards.carriagewayStd}m</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground mb-1">Shoulder</p>
              <p className="text-lg font-bold">{standards.shoulderStd}m</p>
            </div>
          </div>

          {/* Quick reference for all classes */}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
              View all road classes
            </summary>
            <div className="mt-2 rounded-lg border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-3 py-1.5 font-medium">Class</th>
                    <th className="text-left px-3 py-1.5 font-medium">Description</th>
                    <th className="text-right px-3 py-1.5 font-medium">Min (m)</th>
                    <th className="text-right px-3 py-1.5 font-medium">Std (m)</th>
                    <th className="text-right px-3 py-1.5 font-medium">CW (m)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(ROAD_RESERVE_STANDARDS).map((s) => (
                    <tr
                      key={s.class}
                      className={
                        s.class === roadClass
                          ? 'bg-primary/5 font-semibold'
                          : 'border-t'
                      }
                    >
                      <td className="px-3 py-1.5">{s.class}</td>
                      <td className="px-3 py-1.5">{s.description}</td>
                      <td className="text-right px-3 py-1.5">{s.reserveWidthMin}</td>
                      <td className="text-right px-3 py-1.5">{s.reserveWidthStd}</td>
                      <td className="text-right px-3 py-1.5">{s.carriagewayStd}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="text-xs text-amber-700 dark:text-amber-300">Generic class guides do not establish a project's legal right-of-way. Use the gazetted or cadastral-surveyed reserve and current approved design documents.</p>
        </CardContent>
      </Card>

      {/* ────────────────────────────────────────────────── */}
      {/* Card 2: Reference guide comparison                */}
      {/* ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Reference Width Guide</CardTitle>
          <CardDescription>
            Built-in class values are planning context only. They do not establish the legal or approved reserve for this project.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="proposed-width">Proposed Reserve Width (m)</Label>
              <Input
                id="proposed-width"
                type="text"
                inputMode="decimal"
                value={proposedWidth}
                onChange={handleProposedWidthChange}
                placeholder={`Reference ${reserveInfo.standard}`}
              />
              <p className="text-xs text-muted-foreground">
                Built-in reference range: <span className="font-semibold">{standards.reserveWidthMin}–{standards.reserveWidthStd}m</span>
              </p>
            </div>
            <div className="space-y-2">
              <Label>Comparison to built-in guide</Label>
              <p className="min-h-9 flex items-center text-sm text-muted-foreground">
                {!hasProposedWidth ? 'Enter a candidate width to compare.' : proposedNum < standards.reserveWidthMin
                  ? `${formatNumber(proposedNum)}m is below the built-in reference floor (${standards.reserveWidthMin}m).`
                  : proposedNum > standards.reserveWidthStd
                    ? `${formatNumber(proposedNum)}m is above the built-in reference value (${standards.reserveWidthStd}m).`
                    : `${formatNumber(proposedNum)}m is within the built-in reference values.`}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0m</span>
              <span>Guide floor: {standards.reserveWidthMin}m</span>
              <span>Guide value: {standards.reserveWidthStd}m</span>
            </div>
            <div className="relative h-3 rounded-full bg-muted overflow-hidden">
              {/* Standard zone marker */}
              <div
                className="absolute top-0 h-full w-px bg-foreground/30 z-10"
                style={{
                  left: `${Math.min(100, (standards.reserveWidthStd / (standards.reserveWidthStd * 1.5)) * 100)}%`,
                }}
              />
              {/* Minimum zone marker */}
              <div
                className="absolute top-0 h-full w-px bg-destructive/50 z-10"
                style={{
                  left: `${Math.min(100, (standards.reserveWidthMin / (standards.reserveWidthStd * 1.5)) * 100)}%`,
                }}
              />
              {/* Fill */}
              <div
                className="h-full rounded-full bg-sky-500 transition-all duration-300"
                style={{
                  width: `${Math.min(100, (hasProposedWidth ? proposedNum / (standards.reserveWidthStd * 1.5) : 0) * 100)}%`,
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ────────────────────────────────────────────────── */}
      {/* Card 3: Cross-Section Diagram                     */}
      {/* ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            <CardTitle>Corridor Cross-Section</CardTitle>
          </div>
          <CardDescription>
            Schematic only; with no candidate width entered, the built-in guide value is shown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CrossSectionDiagram
            reserveWidth={hasProposedWidth ? proposedNum : standards.reserveWidthStd}
            carriagewayWidth={standards.carriagewayStd}
            shoulderWidth={standards.shoulderStd}
            wayleaveWidth={showWayleave ? wayleaveNum : undefined}
          />
        </CardContent>
      </Card>

      {/* ────────────────────────────────────────────────── */}
      {/* Card 4: Acquisition Estimate                      */}
      {/* ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Ruler className="h-4 w-4 text-primary" />
            <CardTitle>Gross Corridor Envelope</CardTitle>
          </div>
          <CardDescription>
            Rectangle-based area context only. This is not a parcel take, legal acquisition, compensation, or corridor geometry calculation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="road-length">Road Length (m)</Label>
              <Input
                id="road-length"
                type="text"
                inputMode="decimal"
                value={roadLengthInput}
                onChange={handleLengthChange}
                placeholder="Enter surveyed/design length"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="existing-width">Existing Road Width (m)</Label>
              <Input
                id="existing-width"
                type="text"
                inputMode="decimal"
                value={existingWidth}
                onChange={handleExistingWidthChange}
                placeholder="Enter verified existing corridor width"
              />
              <p className="text-xs text-muted-foreground">
                Use the verified existing corridor width, not simply carriageway width.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Reserve Width</Label>
              <div className="h-9 flex items-center rounded-md border bg-muted/50 px-3">
                <span className="text-sm font-medium">{hasProposedWidth ? `${formatNumber(proposedNum)}m` : 'Not entered'}</span>
              </div>
            </div>
          </div>

          <Separator />

          {hasRoadLength && hasProposedWidth ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-lg border p-4 bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Rectangular envelope area</p>
                <p className="text-xl font-bold">{formatNumber(envelope.totalReserveArea)}</p>
                <p className="text-xs text-muted-foreground">m²</p>
              </div>
              <div className="rounded-lg border p-4 bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Gross difference from entered existing width</p>
                <p className="text-xl font-bold text-amber-700 dark:text-amber-400">
                  {hasExistingWidth ? formatNumber(envelope.newAcquisitionArea) : '—'}
                </p>
                <p className="text-xs text-muted-foreground">m² · context only</p>
              </div>
              <div className="rounded-lg border p-4 bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Total Acres</p>
                <p className="text-xl font-bold">{formatNumber(envelope.totalAcres)}</p>
                <p className="text-xs text-muted-foreground">ac</p>
              </div>
              <div className="rounded-lg border p-4 bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Total Hectares</p>
                <p className="text-xl font-bold">{formatNumber(envelope.totalHectares)}</p>
                <p className="text-xs text-muted-foreground">ha</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Enter measured/design length and candidate width to see the simple rectangular envelope area.
            </p>
          )}

          {hasExistingWidth && hasRoadLength && hasProposedWidth && envelope.newAcquisitionArea > 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-200">
                The rectangular candidate envelope exceeds the entered existing corridor width by {formatNumber(envelope.newAcquisitionArea)}m². Parcel-level impact requires surveyed parcel and corridor boundaries.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ────────────────────────────────────────────────── */}
      {/* Card 5: Property Impact Summary                   */}
      {/* ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <CardTitle>Property Impact Assessment</CardTitle>
          </div>
          <CardDescription>
            Parcel impact is calculated only after verified parcel boundaries and a project corridor are loaded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">No parcel impact result is available.</p>
            <p className="mt-1">Import or survey cadastral parcel polygons, verify their source and coordinate reference system, then compare them with the approved/gazetted corridor. Owner names and acquisition classes are intentionally not inferred here.</p>
          </div>
        </CardContent>
      </Card>

      {/* ────────────────────────────────────────────────── */}
      {/* Card 6: Wayleave Section                          */}
      {/* ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <CardTitle>Wayleave / Utility Corridor</CardTitle>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input aria-label="Showwayleave"
                type="checkbox"
                checked={showWayleave}
                onChange={(e) => setShowWayleave(e.target.checked)}
                className="rounded border-input h-4 w-4"
              />
              <span className="text-xs text-muted-foreground">Show on diagram</span>
            </label>
          </div>
          <CardDescription>
            Utility wayleaves are accommodated within the road reserve corridor
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="wayleave-width">Wayleave Width (m)</Label>
              <Input
                id="wayleave-width"
                type="text"
                inputMode="decimal"
                value={wayleaveWidth}
                onChange={handleWayleaveChange}
                placeholder="Enter utility owner's specified width"
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Use the utility owner's design requirement. This value only changes the schematic.</p>
            </div>
          </div>

          <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 p-3 flex items-start gap-2">
            <Zap className="h-4 w-4 text-sky-600 dark:text-sky-400 mt-0.5 shrink-0" />
            <div className="text-xs text-sky-800 dark:text-sky-200 space-y-1">
              <p>Utility placement, easement width, approvals, and land rights depend on the utility owner and project approvals.</p>
              <p>The schematic does not verify clearance, clashes, reserve fit, or legal rights. Confirm surveyed offsets, depths, and utility-owner requirements.</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">No spatial fit result is available until the utility route and approved reserve boundaries are surveyed or imported.</p>
        </CardContent>
      </Card>
    </div>
  )
}
