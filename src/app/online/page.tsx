'use client'

import { useState } from 'react'
import { transformCoordinates, getSupportedSystems } from '@/lib/online/coordinates'
import { calculateEDMCorrection } from '@/lib/online/weather'
import { searchBenchmarks, getAvailableCountries, getBenchmarkTypes } from '@/lib/online/benchmarks'

export default function OnlineServicesPage() {
  const [activeTab, setActiveTab] = useState<'transform' | 'benchmarks' | 'weather'>('transform')
  const [transformResult, setTransformResult] = useState<any>(null)
  const [benchmarkResults, setBenchmarkResults] = useState<any[]>([])
  const [weatherResult, setWeatherResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const [transformInput, setTransformInput] = useState({
    latitude: '',
    longitude: '',
    easting: '',
    northing: '',
    zone: '',
    hemisphere: 'N' as 'N' | 'S',
    fromSystem: 'WGS84',
    toSystem: 'UTM'
  })

  const [benchmarkSearch, setBenchmarkSearch] = useState({
    country: '',
    type: 'ALL' as const
  })

  const [weatherInput, setWeatherInput] = useState({
    temperature: '25',
    pressure: '1013.25',
    humidity: '50',
    elevation: ''
  })

  const systems = getSupportedSystems()
  const countries = getAvailableCountries()
  const benchmarkTypes = getBenchmarkTypes()

  const handleTransform = async () => {
    setLoading(true)
    try {
      const result = await transformCoordinates(
        {
          latitude: transformInput.latitude ? parseFloat(transformInput.latitude) : undefined,
          longitude: transformInput.longitude ? parseFloat(transformInput.longitude) : undefined,
          easting: transformInput.easting ? parseFloat(transformInput.easting) : undefined,
          northing: transformInput.northing ? parseFloat(transformInput.northing) : undefined,
          zone: transformInput.zone ? parseInt(transformInput.zone) : undefined,
          hemisphere: transformInput.hemisphere
        },
        transformInput.fromSystem as any,
        transformInput.toSystem as any
      )
      setTransformResult(result)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const handleBenchmarkSearch = async () => {
    setLoading(true)
    try {
      const result = await searchBenchmarks(benchmarkSearch)
      setBenchmarkResults(result.benchmarks)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Online Services</h1>
        <p className="text-gray-600 mb-8">Live coordinate transformations, benchmark lookup, and atmospheric corrections</p>

        <div className="flex space-x-4 mb-6">
          {[
            { id: 'transform', label: 'Coordinate Transform' },
            { id: 'benchmarks', label: 'Benchmarks' },
            { id: 'weather', label: 'EDM Corrections' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                activeTab === tab.id
                  ? 'bg-sky-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'transform' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Coordinate Transformation</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From System</label>
                <select
                  value={transformInput.fromSystem}
                  onChange={e => setTransformInput({ ...transformInput, fromSystem: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                >
                  {systems.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>

                <div className="mt-4 space-y-3">
                  {transformInput.fromSystem === 'WGS84' ? (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                        <input
                          type="number"
                          step="any"
                          value={transformInput.latitude}
                          onChange={e => setTransformInput({ ...transformInput, latitude: e.target.value })}
                          placeholder="e.g., -1.2921"
                          className="w-full p-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                        <input
                          type="number"
                          step="any"
                          value={transformInput.longitude}
                          onChange={e => setTransformInput({ ...transformInput, longitude: e.target.value })}
                          placeholder="e.g., 36.8219"
                          className="w-full p-2 border rounded-lg"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Easting (m)</label>
                        <input
                          type="number"
                          step="any"
                          value={transformInput.easting}
                          onChange={e => setTransformInput({ ...transformInput, easting: e.target.value })}
                          placeholder="e.g., 250000"
                          className="w-full p-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Northing (m)</label>
                        <input
                          type="number"
                          step="any"
                          value={transformInput.northing}
                          onChange={e => setTransformInput({ ...transformInput, northing: e.target.value })}
                          placeholder="e.g., 9850000"
                          className="w-full p-2 border rounded-lg"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">UTM Zone</label>
                          <input
                            type="number"
                            value={transformInput.zone}
                            onChange={e => setTransformInput({ ...transformInput, zone: e.target.value })}
                            placeholder="e.g., 37"
                            className="w-full p-2 border rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Hemisphere</label>
                          <select
                            value={transformInput.hemisphere}
                            onChange={e => setTransformInput({ ...transformInput, hemisphere: e.target.value as 'N' | 'S' })}
                            className="w-full p-2 border rounded-lg"
                          >
                            <option value="N">Northern</option>
                            <option value="S">Southern</option>
                          </select>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To System</label>
                <select
                  value={transformInput.toSystem}
                  onChange={e => setTransformInput({ ...transformInput, toSystem: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                >
                  {systems.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>

                <button
                  onClick={handleTransform}
                  disabled={loading}
                  className="mt-4 w-full bg-sky-600 text-white py-2 px-4 rounded-lg hover:bg-sky-700 disabled:opacity-50"
                >
                  {loading ? 'Transforming...' : 'Transform Coordinates'}
                </button>

                {transformResult && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    {transformResult.success ? (
                      <div>
                        <h3 className="font-medium text-green-600 mb-2">Transformation Successful</h3>
                        <p className="text-sm text-gray-600">Precision: {transformResult.precision}</p>
                        {transformResult.result?.latitude && (
                          <p className="text-sm">Lat: {transformResult.result.latitude.toFixed(6)}°</p>
                        )}
                        {transformResult.result?.longitude && (
                          <p className="text-sm">Lon: {transformResult.result.longitude.toFixed(6)}°</p>
                        )}
                        {transformResult.result?.easting && (
                          <p className="text-sm">E: {transformResult.result.easting.toFixed(3)} m</p>
                        )}
                        {transformResult.result?.northing && (
                          <p className="text-sm">N: {transformResult.result.northing.toFixed(3)} m</p>
                        )}
                        {transformResult.result?.zone && (
                          <p className="text-sm">Zone: {transformResult.result.zone}{transformResult.result.hemisphere}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-red-600">{transformResult.error}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'benchmarks' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Benchmark Database Lookup</h2>
            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                <select
                  value={benchmarkSearch.country}
                  onChange={e => setBenchmarkSearch({ ...benchmarkSearch, country: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="">All Countries</option>
                  {countries.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={benchmarkSearch.type}
                  onChange={e => setBenchmarkSearch({ ...benchmarkSearch, type: e.target.value as any })}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="ALL">All Types</option>
                  {benchmarkTypes.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleBenchmarkSearch}
                  disabled={loading}
                  className="w-full bg-sky-600 text-white py-2 px-4 rounded-lg hover:bg-sky-700 disabled:opacity-50"
                >
                  {loading ? 'Searching...' : 'Search Benchmarks'}
                </button>
              </div>
            </div>

            {benchmarkResults.length > 0 && (
              <div className="space-y-3">
                {benchmarkResults.map(bm => (
                  <div key={bm.id} className="p-4 border rounded-lg hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium">{bm.name}</h3>
                        <p className="text-sm text-gray-600">{bm.region}, {bm.country}</p>
                        <p className="text-sm">Type: {bm.type} | Datum: {bm.datum}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{bm.elevation.toFixed(3)} m</p>
                        <p className="text-xs text-gray-500">RL</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'weather' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">EDM Atmospheric Correction</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Temperature (°C)</label>
                  <input
                    type="number"
                    step="any"
                    value={weatherInput.temperature}
                    onChange={e => setWeatherInput({ ...weatherInput, temperature: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pressure (hPa)</label>
                  <input
                    type="number"
                    step="any"
                    value={weatherInput.pressure}
                    onChange={e => setWeatherInput({ ...weatherInput, pressure: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Humidity (%)</label>
                  <input
                    type="number"
                    step="any"
                    value={weatherInput.humidity}
                    onChange={e => setWeatherInput({ ...weatherInput, humidity: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Elevation (m) - Optional</label>
                  <input
                    type="number"
                    step="any"
                    value={weatherInput.elevation}
                    onChange={e => setWeatherInput({ ...weatherInput, elevation: e.target.value })}
                    placeholder="e.g., 1500"
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
                          <li key={i}>• {rec}</li>
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
