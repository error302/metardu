'use client'

import { memo } from 'react'
import { Layers, MapPin } from 'lucide-react'
import { useMapContext } from '@/app/map/MapReactContext'
import { MapCoordSearch } from './MapCoordSearch'
import { ProjectionSwitcher } from '@/components/map/ProjectionSwitcher'
import { useVisibleBasemap } from '../hooks/useVisibleBasemap'

export const MapWorkspaceHeader = memo(function MapWorkspaceHeader({
  layersOpen, onToggleLayers,
}: { layersOpen: boolean; onToggleLayers: () => void }) {
  const { mouseCoord, currentSurveyCrs, schemeProjectId } = useMapContext()
  return (
    <header className="map-workspace-header" aria-label="Map workspace">
      <h1 className="sr-only">Survey map</h1>
      <MapCoordSearch />
      <div className="map-cursor-readout" aria-label="Cursor location">
        <MapPin className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
        <div className="min-w-0">
          <p>{mouseCoord ? `${mouseCoord.lat.toFixed(6)}°, ${mouseCoord.lon.toFixed(6)}°` : 'Move the pointer over the map'}</p>
          <span>{currentSurveyCrs ? `Survey ${currentSurveyCrs}` : 'Choose a survey grid'} · {schemeProjectId ? 'Linked project' : 'Global map'}</span>
        </div>
      </div>
      <ProjectionSwitcher compact />
      <button type="button" className="map-header-layers" onClick={onToggleLayers} aria-expanded={layersOpen} aria-controls="map-panel-layers">
        <Layers className="h-4 w-4" aria-hidden="true" /> Layers
      </button>
    </header>
  )
})

export const MapBasemapBar = memo(function MapBasemapBar() {
  const { toggleBasemap } = useMapContext()
  const visibleBasemap = useVisibleBasemap()
  return (
    <div className="map-basemap-bar" role="group" aria-label="Basemap">
      {([
        ['osm', 'Map'], ['satellite', 'Satellite'], ['terrain', 'Terrain'], ['dark', 'Dark'],
      ] as const).map(([mode, label]) => (
        <button type="button" key={mode} onClick={() => toggleBasemap(mode)} aria-pressed={visibleBasemap === mode}>{label}</button>
      ))}
    </div>
  )
})
