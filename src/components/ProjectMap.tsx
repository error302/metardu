'use client'

import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { distanceBearing } from '@/lib/engine/distance'
import { bearingToString } from '@/lib/engine/angles'

// Fix Leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export interface SurveyPoint {
  id?: string
  name: string
  easting: number
  northing: number
  elevation?: number
  is_control?: boolean
  lat?: number
  lon?: number
}

interface ProjectMapProps {
  points: SurveyPoint[]
  utmZone: number
  hemisphere: 'N' | 'S'
  onMapClick?: (lat: number, lon: number) => void
  drawMode?: boolean
  onDrawUpdate?: (points: SurveyPoint[]) => void
}

const amberIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-amber.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
})

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
})

const selectedIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
})

function UTMToLatLon(easting: number, northing: number, zone: number, hemisphere: 'N' | 'S'): { lat: number; lon: number } {
  const k0 = 0.9996
  const WGS84_A = 6378137.0
  const WGS84_F = 1 / 298.257223563
  const WGS84_E2 = 2 * WGS84_F - WGS84_F * WGS84_F
  const e1 = (1 - Math.sqrt(1 - WGS84_E2)) / (1 + Math.sqrt(1 - WGS84_E2))
  
  let y = northing
  if (hemisphere === 'S') {
    y -= 10000000
  }
  
  const lonOrigin = (zone - 1) * 6 - 180 + 3
  const lonOriginRad = lonOrigin * Math.PI / 180
  
  const M = y / k0
  const mu = M / (WGS84_A * (1 - WGS84_E2 / 4 - 3 * WGS84_E2 * WGS84_E2 / 64))
  
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 * e1 * e1 / 32) * Math.sin(2 * mu)
             + (21 * e1 * e1 / 16 - 55 * e1 * e1 * e1 * e1 / 32) * Math.sin(4 * mu)
             + (151 * e1 * e1 * e1 / 96) * Math.sin(6 * mu)
  
  const N1 = WGS84_A / Math.sqrt(1 - WGS84_E2 * Math.sin(phi1) * Math.sin(phi1))
  const T1 = Math.tan(phi1) * Math.tan(phi1)
  const C1 = (WGS84_E2 / (1 - WGS84_E2)) * Math.cos(phi1) * Math.cos(phi1)
  const R1 = WGS84_A * (1 - WGS84_E2) / Math.pow(1 - WGS84_E2 * Math.sin(phi1) * Math.sin(phi1), 1.5)
  const D = (easting - 500000) / (N1 * k0)
  
  let lat = phi1 - (N1 * Math.tan(phi1) / R1) * (D * D / 2
             - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * WGS84_E2 / (1 - WGS84_E2)) * D * D * D * D / 24
             + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * WGS84_E2 / (1 - WGS84_E2) - 3 * C1 * C1) * D * D * D * D * D * D / 720)
  
  let lon = (lonOriginRad) + (D - (1 + 2 * T1 + C1) * D * D * D / 6
             + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * WGS84_E2 / (1 - WGS84_E2) + 24 * T1 * T1) * D * D * D * D * D / 120) / Math.cos(phi1)
  
  return {
    lat: Math.round(lat * 180 / Math.PI * 10000000) / 10000000,
    lon: Math.round(lon * 180 / Math.PI * 10000000) / 10000000
  }
}

function MapClickHandler({ onClick }: { onClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click: (e) => {
      onClick(e.latlng.lat, e.latlng.lng)
    }
  })
  return null
}

function RecenterMap({ center }: { center: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, map.getZoom())
  }, [center, map])
  return null
}

function FlyToPoints({ points, utmZone, hemisphere }: { points: SurveyPoint[]; utmZone: number; hemisphere: 'N' | 'S' }) {
  const map = useMap()
  const prevPointsLength = useRef(0)
  
  useEffect(() => {
    if (points.length === 0) return
    
    if (points.length > prevPointsLength.current && points.length > 0) {
      const lastPoint = points[points.length - 1]
      const converted = UTMToLatLon(lastPoint.easting, lastPoint.northing, utmZone, hemisphere)
      map.flyTo([converted.lat, converted.lon], 16, { duration: 1 })
    } else if (points.length > 1 && prevPointsLength.current === 0) {
      const bounds = L.latLngBounds(
        points.map(p => {
          const converted = UTMToLatLon(p.easting, p.northing, utmZone, hemisphere)
          return [converted.lat, converted.lon] as [number, number]
        })
      )
      map.fitBounds(bounds, { padding: [50, 50] })
    }
    
    prevPointsLength.current = points.length
  }, [points, map, utmZone, hemisphere])
  
  return null
}

export default function ProjectMap({ points, utmZone, hemisphere, onMapClick, drawMode = false, onDrawUpdate }: ProjectMapProps) {
  const getDefaultCenter = (): [number, number] => {
    if (utmZone === 37 && hemisphere === 'S') {
      return [-1.2921, 36.8219]
    }
    return [0, 0]
  }

  const [center, setCenter] = useState<[number, number]>(getDefaultCenter())
  const [selectedPoints, setSelectedPoints] = useState<SurveyPoint[]>([])
  const [drawSequence, setDrawSequence] = useState<SurveyPoint[]>([])

  const markers = points.map(point => {
    let lat = point.lat
    let lon = point.lon
    
    if (!lat || !lon) {
      const converted = UTMToLatLon(point.easting, point.northing, utmZone, hemisphere)
      lat = converted.lat
      lon = converted.lon
    }
    
    return {
      ...point,
      lat,
      lon
    }
  }).filter(p => p.lat !== undefined && p.lon !== undefined)

  const handleMapClick = (lat: number, lon: number) => {
    if (onMapClick) {
      onMapClick(lat, lon)
    }
  }

  const handleMarkerClick = (point: SurveyPoint) => {
    if (drawMode) {
      setDrawSequence(prev => {
        const newSeq = [...prev, point]
        if (onDrawUpdate) {
          onDrawUpdate(newSeq)
        }
        return newSeq
      })
    } else {
      setSelectedPoints(prev => {
        if (prev.length >= 2) {
          return [prev[1], point]
        }
        return [...prev, point]
      })
    }
  }

  const clearSelection = () => {
    setSelectedPoints([])
  }

  const clearDraw = () => {
    setDrawSequence([])
    if (onDrawUpdate) {
      onDrawUpdate([])
    }
  }

  // Calculate distance/bearing between selected points
  let distanceInfo: { distance: number; bearing: string; deltaE: number; deltaN: number } | null = null
  if (selectedPoints.length === 2) {
    const result = distanceBearing(
      { easting: selectedPoints[0].easting, northing: selectedPoints[0].northing },
      { easting: selectedPoints[1].easting, northing: selectedPoints[1].northing }
    )
    distanceInfo = {
      distance: result.distance,
      bearing: bearingToString(result.bearing),
      deltaE: result.deltaE,
      deltaN: result.deltaN
    }
  }

  // Calculate draw sequence distances
  let drawDistances: number[] = []
  let totalDrawDistance = 0
  if (drawSequence.length > 1) {
    for (let i = 0; i < drawSequence.length - 1; i++) {
      const result = distanceBearing(
        { easting: drawSequence[i].easting, northing: drawSequence[i].northing },
        { easting: drawSequence[i + 1].easting, northing: drawSequence[i + 1].northing }
      )
      drawDistances.push(result.distance)
      totalDrawDistance += result.distance
    }
  }

  // Build polyline positions
  const selectedLinePositions: [number, number][] = selectedPoints.length === 2
    ? [[selectedPoints[0].lat!, selectedPoints[0].lon!], [selectedPoints[1].lat!, selectedPoints[1].lon!]]
    : []

  const drawLinePositions: [number, number][] = drawSequence
    .filter(p => p.lat !== undefined && p.lon !== undefined)
    .map(p => [p.lat!, p.lon!] as [number, number])

  return (
    <div className="relative">
      <MapContainer
        center={center}
        zoom={13}
        style={{ height: '500px', width: '100%', borderRadius: '8px' }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onClick={handleMapClick} />
        <RecenterMap center={center} />
        <FlyToPoints points={markers} utmZone={utmZone} hemisphere={hemisphere} />
        
        {/* Selection polyline */}
        {selectedLinePositions.length === 2 && (
          <Polyline positions={selectedLinePositions} color="#E8841A" weight={3} dashArray="5, 10" />
        )}
        
        {/* Draw sequence polyline */}
        {drawLinePositions.length > 1 && (
          <Polyline positions={drawLinePositions} color="#10B981" weight={3} />
        )}
        
        {markers.map((point, idx) => {
          const isSelected = selectedPoints.some(s => s.id === point.id)
          const isInDraw = drawSequence.some(d => d.id === point.id)
          
          return (
            <Marker
              key={point.id || idx}
              position={[point.lat!, point.lon!]}
              icon={isSelected ? selectedIcon : (point.is_control ? redIcon : amberIcon)}
              eventHandlers={{
                click: () => handleMarkerClick(point)
              }}
            >
              <Tooltip permanent direction="top" offset={[0, -10]} className="font-mono text-xs">
                {point.name}
              </Tooltip>
              <Popup>
                <div className="text-sm">
                  <strong className="text-gray-900">{point.name}</strong>
                  <br />
                  <span className="text-gray-600">E: {point.easting.toFixed(4)}</span>
                  <br />
                  <span className="text-gray-600">N: {point.northing.toFixed(4)}</span>
                  {point.elevation !== undefined && (
                    <>
                      <br />
                      <span className="text-gray-600">Elev: {point.elevation.toFixed(3)}</span>
                    </>
                  )}
                  {point.is_control && (
                    <span className="text-red-600 font-semibold"> (Control Point)</span>
                  )}
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>

      {/* Distance/bearing info panel */}
      {distanceInfo && (
        <div className="absolute top-4 right-4 z-[1000] bg-gray-900/95 border border-gray-700 rounded-lg p-3 shadow-lg min-w-[200px]">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-gray-100">
              {selectedPoints[0]?.name} → {selectedPoints[1]?.name}
            </span>
            <button onClick={clearSelection} className="text-gray-400 hover:text-white text-lg">×</button>
          </div>
          <div className="space-y-1 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-gray-400">Distance:</span>
              <span className="text-[#E8841A]">{distanceInfo.distance.toFixed(4)} m</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Bearing:</span>
              <span className="text-gray-100">{distanceInfo.bearing}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">ΔE:</span>
              <span className={distanceInfo.deltaE >= 0 ? 'text-green-400' : 'text-red-400'}>
                {distanceInfo.deltaE.toFixed(4)} m
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">ΔN:</span>
              <span className={distanceInfo.deltaN >= 0 ? 'text-green-400' : 'text-red-400'}>
                {distanceInfo.deltaN.toFixed(4)} m
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Draw sequence info panel */}
      {drawMode && drawSequence.length > 0 && (
        <div className="absolute top-4 left-4 z-[1000] bg-gray-900/95 border border-green-600 rounded-lg p-3 shadow-lg min-w-[200px]">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-green-400">Draw Sequence</span>
            <button onClick={clearDraw} className="text-gray-400 hover:text-white text-lg">×</button>
          </div>
          <div className="space-y-1 text-xs">
            {drawSequence.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-green-600 text-black text-xs flex items-center justify-center font-bold">{i + 1}</span>
                <span className="font-mono text-gray-100">{p.name}</span>
                {i > 0 && (
                  <span className="text-gray-500 text-xs">({drawDistances[i - 1]?.toFixed(2)}m)</span>
                )}
              </div>
            ))}
            {drawSequence.length > 1 && (
              <div className="border-t border-gray-700 mt-2 pt-2 flex justify-between">
                <span className="text-gray-400">Total:</span>
                <span className="text-green-400 font-mono font-bold">{totalDrawDistance.toFixed(4)} m</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
