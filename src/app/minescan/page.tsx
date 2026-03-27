// src/app/minescan/page.tsx

'use client'

import { useState } from 'react'
import { AlertTriangle, Activity, Camera, Shield, TrendingDown, Clock, MapPin } from 'lucide-react'

interface Incident {
  id: string
  type: string
  location: string
  time: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'resolved' | 'investigating' | 'pending'
}

const mockIncidents: Incident[] = [
  { id: '1', type: 'Gas Leak Detected', location: 'Sector A-12', time: '2 hours ago', severity: 'critical', status: 'investigating' },
  { id: '2', type: 'Equipment Failure', location: 'Sector B-3', time: '5 hours ago', severity: 'high', status: 'resolved' },
  { id: '3', type: 'Unauthorized Entry', location: 'Sector C-7', time: '8 hours ago', severity: 'medium', status: 'pending' },
  { id: '4', type: 'Temperature Anomaly', location: 'Sector A-8', time: '12 hours ago', severity: 'low', status: 'resolved' },
]

const mockStats = {
  totalIncidents: 156,
  activeAlerts: 12,
  resolvedToday: 8,
  avgResponseTime: '4.2 min',
  riskScore: 72,
  camerasOnline: 24,
}

const riskZones = [
  { id: 'A-12', name: 'Deep Shaft Area', riskLevel: 'high', score: 85 },
  { id: 'B-3', name: 'Processing Plant', riskLevel: 'medium', score: 62 },
  { id: 'C-7', name: 'Storage Facility', riskLevel: 'low', score: 35 },
]

export default function MineScanPage() {
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null)

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50 dark:bg-red-900/20'
      case 'high': return 'text-orange-600 bg-orange-50 dark:bg-orange-900/20'
      case 'medium': return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20'
      case 'low': return 'text-green-600 bg-green-50 dark:bg-green-900/20'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved': return 'text-green-600'
      case 'investigating': return 'text-blue-600'
      case 'pending': return 'text-yellow-600'
      default: return 'text-gray-600'
    }
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center gap-3 mb-8">
        <Shield className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold">MineScan Safety AI</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Incidents</p>
              <p className="text-2xl font-bold">{mockStats.totalIncidents}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
          <p className="text-xs text-gray-500 mt-2">This month</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Active Alerts</p>
              <p className="text-2xl font-bold">{mockStats.activeAlerts}</p>
            </div>
            <Activity className="h-8 w-8 text-orange-500" />
          </div>
          <p className="text-xs text-green-600 mt-2">↓ 3 from yesterday</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Risk Score</p>
              <p className="text-2xl font-bold">{mockStats.riskScore}</p>
            </div>
            <TrendingDown className="h-8 w-8 text-green-500" />
          </div>
          <p className="text-xs text-green-600 mt-2">↓ 5 points improvement</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Response Time</p>
              <p className="text-2xl font-bold">{mockStats.avgResponseTime}</p>
            </div>
            <Clock className="h-8 w-8 text-blue-500" />
          </div>
          <p className="text-xs text-green-600 mt-2">↓ 0.8 min faster</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Recent Incidents
          </h2>
          <div className="space-y-3">
            {mockIncidents.map((incident) => (
              <div
                key={incident.id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(incident.severity)}`}>
                      {incident.severity}
                    </span>
                    <span className="font-medium">{incident.type}</span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {incident.location}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {incident.time}
                    </span>
                  </div>
                </div>
                <span className={`text-sm font-medium ${getStatusColor(incident.status)}`}>
                  {incident.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Risk Analyzer
          </h2>
          <div className="space-y-4">
            {riskZones.map((zone) => (
              <div key={zone.id} className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{zone.name}</span>
                    <span className="text-sm text-gray-500">({zone.id})</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    zone.riskLevel === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                    zone.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  }`}>
                    {zone.riskLevel}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      zone.score > 70 ? 'bg-red-500' : zone.score > 40 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${zone.score}%` }}
                  />
                </div>
                <p className="text-sm text-gray-500 mt-1">Risk Score: {zone.score}/100</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Camera Feed Viewer
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((cam) => (
            <div
              key={cam}
              onClick={() => setSelectedCamera(`Camera ${cam}`)}
              className={`aspect-video rounded-lg bg-gray-900 flex items-center justify-center cursor-pointer transition-all hover:ring-2 hover:ring-blue-500 ${
                selectedCamera === `Camera ${cam}` ? 'ring-2 ring-blue-500' : ''
              }`}
            >
              <div className="text-center">
                <Camera className="h-12 w-12 text-gray-600 mx-auto mb-2" />
                <p className="text-gray-400">Camera {cam}</p>
                <p className="text-xs text-gray-500">Online</p>
              </div>
            </div>
          ))}
        </div>
        {selectedCamera && (
          <p className="mt-4 text-sm text-gray-500">
            Viewing: <span className="font-medium text-blue-600">{selectedCamera}</span>
          </p>
        )}
      </div>
    </div>
  )
}
