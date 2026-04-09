'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Navigation, Map, Activity, Plus, Ship, Save } from 'lucide-react'

const MissionPlanner = dynamic(() => import('@/components/usv/MissionPlanner'), { ssr: false })
const TelemetryDashboard = dynamic(() => import('@/components/usv/TelemetryDashboard'), { ssr: false })

import type { Waypoint, USVTelemetry, CreateMissionRequest } from '@/types/usv'

const PATTERNS = [
  { value: 'waypoint', label: 'Waypoint', icon: Navigation },
  { value: 'parallel', label: 'Parallel', icon: Map },
  { value: 'radial', label: 'Radial', icon: Activity },
  { value: 'circular', label: 'Circular', icon: Ship },
]

const DEMO_WAYPOINTS: Waypoint[] = [
  { id: 'wp1', lat: -33.8688, lng: 151.2093, order: 0, action: 'start' },
  { id: 'wp2', lat: -33.8695, lng: 151.2100, order: 1, action: 'waypoint' },
  { id: 'wp3', lat: -33.8702, lng: 151.2107, order: 2, action: 'waypoint' },
  { id: 'wp4', lat: -33.8709, lng: 151.2114, order: 3, action: 'waypoint' },
  { id: 'wp5', lat: -33.8716, lng: 151.2121, order: 4, action: 'end' },
]

const DEMO_TELEMETRY: USVTelemetry[] = [
  { id: 't1', mission_id: 'm1', usv_id: 'usv-001', position: { lat: -33.8688, lng: 151.2093 }, heading: 45, speed: 2.5, battery_percent: 85, signal_strength: -65, recorded_at: '2024-01-15T10:00:00Z' },
  { id: 't2', mission_id: 'm1', usv_id: 'usv-001', position: { lat: -33.8692, lng: 151.2098 }, heading: 48, speed: 2.8, battery_percent: 84, signal_strength: -63, recorded_at: '2024-01-15T10:01:00Z' },
  { id: 't3', mission_id: 'm1', usv_id: 'usv-001', position: { lat: -33.8696, lng: 151.2103 }, heading: 52, speed: 2.6, battery_percent: 83, signal_strength: -66, recorded_at: '2024-01-15T10:02:00Z' },
  { id: 't4', mission_id: 'm1', usv_id: 'usv-001', position: { lat: -33.8700, lng: 151.2108 }, heading: 55, speed: 2.9, battery_percent: 82, signal_strength: -64, recorded_at: '2024-01-15T10:03:00Z' },
  { id: 't5', mission_id: 'm1', usv_id: 'usv-001', position: { lat: -33.8704, lng: 151.2113 }, heading: 58, speed: 2.7, battery_percent: 81, signal_strength: -67, recorded_at: '2024-01-15T10:04:00Z' },
]

export default function USVFleetOrchestratorPage() {
  const [pattern, setPattern] = useState('waypoint')
  const [waypoints, setWaypoints] = useState<Waypoint[]>(DEMO_WAYPOINTS)
  const [telemetry] = useState<USVTelemetry[]>(DEMO_TELEMETRY)
  const [activeTab, setActiveTab] = useState<'planner' | 'fleet' | 'telemetry'>('planner')

  const handleSaveMission = (updatedWaypoints: Waypoint[]) => {
    setWaypoints(updatedWaypoints)
    console.log('Mission saved:', updatedWaypoints)
  }

  const handleCreateMission = () => {
    const mission: CreateMissionRequest = {
      project_id: 'default',
      mission_name: 'New Mission',
      usv_ids: ['usv-001'],
      waypoints,
      pattern_type: pattern,
    }
    console.log('Create mission:', mission)
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">USV Fleet Orchestrator</h1>
              <p className="text-sm text-[var(--text-muted)]">Plan and monitor autonomous surface vehicle missions</p>
            </div>
            <button
              onClick={handleCreateMission}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-black font-semibold rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create Mission
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-4">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                <Navigation className="h-4 w-4" />
                Survey Pattern
              </h3>
              <div className="space-y-2">
                {PATTERNS.map((p) => {
                  const Icon = p.icon
                  return (
                    <button
                      key={p.value}
                      onClick={() => setPattern(p.value)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        pattern === p.value
                          ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30'
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border-hover)] border border-transparent'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-4">
              <h3 className="font-semibold text-sm mb-3">Mission Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Waypoints</span>
                  <span className="text-[var(--text-primary)] font-medium">{waypoints.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Pattern</span>
                  <span className="text-[var(--text-primary)] font-medium capitalize">{pattern}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">USV Count</span>
                  <span className="text-[var(--text-primary)] font-medium">1</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleCreateMission}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              <Save className="h-4 w-4" />
              Save Mission
            </button>
          </div>

          <div className="lg:col-span-3">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg overflow-hidden">
              <div className="flex border-b border-[var(--border-color)]">
                <button
                  onClick={() => setActiveTab('planner')}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'planner'
                      ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Navigation className="h-4 w-4" />
                  Mission Planner
                </button>
                <button
                  onClick={() => setActiveTab('fleet')}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'fleet'
                      ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Map className="h-4 w-4" />
                  Fleet Map
                </button>
                <button
                  onClick={() => setActiveTab('telemetry')}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'telemetry'
                      ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Activity className="h-4 w-4" />
                  Telemetry
                </button>
              </div>

              <div className="p-4">
                {activeTab === 'planner' && (
                  <MissionPlanner
                    waypoints={waypoints}
                    onChange={setWaypoints}
                    onSave={handleSaveMission}
                  />
                )}
                {activeTab === 'fleet' && (
                  <div className="p-8 text-center bg-gray-50 rounded-lg border border-gray-200 h-[500px] flex items-center justify-center">
                    <div>
                      <p className="text-gray-600 mb-2">
                        USV Fleet tracking uses real-time telemetry.
                      </p>
                      <p className="text-sm text-gray-500">
                        This feature integrates with hardware APIs for live vessel tracking.
                      </p>
                    </div>
                  </div>
                )}
                {activeTab === 'telemetry' && (
                  <TelemetryDashboard data={telemetry} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
