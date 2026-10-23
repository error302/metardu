'use client';

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { logger } from '@/lib/logger'
import OnlineCoordinateTransform from '@/components/online/OnlineCoordinateTransform'
import { calculateEDMCorrection } from '@/lib/online/weather'
import ReviewedBenchmarkSearch from '@/components/beacons/ReviewedBenchmarkSearch'
import GNSSProcessor from '@/components/online/GNSSProcessor'
const ImageryViewer = dynamic(() => import('@/components/online/ImageryViewer'), { ssr: false })

export default function OnlineServicesPage() {
  const [activeTab, setActiveTab] = useState<'gnss' | 'transform' | 'edm' | 'benchmarks' | 'imagery'>('gnss')
  const [weatherResult, setWeatherResult] = useState<ReturnType<typeof calculateEDMCorrection> | null>(null)
  const [onlineStatus, setOnlineStatus] = useState<'online' | 'offline'>('online')

  useEffect(() => {
    const handleOnline = () => setOnlineStatus('online')
    const handleOffline = () => setOnlineStatus('offline')
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    setOnlineStatus(navigator.onLine ? 'online' : 'offline')
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const [weatherInput, setWeatherInput] = useState({
    temperature: '25',
    pressure: '1013.25',
    humidity: '50',
    elevation: ''
  })

  const handleWeatherCalc = () => {
    const result = calculateEDMCorrection({
      temperature: parseFloat(weatherInput.temperature),
      pressure: parseFloat(weatherInput.pressure),
      humidity: parseFloat(weatherInput.humidity),
      elevation: weatherInput.elevation ? parseFloat(weatherInput.elevation) : undefined
    })
    setWeatherResult(result)
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-start mb-2">
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">Online Services</h1>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            onlineStatus === 'online' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            <span className={`w-2 h-2 rounded-full ${onlineStatus === 'online' ? 'bg-green-500' : 'bg-red-500'}`}></span>
            {onlineStatus === 'online' ? 'Connected' : 'Offline'}
          </div>
        </div>
        <p className="text-[var(--text-muted)] mb-8">Transform coordinates, find reviewed control references, process GNSS data and view imagery.</p>

        <div className="flex flex-wrap gap-2 mb-6">
          {[
            { id: 'gnss', label: 'GNSS Baseline' },
            { id: 'transform', label: 'Coordinate Transform' },
            { id: 'edm', label: 'EDM Corrections' },
            { id: 'benchmarks', label: 'Benchmarks' },
            { id: 'imagery', label: 'Satellite Imagery' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'gnss' | 'transform' | 'edm' | 'benchmarks' | 'imagery')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                activeTab === tab.id
                  ? 'bg-sky-600 text-white'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'gnss' && (
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-6">
            <h2 className="text-xl font-semibold mb-4">GNSS Baseline Processing</h2>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              Process GNSS baseline observations for high-precision control network adjustments
            </p>
            <GNSSProcessor />
          </div>
        )}

        {activeTab === 'imagery' && (
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-6">
            <h2 className="text-xl font-semibold mb-4">Imagery for survey planning</h2>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              Compare dated regional NASA imagery or an identified Esri basemap for survey planning.
            </p>
            <ImageryViewer />
          </div>
        )}

        {activeTab === 'transform' && <OnlineCoordinateTransform />}

        {activeTab === 'benchmarks' && <ReviewedBenchmarkSearch />}

        {activeTab === 'edm' && (
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">EDM Atmospheric Correction</h2>
              <button
                onClick={async () => {
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(async (pos) => {
                      const { latitude, longitude } = pos.coords
                      try {
                        const res = await fetch(`/api/weather?lat=${latitude}&lon=${longitude}`)
                        const data = (await res.json()) as { temperature?: number; pressure?: number; humidity?: number; elevation?: number }
                        if (data.temperature !== undefined) {
                          setWeatherInput({
                            ...weatherInput,
                            temperature: data.temperature.toString(),
                            pressure: data.pressure?.toString() || '1013.25',
                            humidity: data.humidity?.toString() || '50',
                            elevation: data.elevation?.toString() || ''
                          })
                        }
                      } catch (e) {
                        logger.error('Failed to fetch weather:', { error: e })
                      }
                    })
                  }
                }}
                className="text-sm px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                [Pin] Get Live Weather
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label htmlFor="weather-temperature" className="block text-sm font-medium text-[var(--text-muted)] mb-1">Temperature (°C)</label>
                  <input id="weather-temperature"
                    type="number"
                    step="any"
                    value={weatherInput.temperature}
                    onChange={e => setWeatherInput({ ...weatherInput, temperature: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="weather-pressure" className="block text-sm font-medium text-[var(--text-muted)] mb-1">Pressure (hPa)</label>
                  <input id="weather-pressure"
                    type="number"
                    step="any"
                    value={weatherInput.pressure}
                    onChange={e => setWeatherInput({ ...weatherInput, pressure: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="weather-humidity" className="block text-sm font-medium text-[var(--text-muted)] mb-1">Humidity (%)</label>
                  <input id="weather-humidity"
                    type="number"
                    step="any"
                    value={weatherInput.humidity}
                    onChange={e => setWeatherInput({ ...weatherInput, humidity: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="weather-elevation" className="block text-sm font-medium text-[var(--text-muted)] mb-1">Elevation (m) - Optional</label>
                  <input
                    id="weather-elevation"
                    type="number"
                    step="any"
                    value={weatherInput.elevation}
                    onChange={e => setWeatherInput({ ...weatherInput, elevation: e.target.value })}
                    aria-label="Elevation (m)" placeholder="e.g., 1500"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <button
                  onClick={handleWeatherCalc}
                  className="w-full bg-sky-600 text-white py-2 px-4 rounded-lg hover:bg-sky-700"
                >
                  Calculate Correction
                </button>
              </div>

              {weatherResult && (
                <div className="space-y-4">
                  <div className="p-4 bg-sky-50 rounded-lg">
                    <h3 className="font-semibold text-sky-800">Atmospheric Correction</h3>
                    <p className="text-3xl font-bold text-sky-600 mt-2">{weatherResult.edmCorrection.ppm} ppm</p>
                    <p className="text-sm text-sky-700 mt-1">{weatherResult.edmCorrection.description}</p>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">Conditions</h4>
                    <p className="text-sm">Atmosphere: <span className="capitalize">{weatherResult.atmosphericCondition}</span></p>
                    <p className="text-sm">Temp: {weatherResult.temperature}°C</p>
                    <p className="text-sm">Pressure: {weatherResult.pressure} hPa</p>
                    <p className="text-sm">Humidity: {weatherResult.humidity}%</p>
                  </div>

                  {weatherResult.recommendations.length > 0 && (
                    <div className="p-4 bg-yellow-50 rounded-lg">
                      <h4 className="font-medium text-yellow-800 mb-2">Recommendations</h4>
                      <ul className="text-sm text-yellow-700 space-y-1">
                        {weatherResult.recommendations.map((rec: string, i: number) => (
                          <li key={`item-${i}`}>• {rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
