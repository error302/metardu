'use client'

/**
 * StyleManager — Save and reuse custom map styles
 *
 * QGIS Style Manager inspired. Features:
 * - Predefined SoK-compliant styles
 * - Custom style presets (save current style)
 * - Per-feature-type styling (parcels, beacons, lines)
 * - Color picker, line width, fill pattern
 * - Apply style to selected feature or all features
 * - Import/export style definitions
 */

import { useState, useCallback } from 'react'
import {
  Palette, Save, Trash2, Download, Upload,
  Check, Plus, Layers,
} from 'lucide-react'

type FeatureType = 'parcel' | 'beacon' | 'line' | 'polygon' | 'point'

interface StylePreset {
  id: string
  name: string
  featureType: FeatureType
  fillColor: string
  strokeColor: string
  strokeWidth: number
  fillOpacity: number  // 0-100
  label?: string
  isBuiltIn?: boolean
}

const BUILTIN_PRESETS: StylePreset[] = [
  {
    id: 'sok-parcel-registered',
    name: 'SoK — Registered Parcel',
    featureType: 'parcel',
    fillColor: '#2d5016',
    strokeColor: '#1a1a1a',
    strokeWidth: 0.3,
    fillOpacity: 15,
    isBuiltIn: true,
  },
  {
    id: 'sok-parcel-pending',
    name: 'SoK — Pending Parcel',
    featureType: 'parcel',
    fillColor: '#996600',
    strokeColor: '#1a1a1a',
    strokeWidth: 0.3,
    fillOpacity: 15,
    isBuiltIn: true,
  },
  {
    id: 'sok-parcel-disputed',
    name: 'SoK — Disputed Parcel',
    featureType: 'parcel',
    fillColor: '#cc0000',
    strokeColor: '#1a1a1a',
    strokeWidth: 0.3,
    fillOpacity: 15,
    isBuiltIn: true,
  },
  {
    id: 'sok-beacon-concrete',
    name: 'SoK — Concrete Beacon',
    featureType: 'beacon',
    fillColor: '#000000',
    strokeColor: '#ffffff',
    strokeWidth: 2,
    fillOpacity: 100,
    isBuiltIn: true,
  },
  {
    id: 'sok-beacon-iron',
    name: 'SoK — Iron Pin',
    featureType: 'beacon',
    fillColor: '#0066cc',
    strokeColor: '#ffffff',
    strokeWidth: 2,
    fillOpacity: 100,
    isBuiltIn: true,
  },
  {
    id: 'sok-road-reserve',
    name: 'SoK — Road Reserve',
    featureType: 'line',
    fillColor: '#ff6600',
    strokeColor: '#ff6600',
    strokeWidth: 0.4,
    fillOpacity: 10,
    isBuiltIn: true,
  },
  {
    id: 'sok-water',
    name: 'SoK — Water Feature',
    featureType: 'polygon',
    fillColor: '#0066cc',
    strokeColor: '#0066cc',
    strokeWidth: 0.3,
    fillOpacity: 30,
    isBuiltIn: true,
  },
]

const FEATURE_TYPE_LABELS: Record<FeatureType, string> = {
  parcel: 'Parcels',
  beacon: 'Beacons',
  line: 'Lines',
  polygon: 'Polygons',
  point: 'Points',
}

interface StyleManagerProps {
  onApplyStyle?: (preset: StylePreset) => void
  currentStyleId?: string
}

export function StyleManager({ onApplyStyle, currentStyleId }: StyleManagerProps) {
  const [presets, setPresets] = useState<StylePreset[]>(BUILTIN_PRESETS)
  const [activeType, setActiveType] = useState<FeatureType | 'all'>('all')
  const [showEditor, setShowEditor] = useState(false)
  const [editingPreset, setEditingPreset] = useState<StylePreset | null>(null)

  const filteredPresets = activeType === 'all'
    ? presets
    : presets.filter(p => p.featureType === activeType)

  const handleApply = useCallback((preset: StylePreset) => {
    onApplyStyle?.(preset)
  }, [onApplyStyle])

  const handleSaveCustom = useCallback(() => {
    const newPreset: StylePreset = editingPreset || {
      id: crypto.randomUUID(),
      name: 'Custom Style',
      featureType: 'parcel',
      fillColor: '#E8841A',
      strokeColor: '#1a1a1a',
      strokeWidth: 0.3,
      fillOpacity: 20,
    }

    if (!editingPreset) {
      setPresets(prev => [...prev, newPreset])
    } else {
      setPresets(prev => prev.map(p => p.id === newPreset.id ? newPreset : p))
    }
    setShowEditor(false)
    setEditingPreset(null)
  }, [editingPreset])

  const handleDelete = useCallback((id: string) => {
    setPresets(prev => prev.filter(p => p.id !== id || p.isBuiltIn))
  }, [])

  const handleExport = useCallback(() => {
    const json = JSON.stringify(presets, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'metardu-styles.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [presets])

  return (
    <div className="bg-[#0d0d14]/95 backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-[#E8841A]" />
          <span className="text-xs font-semibold text-white">Style Manager</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleExport}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-white/[0.06]"
            title="Export styles"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { setEditingPreset(null); setShowEditor(true) }}
            className="w-6 h-6 flex items-center justify-center rounded text-[#E8841A] hover:bg-[#E8841A]/10"
            title="Add custom style"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Type filter */}
      <div className="px-3 py-2 border-b border-white/[0.06] flex items-center gap-1 overflow-x-auto">
        {(['all', 'parcel', 'beacon', 'line', 'polygon'] as const).map(type => (
          <button
            key={type}
            onClick={() => setActiveType(type)}
            className={`px-2 py-0.5 rounded text-[9px] font-medium whitespace-nowrap transition-colors ${
              activeType === type
                ? 'bg-[#E8841A]/10 border border-[#E8841A]/30 text-[#E8841A]'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            {type === 'all' ? 'All' : FEATURE_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      {/* Preset list */}
      <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
        {filteredPresets.map(preset => (
          <div
            key={preset.id}
            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
              currentStyleId === preset.id
                ? 'bg-[#E8841A]/5 border border-[#E8841A]/20'
                : 'hover:bg-white/[0.04] border border-transparent'
            }`}
            onClick={() => handleApply(preset)}
          >
            {/* Style preview */}
            <div className="shrink-0 w-8 h-8 rounded-lg border border-white/[0.1] flex items-center justify-center relative overflow-hidden"
              style={{
                backgroundColor: preset.fillColor + Math.round(preset.fillOpacity * 2.55).toString(16).padStart(2, '0'),
              }}
            >
              <div
                className="absolute inset-0"
                style={{
                  border: `${preset.strokeWidth}px solid ${preset.strokeColor}`,
                  borderRadius: '4px',
                }}
              />
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium text-gray-200 truncate">{preset.name}</div>
              <div className="text-[8px] text-gray-600">
                {FEATURE_TYPE_LABELS[preset.featureType]} · {preset.strokeWidth}mm · {preset.fillOpacity}%
              </div>
            </div>

            {/* Actions */}
            {currentStyleId === preset.id && (
              <Check className="w-3.5 h-3.5 text-[#E8841A] shrink-0" />
            )}
            {!preset.isBuiltIn && (
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(preset.id) }}
                className="w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-red-400 shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Custom style editor */}
      {showEditor && (
        <div className="p-3 border-t border-white/[0.06] space-y-2 bg-white/[0.02]">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            {editingPreset ? 'Edit Style' : 'New Custom Style'}
          </div>
          <input
            type="text"
            value={editingPreset?.name || ''}
            onChange={e => setEditingPreset(prev => ({ ...(prev || { id: crypto.randomUUID(), name: '', featureType: 'parcel', fillColor: '#E8841A', strokeColor: '#1a1a1a', strokeWidth: 0.3, fillOpacity: 20 }), name: e.target.value }))}
            placeholder="Style name"
            className="w-full h-7 px-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-xs text-white"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[8px] text-gray-500 uppercase mb-0.5">Fill Color</label>
              <input
                type="color"
                value={editingPreset?.fillColor || '#E8841A'}
                onChange={e => setEditingPreset(prev => ({ ...(prev || {}), fillColor: e.target.value } as StylePreset))}
                className="w-full h-7 rounded cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-[8px] text-gray-500 uppercase mb-0.5">Stroke Color</label>
              <input
                type="color"
                value={editingPreset?.strokeColor || '#1a1a1a'}
                onChange={e => setEditingPreset(prev => ({ ...(prev || {}), strokeColor: e.target.value } as StylePreset))}
                className="w-full h-7 rounded cursor-pointer"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[8px] text-gray-500 uppercase mb-0.5">Stroke Width (mm)</label>
              <input
                type="number"
                step="0.05"
                value={editingPreset?.strokeWidth || 0.3}
                onChange={e => setEditingPreset(prev => ({ ...(prev || {}), strokeWidth: parseFloat(e.target.value) } as StylePreset))}
                className="w-full h-7 px-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[8px] text-gray-500 uppercase mb-0.5">Fill Opacity (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={editingPreset?.fillOpacity || 20}
                onChange={e => setEditingPreset(prev => ({ ...(prev || {}), fillOpacity: parseInt(e.target.value) } as StylePreset))}
                className="w-full h-7 px-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-xs text-white font-mono"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowEditor(false); setEditingPreset(null) }}
              className="flex-1 h-7 rounded bg-white/[0.04] border border-white/[0.06] text-xs text-gray-400"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveCustom}
              className="flex-1 h-7 rounded bg-[#E8841A] text-black text-xs font-semibold"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
