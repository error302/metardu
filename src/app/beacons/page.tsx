'use client'
import React from 'react'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { utmToGeographic } from '@/lib/engine/coordinates'
import Link from 'next/link'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import OSM from 'ol/source/OSM'
import { Style, Circle as CircleStyle, Fill, Stroke, Text } from 'ol/style'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import { fromLonLat } from 'ol/proj'
import Overlay from 'ol/Overlay'
import 'ol/ol.css'

interface Beacon {
  id: string
  name: string
  easting: number
  northing: number
  elevation?: number
  utm_zone: number
  hemisphere: string
  authority?: string
  beacon_type: string
  description?: string
}

interface Project {
  id: string
  name: string
  location?: string
  survey_type?: string
  created_at: string
}

function getMarkerIcon(type: string) {
  const icons: Record<string, string> = {
    trig: '▲',
    control: '●',
    boundary: '■',
    benchmark: '◆',
    gnss: '★',
    other: '●'
  }
  return icons[type] || '●'
}

function getMarkerColor(type: string) {
  const colors: Record<string, string> = {
    trig: '#ef4444',
    control: '#f97316',
    boundary: '#eab308',
    benchmark: '#22c55e',
    gnss: '#3b82f6',
    other: '#6b7280'
  }
  return colors[type] || '#6b7280'
}

function getProjectIcon(type: string) {
  const icons: Record<string, string> = {
    boundary: '📐',
    topographic: '🗺',
    road: '🛣',
    construction: '🏗',
    control: '📍',
    leveling: '📏',
    other: '📌'
  }
  return icons[type || 'other'] || '📌'
}

export default function BeaconsPage() {
  const [importMsg, setImportMsg] = React.useState<{text:string;ok:boolean}|null>(null)
  const [view, setView] = useState<'beacons' | 'activity'>('beacons')
  const [beacons, setBeacons] = useState<Beacon[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [importProject, setImportProject] = useState('')
  const [importBeacon, setImportBeacon] = useState<Beacon | null>(null)
  const [importLoading, setImportLoading] = useState(false)

  const mapRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<Map | null>(null)
  const overlayRef = useRef<Overlay | null>(null)

  const supabase = createClient()

  const fetchData = useCallback(async () => {
    setLoading(true)
    
    const [beaconsRes, projectsRes] = await Promise.all([
      supabase.from('public_beacons').select('*').eq('status', 'verified'),
      supabase.from('projects').select('id, name, location, survey_type, created_at')
    ])

    if (beaconsRes.data) setBeacons(beaconsRes.data)
    if (projectsRes.data) setProjects(projectsRes.data)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Initialize map once
  useEffect(() => {
    if (!mapRef.current) return

    const map = new Map({
      target: mapRef.current,
      layers: [new TileLayer({ source: new OSM() })],
      view: new View({
        center: fromLonLat([36.8219, -1.2921]),
        zoom: 6,
      }),
    })

    if (popupRef.current) {
      const overlay = new Overlay({
        element: popupRef.current,
        autoPan: { animation: { duration: 250 } },
      })
      map.addOverlay(overlay)
      overlayRef.current = overlay
    }

    mapInstance.current = map

    // Click handler for popup
    map.on('click', (evt) => {
      const overlay = overlayRef.current
      if (!overlay || !popupRef.current) return

      const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f)
      if (feature && feature.get('popupHtml')) {
        popupRef.current.innerHTML = feature.get('popupHtml')
        overlay.setPosition(evt.coordinate)
      } else {
        overlay.setPosition(undefined)
      }
    })

    return () => {
      map.setTarget(undefined)
      overlayRef.current = null
    }
  }, [])

  // Update map features when data changes
  useEffect(() => {
    const map = mapInstance.current
    if (!map || loading) return

    const vectorSource = new VectorSource()

    if (view === 'beacons') {
      const filteredBeacons = beacons.filter((b: any) => {
        if (filter !== 'all' && b.beacon_type !== filter) return false
        if (search && !b.name.toLowerCase().includes(search.toLowerCase()) &&
            !b.authority?.toLowerCase().includes(search.toLowerCase())) return false
        return true
      })

      filteredBeacons.forEach((beacon) => {
        const coords = utmToGeographic(beacon.easting, beacon.northing, beacon.utm_zone, beacon.hemisphere as 'N' | 'S')
        const color = getMarkerColor(beacon.beacon_type)
        const icon = getMarkerIcon(beacon.beacon_type)

        const feature = new Feature({
          geometry: new Point(fromLonLat([coords.lon, coords.lat])),
        })
        feature.setStyle(new Style({
          image: new CircleStyle({
            radius: 8,
            fill: new Fill({ color }),
            stroke: new Stroke({ color: '#fff', width: 2 }),
          }),
          text: new Text({ text: icon, font: '12px sans-serif', fill: new Fill({ color: '#fff' }) }),
        }))
        feature.set('popupHtml',
          `<div class="text-sm min-w-[200px]" style="color:var(--text-primary)">` +
          `<div style="font-weight:bold;font-size:1.1rem;color:${color}">${icon} ${beacon.name}</div>` +
          (beacon.authority ? `<div style="color:var(--text-muted);margin-top:4px">Authority: ${beacon.authority}</div>` : '') +
          `<div style="color:var(--text-muted);text-transform:capitalize">Type: ${beacon.beacon_type}</div>` +
          `<div style="font-family:monospace;margin-top:8px">E: ${beacon.easting.toFixed(4)}<br/>N: ${beacon.northing.toFixed(4)}</div>` +
          (beacon.elevation ? `<div style="color:var(--text-muted)">Elev: ${beacon.elevation.toFixed(3)} m</div>` : '') +
          `<div style="color:var(--text-muted);font-size:0.75rem;margin-top:4px">UTM Zone ${beacon.utm_zone}${beacon.hemisphere}</div>` +
          `</div>`
        )
        feature.set('beaconId', beacon.id)
        vectorSource.addFeature(feature)
      })

      // Pan to Kenya/East Africa if beacons exist
      if (filteredBeacons.length > 0) {
        const extent = vectorSource.getExtent()
        map.getView().fit(extent, { padding: [50, 50, 50, 50], maxZoom: 10 })
      }
    } else if (view === 'activity') {
      const surveyProjects = projects.filter((p) => p.survey_type)
      surveyProjects.forEach((project) => {
        const lat = -1.5 + Math.random() * 10
        const lon = 30 + Math.random() * 15
        const icon = getProjectIcon(project.survey_type || 'other')

        const feature = new Feature({
          geometry: new Point(fromLonLat([lon, lat])),
        })
        feature.setStyle(new Style({
          image: new CircleStyle({
            radius: 8,
            fill: new Fill({ color: '#3b82f6' }),
            stroke: new Stroke({ color: '#fff', width: 2 }),
          }),
          text: new Text({ text: icon, font: '12px sans-serif' }),
        }))
        feature.set('popupHtml',
          `<div class="text-sm" style="color:var(--text-primary)">` +
          `<div style="font-weight:bold;font-size:1.1rem">${icon} ${project.survey_type}</div>` +
          `<div style="color:var(--text-muted)">Active Survey</div>` +
          (project.location ? `<div style="color:var(--text-muted);margin-top:4px">Area: ${project.location}</div>` : '') +
          `</div>`
        )
        vectorSource.addFeature(feature)
      })
    }

    // Remove old vector layers, add new one
    const existing = map.getLayers().getArray().find((l) => l instanceof VectorLayer)
    if (existing) map.removeLayer(existing)
    map.addLayer(new VectorLayer({ source: vectorSource }))

    // Reset view if switching views
    if (view === 'beacons') {
      map.getView().setCenter(fromLonLat([36.8219, -1.2921]))
      map.getView().setZoom(6)
    }
  }, [view, beacons, projects, filter, search, loading])

  const handleImport = async () => {
    if (!importBeacon || !importProject) return
    
    setImportLoading(true)
    
    try {
      const { error } = await supabase.from('survey_points').insert({
        project_id: importProject,
        name: importBeacon.name,
        easting: importBeacon.easting,
        northing: importBeacon.northing,
        elevation: importBeacon.elevation,
        is_control: true,
        control_order: 'primary',
        locked: true
      })

      if (error) throw error
      
      setImportMsg({text:'Beacon imported successfully!', ok:true}); setTimeout(()=>setImportMsg(null),3000)
      setImportBeacon(null)
      setImportProject('')
    } catch (err: any) {
      setImportMsg({text:'Error: '+err.message, ok:false}); setTimeout(()=>setImportMsg(null),4000)
    }
    
    setImportLoading(false)
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col">
      <header className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] px-4 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">Community Beacons</h1>
              <p className="text-sm text-[var(--text-secondary)]">East Africa Control Network</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setView('beacons')}
                className={`px-4 py-2 rounded-lg font-medium ${
                  view === 'beacons' ? 'bg-[var(--accent)] text-black' : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                }`}
              >
                Beacons
              </button>
              <button
                onClick={() => setView('activity')}
                className={`px-4 py-2 rounded-lg font-medium ${
                  view === 'activity' ? 'bg-[var(--accent)] text-black' : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                }`}
              >
                Survey Activity
              </button>
            </div>
          </div>

          {view === 'beacons' && (
            <div className="flex gap-4 items-center">
              <input
                type="text"
                placeholder="Search by name or authority..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 px-4 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)]"
              />
              <div className="flex gap-2">
                {['all', 'trig', 'control', 'boundary', 'benchmark'].map((f: any) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-2 rounded text-sm capitalize ${
                      filter === f ? 'bg-[var(--accent)] text-black' : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <Link
                href="/beacons/submit"
                className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-black font-semibold rounded-lg"
              >
                + Submit Beacon
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 relative">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <div className="h-full" style={{ height: 'calc(100vh - 140px)' }}>
            <div ref={mapRef} className="w-full h-full" />
            <div ref={popupRef} className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded p-2 text-sm shadow-lg" style={{ display: 'none' }}></div>
          </div>
        )}
      </main>

      {/* Import Modal */}
      {importBeacon && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">Import Beacon</h3>
            <p className="text-[var(--text-primary)] mb-4">
              Import {importBeacon.name} as a locked Primary control point?
            </p>
            
            <div className="mb-4">
              <label className="block text-sm text-[var(--text-secondary)] mb-2">Select Project</label>
              <select
                value={importProject}
                onChange={e => setImportProject(e.target.value)}
                className="w-full px-4 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)]"
              >
                <option value="">Choose project...</option>
                {projects.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setImportBeacon(null)}
                className="flex-1 px-4 py-2 bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!importProject || importLoading}
                className="flex-1 px-4 py-2 bg-[var(--accent)] text-black font-semibold rounded disabled:opacity-50"
              >
                {importLoading ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
