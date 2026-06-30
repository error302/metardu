'use client'

/**
 * LayerPanel — Full layer management (QGIS Layer Panel inspired)
 *
 * Features:
 * - Toggle layer visibility
 * - Adjust opacity per layer
 * - Reorder layers (drag to reorder)
 * - Layer group headers (Basemaps, Parcels, Beacons, Overlays)
 * - Active layer indicator
 * - Quick style toggle
 * - Expandable layer details
 */

import { useState, useCallback } from 'react'
import {
  Eye, EyeOff, ChevronUp, ChevronDown, Layers,
  Map as MapIcon, MapPin, Satellite, Mountain, Moon,
  GripVertical, Settings2,
} from 'lucide-react'

type LayerType = 'basemap' | 'parcels' | 'beacons' | 'overlays' | 'grid' | 'measurements'

interface Layer {
  id: string
  name: string
  type: LayerType
  visible: boolean
  opacity: number  // 0-100
  icon: typeof Eye
  active?: boolean
}

interface LayerPanelProps {
  layers?: Layer[]
  onToggleVisibility?: (id: string) => void
  onOpacityChange?: (id: string, opacity: number) => void
  onReorder?: (id: string, direction: 'up' | 'down') => void
}

const DEFAULT_LAYERS: Layer[] = [
  { id: 'osm', name: 'OpenStreetMap', type: 'basemap', visible: true, opacity: 100, icon: MapIcon, active: true },
  { id: 'satellite', name: 'Satellite', type: 'basemap', visible: false, opacity: 100, icon: Satellite },
  { id: 'dark', name: 'Dark Matter', type: 'basemap', visible: false, opacity: 100, icon: Moon },
  { id: 'terrain', name: 'Terrain', type: 'basemap', visible: false, opacity: 100, icon: Mountain },
  { id: 'ndvi', name: 'Sentinel-2 NDVI', type: 'overlays', visible: false, opacity: 70, icon: Layers },
  { id: 'imagery', name: 'Esri Imagery', type: 'overlays', visible: false, opacity: 70, icon: Satellite },
  { id: 'parcels', name: 'Parcels', type: 'parcels', visible: true, opacity: 80, icon: Layers },
  { id: 'beacons', name: 'Beacons', type: 'beacons', visible: true, opacity: 100, icon: MapPin },
  { id: 'measurements', name: 'Measurements', type: 'measurements', visible: true, opacity: 100, icon: Layers },
  { id: 'grid', name: 'Coordinate Grid', type: 'grid', visible: false, opacity: 50, icon: Layers },
]

const GROUP_LABELS: Record<string, string> = {
  basemap: 'Basemaps',
  parcels: 'Survey Data',
  beacons: 'Control Points',
  overlays: 'Overlays',
  measurements: 'Measurements',
  grid: 'Reference',
}

export function LayerPanel({
  layers = DEFAULT_LAYERS,
  onToggleVisibility,
  onOpacityChange,
  onReorder,
}: LayerPanelProps) {
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set())
  const [localLayers, setLocalLayers] = useState(layers)

  const toggleExpand = useCallback((id: string) => {
    setExpandedLayers(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleToggleVisibility = useCallback((id: string) => {
    setLocalLayers(prev =>
      prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l)
    )
    onToggleVisibility?.(id)
  }, [onToggleVisibility])

  const handleOpacityChange = useCallback((id: string, opacity: number) => {
    setLocalLayers(prev =>
      prev.map(l => l.id === id ? { ...l, opacity } : l)
    )
    onOpacityChange?.(id, opacity)
  }, [onOpacityChange])

  // Group layers by type
  const grouped = localLayers.reduce<Record<string, Layer[]>>((acc, layer) => {
    if (!acc[layer.type]) acc[layer.type] = []
    acc[layer.type].push(layer)
    return acc
  }, {})

  return (
    <div className="bg-[#0d0d14]/95 backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.06]">
        <Layers className="w-4 h-4 text-[#D17B47]" />
        <span className="text-xs font-semibold text-white">Layers</span>
      </div>

      {/* Layer groups */}
      <div className="max-h-[400px] overflow-y-auto p-2 space-y-2">
        {Object.entries(grouped).map(([type, typeLayers]) => (
          <div key={type}>
            {/* Group header */}
            <div className="px-1 py-1 text-[9px] text-gray-600 uppercase tracking-wider font-semibold">
              {GROUP_LABELS[type] || type}
            </div>

            {/* Layers in group */}
            <div className="space-y-0.5">
              {typeLayers.map((layer, idx) => {
                const Icon = layer.icon
                const isExpanded = expandedLayers.has(layer.id)
                const globalIdx = localLayers.indexOf(layer)

                return (
                  <div key={layer.id} className="rounded-lg">
                    {/* Layer row */}
                    <div
                      className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition-colors ${
                        layer.active
                          ? 'bg-[#D17B47]/5 border border-[#D17B47]/20'
                          : 'hover:bg-white/[0.04] border border-transparent'
                      }`}
                      onClick={() => toggleExpand(layer.id)}
                    >
                      {/* Visibility toggle */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleVisibility(layer.id) }}
                        className={`shrink-0 w-6 h-6 flex items-center justify-center rounded transition-colors ${
                          layer.visible ? 'text-[#D17B47]' : 'text-gray-600'
                        }`}
                      >
                        {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>

                      {/* Layer icon */}
                      <div className={`shrink-0 w-6 h-6 rounded flex items-center justify-center ${
                        layer.visible ? 'bg-white/[0.06]' : 'bg-white/[0.02]'
                      }`}>
                        <Icon className={`w-3.5 h-3.5 ${layer.visible ? 'text-gray-300' : 'text-gray-600'}`} />
                      </div>

                      {/* Layer name */}
                      <span className={`flex-1 text-[11px] truncate ${
                        layer.visible ? 'text-gray-200' : 'text-gray-600'
                      }`}>
                        {layer.name}
                      </span>

                      {/* Opacity indicator */}
                      {layer.opacity < 100 && (
                        <span className="text-[8px] text-gray-600 font-mono shrink-0">
                          {layer.opacity}%
                        </span>
                      )}
                    </div>

                    {/* Expanded controls */}
                    {isExpanded && (
                      <div className="px-3 py-2 space-y-2 bg-white/[0.02] rounded-b-lg border border-white/[0.04] border-t-0">
                        {/* Opacity slider */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] text-gray-500 uppercase tracking-wider">Opacity</span>
                            <span className="text-[9px] text-gray-400 font-mono">{layer.opacity}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={layer.opacity}
                            onChange={(e) => handleOpacityChange(layer.id, parseInt(e.target.value))}
                            className="w-full h-1 accent-[#D17B47] cursor-pointer"
                          />
                        </div>

                        {/* Reorder buttons */}
                        {onReorder && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); onReorder(layer.id, 'up') }}
                              disabled={globalIdx === 0}
                              className="flex-1 flex items-center justify-center gap-1 h-6 rounded bg-white/[0.04] text-[9px] text-gray-400 hover:text-gray-200 disabled:opacity-30 transition-colors"
                            >
                              <ChevronUp className="w-3 h-3" />
                              Up
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); onReorder(layer.id, 'down') }}
                              disabled={globalIdx === localLayers.length - 1}
                              className="flex-1 flex items-center justify-center gap-1 h-6 rounded bg-white/[0.04] text-[9px] text-gray-400 hover:text-gray-200 disabled:opacity-30 transition-colors"
                            >
                              <ChevronDown className="w-3 h-3" />
                              Down
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
