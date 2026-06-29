'use client'

/**
 * DigitizingToolbar — Advanced editing tools (QGIS Digitizing inspired)
 *
 * Tools:
 * 1. Draw — Point, Line, Polygon, Circle (existing)
 * 2. Split — Cut a polygon with a line
 * 3. Merge — Combine two or more adjacent polygons
 * 4. Reshape — Modify polygon boundary by drawing new edge
 * 5. Rotate — Rotate selected feature around centroid
 * 6. Offset — Create parallel offset of a line/boundary
 * 7. Undo / Redo — History navigation
 *
 * Each tool shows contextual instructions when active.
 */

import { useState, useCallback } from 'react'
import {
  Pencil, Scissors, GitMerge, RefreshCw, Ruler,
  Undo2, Redo2, Settings2, Info,
} from 'lucide-react'

type DigitizingTool = 'draw' | 'split' | 'merge' | 'reshape' | 'rotate' | 'offset' | null

interface DigitizingToolbarProps {
  activeTool?: DigitizingTool
  onToolChange?: (tool: DigitizingTool) => void
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
  snappingEnabled?: boolean
  onToggleSnapping?: () => void
}

const TOOLS: Array<{
  id: DigitizingTool
  label: string
  icon: typeof Pencil
  shortcut: string
  description: string
  instructions: string
}> = [
  {
    id: 'draw',
    label: 'Draw',
    icon: Pencil,
    shortcut: 'D',
    description: 'Draw new features',
    instructions: 'Select geometry type (Point/Line/Polygon) from the dock. Click to add vertices, double-click to finish.',
  },
  {
    id: 'split',
    label: 'Split',
    icon: Scissors,
    shortcut: 'S',
    description: 'Split a polygon with a line',
    instructions: 'Click on a polygon, then draw a line across it. The polygon will be split into two parts at the line.',
  },
  {
    id: 'merge',
    label: 'Merge',
    icon: GitMerge,
    shortcut: 'M',
    description: 'Merge adjacent polygons',
    instructions: 'Select two or more adjacent polygons. They will be combined into a single polygon with shared boundaries removed.',
  },
  {
    id: 'reshape',
    label: 'Reshape',
    icon: RefreshCw,
    shortcut: 'R',
    description: 'Reshape polygon boundary',
    instructions: 'Draw a new line across the polygon boundary. The boundary will be replaced with the new line segment.',
  },
  {
    id: 'rotate',
    label: 'Rotate',
    icon: RefreshCw,
    shortcut: 'O',
    description: 'Rotate selected feature',
    instructions: 'Select a feature, then drag to rotate around its centroid. Hold Shift for 15° increments.',
  },
  {
    id: 'offset',
    label: 'Offset',
    icon: Ruler,
    shortcut: 'F',
    description: 'Create parallel offset',
    instructions: 'Select a line or polygon edge. Enter the offset distance. A parallel copy will be created.',
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
}: DigitizingToolbarProps) {
  const [internalActiveTool, setInternalActiveTool] = useState<DigitizingTool>(null)
  const [showSettings, setShowSettings] = useState(false)

  const activeTool = externalActiveTool ?? internalActiveTool

  const handleToolClick = useCallback((tool: DigitizingTool) => {
    const newTool = activeTool === tool ? null : tool
    setInternalActiveTool(newTool)
    onToolChange?.(newTool)
  }, [activeTool, onToolChange])

  const activeToolConfig = TOOLS.find(t => t.id === activeTool)

  return (
    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20">
      <div className="bg-[#0d0d14]/95 backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 p-1.5">
          {TOOLS.map(tool => {
            const Icon = tool.icon
            const isActive = activeTool === tool.id
            return (
              <button
                key={tool.id}
                onClick={() => handleToolClick(tool.id)}
                title={`${tool.label} (${tool.shortcut})`}
                className={`relative flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-200 group ${
                  isActive
                    ? 'bg-[#E8841A]/15 border border-[#E8841A]/30 text-[#E8841A]'
                    : 'border border-transparent text-gray-500 hover:bg-white/[0.04] hover:text-gray-300'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[8px] font-medium mt-0.5">{tool.label}</span>
                {isActive && (
                  <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#E8841A] animate-pulse" />
                )}
              </button>
            )
          })}

          {/* Divider */}
          <div className="w-px h-10 bg-white/[0.06] mx-1" />

          {/* Undo / Redo */}
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="flex items-center justify-center w-11 h-11 rounded-xl border border-transparent text-gray-500 hover:bg-white/[0.04] hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="flex items-center justify-center w-11 h-11 rounded-xl border border-transparent text-gray-500 hover:bg-white/[0.04] hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          {/* Divider */}
          <div className="w-px h-10 bg-white/[0.06] mx-1" />

          {/* Snapping toggle */}
          <button
            onClick={onToggleSnapping}
            title={`Snapping: ${snappingEnabled ? 'ON' : 'OFF'}`}
            className={`flex items-center justify-center w-11 h-11 rounded-xl border transition-all ${
              snappingEnabled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'border-transparent text-gray-500 hover:bg-white/[0.04]'
            }`}
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>

        {/* Active tool instructions */}
        {activeToolConfig && (
          <div className="px-4 py-2 border-t border-white/[0.06] bg-[#0d0d14]/60">
            <div className="flex items-start gap-2">
              <Info className="w-3 h-3 text-[#E8841A] shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] font-semibold text-[#E8841A] uppercase tracking-wider">
                  {activeToolConfig.label}
                </span>
                <p className="text-[10px] text-gray-400 mt-0.5">{activeToolConfig.instructions}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
