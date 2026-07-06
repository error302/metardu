'use client'

/**
 * DigitizingToolbar — Advanced editing tools with REAL implementations
 *
 * Tools:
 * 1. Draw — Point, Line, Polygon (delegates to existing draw interaction)
 * 2. Split — Draw a line across a polygon → splits into two polygons
 * 3. Merge — Select 2+ adjacent polygons → combines into one
 * 4. Reshape — Draw a new boundary segment → replaces old boundary
 * 5. Rotate — Drag to rotate selected feature around centroid
 * 6. Offset — Enter distance → creates parallel copy
 * 7. Undo / Redo — History navigation
 * 8. Snapping toggle
 *
 * Each tool calls back to MapClient which creates the appropriate OL interaction.
 */

import { useState, useCallback } from 'react'
import {
  Pencil, Scissors, GitMerge, RefreshCw, Ruler,
  Undo2, Redo2, Magnet, Info,
} from 'lucide-react'

export type DigitizingTool = 'draw' | 'split' | 'merge' | 'reshape' | 'rotate' | 'offset' | null

interface DigitizingToolbarProps {
  activeTool?: DigitizingTool
  onToolChange?: (tool: DigitizingTool) => void
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
  snappingEnabled?: boolean
  onToggleSnapping?: () => void
  /** Number of selected features (for merge/rotate/offset enablement) */
  selectedCount?: number
  /** Offset distance in metres (for offset tool) */
  offsetDistance?: number
  onOffsetDistanceChange?: (d: number) => void
  /** AUDIT FIX (2026-07-05): Rotate angle in degrees (for rotate tool).
   * Was previously hardcoded to 15° inside MapClient. Now the toolbar
   * shows a slider so the user can pick the angle. */
  rotateAngle?: number
  onRotateAngleChange?: (a: number) => void
}

const TOOLS: Array<{
  id: DigitizingTool
  label: string
  icon: typeof Pencil
  shortcut: string
  description: string
  instructions: string
  requiresSelection?: boolean
}> = [
  {
    id: 'draw',
    label: 'Draw',
    icon: Pencil,
    shortcut: 'D',
    description: 'Draw new features',
    instructions: 'Select geometry type from the dock. Click to add vertices, double-click to finish.',
  },
  {
    id: 'split',
    label: 'Split',
    icon: Scissors,
    shortcut: 'S',
    description: 'Split a polygon with a line',
    instructions: 'Draw a line across the polygon you want to split. The polygon will be cut into two parts at the line. Both parts are saved as new features.',
  },
  {
    id: 'merge',
    label: 'Merge',
    icon: GitMerge,
    shortcut: 'M',
    description: 'Merge adjacent polygons',
    instructions: 'Select two or more adjacent polygons (Shift+click). Click Merge to combine them into one. Shared boundaries are removed.',
    requiresSelection: true,
  },
  {
    id: 'reshape',
    label: 'Reshape',
    icon: RefreshCw,
    shortcut: 'R',
    description: 'Reshape polygon boundary',
    instructions: 'Draw a new line across the polygon boundary. The boundary between intersection points will be replaced with your new line.',
  },
  {
    id: 'rotate',
    label: 'Rotate',
    icon: RefreshCw,
    shortcut: 'O',
    description: 'Rotate selected feature',
    instructions: 'Select a feature, then use the slider to rotate around its centroid. The geometry updates live.',
    requiresSelection: true,
  },
  {
    id: 'offset',
    label: 'Offset',
    icon: Ruler,
    shortcut: 'F',
    description: 'Create parallel offset',
    instructions: 'Select a line or polygon. Enter the offset distance. A parallel copy is created at that distance.',
    requiresSelection: true,
  },
]

export function DigitizingToolbar({
  activeTool: externalActiveTool,
  onToolChange,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  snappingEnabled = true,
  onToggleSnapping,
  selectedCount = 0,
  offsetDistance = 5,
  onOffsetDistanceChange,
  rotateAngle = 15,
  onRotateAngleChange,
}: DigitizingToolbarProps) {
  const [internalActiveTool, setInternalActiveTool] = useState<DigitizingTool>(null)

  const activeTool = externalActiveTool ?? internalActiveTool

  const handleToolClick = useCallback((tool: DigitizingTool) => {
    const newTool = activeTool === tool ? null : tool
    setInternalActiveTool(newTool)
    onToolChange?.(newTool)
  }, [activeTool, onToolChange])

  const activeToolConfig = TOOLS.find(t => t.id === activeTool)

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-20 transition-all duration-300 ease-out"
      style={{ bottom: 'calc(var(--map-bottom-offset, 0px) + 48px)' }}
    >
      <div className="bg-[var(--bg-card)]/90 backdrop-blur-md border border-[var(--border-color)]/60 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-300 hover:shadow-[0_8px_32px_rgba(209,123,71,0.08)] hover:border-[var(--accent)]/20">
        {/* Toolbar */}
        <div className="flex items-center gap-1 p-1.5">
          {TOOLS.map(tool => {
            const Icon = tool.icon
            const isActive = activeTool === tool.id
            const isDisabled = tool.requiresSelection && selectedCount === 0
            return (
              <button
                key={tool.id}
                onClick={() => !isDisabled && handleToolClick(tool.id)}
                title={`${tool.label} (${tool.shortcut})${isDisabled ? ' — select a feature first' : ''}`}
                disabled={isDisabled}
                className={`relative flex flex-col items-center justify-center w-11 h-11 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--accent)] font-medium scale-[1.02]'
                    : 'border border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] hover:scale-[1.04] active:scale-[0.96] disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="text-[8px] font-mono mt-0.5 tracking-wider">{tool.label}</span>
                {isActive && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
                )}
              </button>
            )
          })}

          {/* Divider */}
          <div className="w-px h-6 bg-[var(--border-color)]/60 mx-1" />

          {/* Undo / Redo */}
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] hover:scale-[1.04] active:scale-[0.96] disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-transparent transition-all"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] hover:scale-[1.04] active:scale-[0.96] disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-transparent transition-all"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-[var(--border-color)]/60 mx-1" />

          {/* Snapping toggle */}
          <button
            onClick={onToggleSnapping}
            title={`Snapping: ${snappingEnabled ? 'ON' : 'OFF'}`}
            className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all hover:scale-[1.04] active:scale-[0.96] ${
              snappingEnabled
                ? 'bg-[var(--success)]/10 border-[var(--success)]/30 text-[var(--success)]'
                : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]'
            }`}
          >
            <Magnet className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Active tool instructions + controls */}
        {activeToolConfig && (
          <div className="px-4 py-2.5 border-t border-[var(--border-color)]/40 bg-[var(--bg-secondary)]/50">
            <div className="flex items-start gap-2.5">
              <Info className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-[240px] max-w-[320px]">
                <span className="font-mono text-[9px] text-[var(--accent)] uppercase tracking-[0.12em] font-semibold">
                  {activeToolConfig.label}
                </span>
                <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{activeToolConfig.instructions}</p>

                {/* Offset distance slider */}
                {activeTool === 'offset' && onOffsetDistanceChange && (
                  <div className="flex items-center gap-2 mt-2 pt-1 border-t border-[var(--border-color)]/30">
                    <span className="font-mono text-[9px] text-[var(--text-muted)] uppercase tracking-wider">Distance:</span>
                    <input aria-label="Offset distance"
                      type="range"
                      min="1"
                      max="50"
                      value={offsetDistance}
                      onChange={e => onOffsetDistanceChange(parseFloat(e.target.value))}
                      className="flex-1 h-1 bg-[var(--border-color)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                    />
                    <span className="font-mono text-[10px] text-[var(--accent)] font-medium min-w-[28px] text-right">{offsetDistance}m</span>
                  </div>
                )}

                {/* Rotate angle slider */}
                {activeTool === 'rotate' && onRotateAngleChange && (
                  <div className="flex items-center gap-2 mt-2 pt-1 border-t border-[var(--border-color)]/30">
                    <span className="font-mono text-[9px] text-[var(--text-muted)] uppercase tracking-wider">Angle:</span>
                    <input aria-label="Rotation angle"
                      type="range"
                      min="0"
                      max="360"
                      step="1"
                      value={rotateAngle}
                      onChange={e => onRotateAngleChange(parseFloat(e.target.value))}
                      className="flex-1 h-1 bg-[var(--border-color)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                    />
                    <span className="font-mono text-[10px] text-[var(--accent)] font-medium min-w-[32px] text-right">{rotateAngle}°</span>
                  </div>
                )}

                {/* Selected count indicator */}
                {activeToolConfig.requiresSelection && (
                  <p className="font-mono text-[9px] text-[var(--text-muted)] mt-1.5 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
                    {selectedCount} feature{selectedCount !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
