'use client'

import React, { useState, useMemo, useCallback } from 'react'
import {
  NETWORKS,
  findNearestCORSStation,
  NearestCORSResult,
} from '@/lib/gnss/multiCorsNetwork'
import {
  RadioTower,
  MapPin,
  Download,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  Server,
  Zap,
} from 'lucide-react'

// Preset benchmark survey centers across East Africa
const REGIONAL_PRESETS = [
  { name: 'Nairobi (City Center / Survey of Kenya HQ)', lat: -1.2864, lon: 36.8172 },
  { name: 'Mombasa (Coastal Regional Office)', lat: -4.0547, lon: 39.6636 },
  { name: 'Kisumu (Lake Basin Survey Office)', lat: -0.0917, lon: 34.7680 },
  { name: 'Nakuru (Rift Valley Provincial)', lat: -0.3031, lon: 36.0800 },
  { name: 'Eldoret (Uasin Gishu Land Office)', lat: 0.5143, lon: 35.2698 },
  { name: 'Nyeri (Mount Kenya Central)', lat: -0.4167, lon: 36.9500 },
  { name: 'Nanyuki (Equator Baseline)', lat: 0.0167, lon: 37.0722 },
  { name: 'Machakos (Eastern Land Registry)', lat: -1.5167, lon: 37.2667 },
  { name: 'Garissa (North Eastern Base)', lat: -0.4536, lon: 39.6461 },
  { name: 'Lodwar (Turkana Basin Base)', lat: 3.1167, lon: 35.6000 },
  { name: 'Voi (Taita Taveta Transit)', lat: -3.3833, lon: 38.5667 },
  { name: 'Dar es Salaam (Tanzania Center)', lat: -6.7924, lon: 39.2083 },
  { name: 'Kampala (Uganda Survey Ministry)', lat: 0.3476, lon: 32.5825 },
]

export default function MultiCORSSelector() {
  // Rover Coordinates
  const [roverLat, setRoverLat] = useState<number>(-1.2864)
  const [roverLon, setRoverLon] = useState<number>(36.8172)
  const [selectedPreset, setSelectedPreset] = useState<string>(REGIONAL_PRESETS[0].name)
  const [selectedNetwork, setSelectedNetwork] = useState<string>('all')
  const [loadingLocation, setLoadingLocation] = useState(false)
  const [locationMsg, setLocationMsg] = useState<string>('')

  // NTRIP credentials
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [selectedStationId, setSelectedStationId] = useState<string>('NRBI')

  // Copy feedback
  const [copiedProfile, setCopiedProfile] = useState<string | null>(null)

  // Auto-detect browser geolocation
  const handleAutoDetect = useCallback(() => {
    setLoadingLocation(true)
    setLocationMsg('')
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = parseFloat(position.coords.latitude.toFixed(6))
          const lon = parseFloat(position.coords.longitude.toFixed(6))
          setRoverLat(lat)
          setRoverLon(lon)
          setSelectedPreset('Custom GPS Position')
          setLocationMsg(`Auto-detected: ${lat}°, ${lon}° (accuracy ±${Math.round(position.coords.accuracy)}m)`)
          setLoadingLocation(false)
        },
        (error) => {
          setLocationMsg(`Geolocation failed: ${error.message}. Please select a preset or type coordinates.`)
          setLoadingLocation(false)
        },
        { timeout: 10000, enableHighAccuracy: true }
      )
    } else {
      setLocationMsg('Geolocation is not supported by your browser')
      setLoadingLocation(false)
    }
  }, [])

  // Handle preset dropdown change
  const handlePresetSelect = (presetName: string) => {
    setSelectedPreset(presetName)
    const found = REGIONAL_PRESETS.find(p => p.name === presetName)
    if (found) {
      setRoverLat(found.lat)
      setRoverLon(found.lon)
      setLocationMsg('')
    }
  }

  // Compute nearest stations sorted by baseline distance
  const nearestStations = useMemo(() => {
    return findNearestCORSStation(roverLat, roverLon, selectedNetwork === 'all' ? undefined : selectedNetwork)
  }, [roverLat, roverLon, selectedNetwork])

  // Active chosen station
  const activeStation = useMemo(() => {
    const found = nearestStations.find(r => r.station.id === selectedStationId)
    return found || nearestStations[0]
  }, [nearestStations, selectedStationId])

  // Network info for active station
  const activeNetwork = useMemo(() => {
    if (!activeStation) return null
    return NETWORKS.find(n => n.id === activeStation.station.networkId)
  }, [activeStation])

  // ISO 17123-8 Precision Calculation
  // Standard dual-frequency RTK baseline: H = ±(8mm + 1ppm), V = ±(15mm + 1ppm)
  const accuracyMetrics = useMemo(() => {
    if (!activeStation) return { horizontalMm: 8, verticalMm: 15, ttffSec: '5-10s' }
    const distKm = activeStation.distanceKm
    const ppmFactor = distKm * 1.0 // 1 ppm = 1 mm per km
    const horizontalMm = Math.round((8 + ppmFactor) * 10) / 10
    const verticalMm = Math.round((15 + ppmFactor) * 10) / 10

    let ttffSec = '5–10s'
    if (distKm > 50) ttffSec = '45–90s (Long Baseline)'
    else if (distKm > 35) ttffSec = '20–40s'
    else if (distKm > 20) ttffSec = '10–20s'

    return { horizontalMm, verticalMm, ttffSec }
  }, [activeStation])

  const getStatusBadge = (status: NearestCORSResult['baselineStatus']) => {
    switch (status) {
      case 'OPTIMAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" /> Optimal (&lt;20km)
          </span>
        )
      case 'ACCEPTABLE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Check className="w-3.5 h-3.5" /> Acceptable (20–35km)
          </span>
        )
      case 'DEGRADED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-500/15 text-orange-400 border border-orange-500/30">
            <AlertTriangle className="w-3.5 h-3.5" /> Degraded (35–50km)
          </span>
        )
      case 'WARNING_LONG_BASELINE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
            <AlertTriangle className="w-3.5 h-3.5" /> Long Baseline (&gt;50km)
          </span>
        )
    }
  }

  // Profile Generators
  const generateLeicaXml = () => {
    if (!activeStation || !activeNetwork) return ''
    return `<?xml version="1.0" encoding="UTF-8"?>
<LeicaProfile version="3.0">
  <NtripCaster>
    <ServerName>${activeNetwork.name} - ${activeStation.station.name}</ServerName>
    <IPAddress>${activeNetwork.address}</IPAddress>
    <Port>${activeNetwork.port}</Port>
    <Mountpoint>${activeStation.station.mountpoint}</Mountpoint>
    <Format>${activeStation.station.format}</Format>
    <Username>${username || 'anonymous'}</Username>
    <Password>${password || 'none'}</Password>
    <Constellations>${activeStation.station.constellations.join(',')}</Constellations>
  </NtripCaster>
</LeicaProfile>`
  }

  const generateTrimbleXml = () => {
    if (!activeStation || !activeNetwork) return ''
    return `<?xml version="1.0" encoding="utf-8"?>
<TrimbleSurveyNetwork version="1.0">
  <CorrectionSource type="NTRIP">
    <Name>${activeStation.station.id} (${activeNetwork.name})</Name>
    <Host>${activeNetwork.address}</Host>
    <Port>${activeNetwork.port}</Port>
    <Mountpoint>${activeStation.station.mountpoint}</Mountpoint>
    <Protocol>RTCM3</Protocol>
    <Username>${username || 'anonymous'}</Username>
    <Password>${password || 'none'}</Password>
  </CorrectionSource>
</TrimbleSurveyNetwork>`
  }

  const generateSurvCeIni = () => {
    if (!activeStation || !activeNetwork) return ''
    return `[NTRIP_PROFILE]
Name=${activeStation.station.id}_${activeNetwork.id}
IP=${activeNetwork.address}
Port=${activeNetwork.port}
Mountpoint=${activeStation.station.mountpoint}
User=${username || 'anonymous'}
Password=${password || 'none'}
Format=${activeStation.station.format}
SendNMEA=1
`
  }

  const rawCasterString = activeStation && activeNetwork
    ? `ntrip://${username || 'anonymous'}:${password || 'none'}@${activeNetwork.address}:${activeNetwork.port}/${activeStation.station.mountpoint}`
    : ''

  const handleDownloadProfile = (format: 'leica' | 'trimble' | 'survce') => {
    let content = ''
    let filename = ''
    let type = 'text/plain'

    if (format === 'leica') {
      content = generateLeicaXml()
      filename = `${activeStation.station.id}_Leica_NTRIP.xml`
      type = 'application/xml'
    } else if (format === 'trimble') {
      content = generateTrimbleXml()
      filename = `${activeStation.station.id}_Trimble_NTRIP.xml`
      type = 'application/xml'
    } else if (format === 'survce') {
      content = generateSurvCeIni()
      filename = `${activeStation.station.id}_SurvCE_NTRIP.ini`
      type = 'text/plain'
    }

    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCopyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedProfile(key)
    setTimeout(() => setCopiedProfile(null), 2500)
  }

  return (
    <div className="space-y-6">
      {/* Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Rover Site Location (6 Cols) */}
        <div className="lg:col-span-6 border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
            <h2 className="text-base font-bold flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[var(--accent)]" />
              1. Rover / Field Site Coordinates
            </h2>
            <span className="text-xs text-[var(--text-secondary)]">Datum: WGS84</span>
          </div>

          <div className="space-y-4">
            {/* Quick Regional Presets */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Select Regional Benchmark Center / Town
              </label>
              <select
                value={selectedPreset}
                onChange={(e) => handlePresetSelect(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              >
                {REGIONAL_PRESETS.map((p) => (
                  <option key={p.name} value={p.name} className="bg-[var(--bg-secondary)]">
                    {p.name}
                  </option>
                ))}
                <option value="Custom Coordinates" className="bg-[var(--bg-secondary)]">
                  Custom Coordinates (Manual Entry)
                </option>
              </select>
            </div>

            {/* Latitude & Longitude Inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Latitude (Decimal Deg)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={roverLat}
                  onChange={(e) => {
                    setRoverLat(parseFloat(e.target.value) || 0)
                    setSelectedPreset('Custom Coordinates')
                  }}
                  className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Longitude (Decimal Deg)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={roverLon}
                  onChange={(e) => {
                    setRoverLon(parseFloat(e.target.value) || 0)
                    setSelectedPreset('Custom Coordinates')
                  }}
                  className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            {/* Auto Detect Button */}
            <button
              onClick={handleAutoDetect}
              disabled={loadingLocation}
              className="w-full py-2.5 px-4 rounded-xl border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Zap className="w-4 h-4 text-[var(--accent)]" />
              <span>{loadingLocation ? 'Detecting GPS Device Location...' : 'Auto-Detect Current GPS Position'}</span>
            </button>

            {locationMsg && (
              <div className="p-2.5 rounded-lg bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-xs text-[var(--text-primary)]">
                {locationMsg}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Network & NTRIP Settings (6 Cols) */}
        <div className="lg:col-span-6 border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
            <h2 className="text-base font-bold flex items-center gap-2">
              <Server className="w-4 h-4 text-[var(--accent)]" />
              2. CORS Network & NTRIP Credentials
            </h2>
            <span className="text-xs text-[var(--text-secondary)]">Caster Auth</span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Filter Reference Network
              </label>
              <select
                value={selectedNetwork}
                onChange={(e) => setSelectedNetwork(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="all" className="bg-[var(--bg-secondary)]">All Networks (KENCORS, TANZACORS, IGS, Commercial)</option>
                {NETWORKS.map((n) => (
                  <option key={n.id} value={n.id} className="bg-[var(--bg-secondary)]">
                    {n.name} ({n.type.toUpperCase()}) — {n.address}:{n.port}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  NTRIP Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Licensed surveyor ID"
                  className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  NTRIP Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password / PIN"
                  className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-black/20 border border-[var(--border-color)] text-xs text-[var(--text-secondary)] leading-relaxed">
              <AlertTriangle className="mr-1 inline h-4 w-4" aria-hidden="true" /> <strong>KENCORS Notice:</strong> Survey of Kenya KENCORS stream operates in standard RTCM 3.2 MSM5 protocol. Registered land surveyors can authenticate using their SRB-issued NTRIP credentials.
            </div>
          </div>
        </div>
      </div>

      {/* Baseline Evaluation Banner for Active Station */}
      {activeStation && activeNetwork && (
        <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-6 shadow-md relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xl font-extrabold text-[var(--text-primary)]">
                  {activeStation.station.id} — {activeStation.station.name}
                </span>
                {getStatusBadge(activeStation.baselineStatus)}
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Network: <strong className="text-[var(--text-primary)]">{activeNetwork.name}</strong> • Caster: <code className="bg-white/5 px-1.5 py-0.5 rounded text-xs">{activeNetwork.address}:{activeNetwork.port}</code> • Mountpoint: <code className="bg-white/5 px-1.5 py-0.5 rounded text-xs font-bold text-[var(--accent)]">{activeStation.station.mountpoint}</code>
              </p>
            </div>

            {/* Metric Counters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 rounded-xl bg-black/20 border border-[var(--border-color)]">
                <div className="text-[11px] text-[var(--text-secondary)]">Baseline Distance</div>
                <div className="text-lg font-bold font-mono text-[var(--text-primary)]">
                  {activeStation.distanceKm.toFixed(1)} km
                </div>
              </div>
              <div className="p-3 rounded-xl bg-black/20 border border-[var(--border-color)]">
                <div className="text-[11px] text-[var(--text-secondary)]">Geodetic Azimuth</div>
                <div className="text-lg font-bold font-mono text-[var(--text-primary)]">
                  {activeStation.bearingDeg.toFixed(0)}°
                </div>
              </div>
              <div className="p-3 rounded-xl bg-black/20 border border-[var(--border-color)]">
                <div className="text-[11px] text-[var(--text-secondary)]">Expected H Acc.</div>
                <div className="text-lg font-bold font-mono text-emerald-400">
                  ±{accuracyMetrics.horizontalMm} mm
                </div>
              </div>
              <div className="p-3 rounded-xl bg-black/20 border border-[var(--border-color)]">
                <div className="text-[11px] text-[var(--text-secondary)]">Estimated TTFF</div>
                <div className="text-lg font-bold font-mono text-[var(--accent)]">
                  {accuracyMetrics.ttffSec}
                </div>
              </div>
            </div>
          </div>

          {/* Export Buttons */}
          <div className="mt-6 pt-5 border-t border-[var(--border-color)] flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-[var(--text-secondary)] mr-1">Export Profile:</span>
              <button
                onClick={() => handleDownloadProfile('leica')}
                className="py-1.5 px-3 rounded-lg border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-[var(--accent)]" /> Leica XML
              </button>
              <button
                onClick={() => handleDownloadProfile('trimble')}
                className="py-1.5 px-3 rounded-lg border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-[var(--accent)]" /> Trimble XML
              </button>
              <button
                onClick={() => handleDownloadProfile('survce')}
                className="py-1.5 px-3 rounded-lg border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-[var(--accent)]" /> SurvCE INI
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopyText(rawCasterString, 'uri')}
                className="py-1.5 px-3 rounded-lg bg-[var(--accent)] text-black text-xs font-bold flex items-center gap-1.5 hover:opacity-90 transition-opacity"
              >
                {copiedProfile === 'uri' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedProfile === 'uri' ? 'Copied URL!' : 'Copy NTRIP URL'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stations Ranking Table */}
      <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
          <h2 className="text-base font-bold flex items-center gap-2">
            <RadioTower className="w-4 h-4 text-[var(--accent)]" />
            Ranked Nearest CORS Stations ({nearestStations.length})
          </h2>
          <span className="text-xs text-[var(--text-secondary)]">Sorted by shortest baseline</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--text-secondary)] border-b border-[var(--border-color)] text-left">
                <th className="py-2.5 px-3">Station ID</th>
                <th className="py-2.5 px-3">Location & Network</th>
                <th className="py-2.5 px-3 text-right">Distance (km)</th>
                <th className="py-2.5 px-3 text-right">Bearing</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3">Format / Constellations</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {nearestStations.map((res) => {
                const isSelected = res.station.id === (activeStation?.station.id)
                const net = NETWORKS.find(n => n.id === res.station.networkId)
                return (
                  <tr
                    key={res.station.id}
                    className={`border-b border-[color-mix(in_srgb,var(--border-color)_50%,transparent)] transition-colors ${
                      isSelected
                        ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] font-semibold'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-sm text-[var(--text-primary)]">
                      {res.station.id}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="text-[var(--text-primary)] font-medium">{res.station.name}</div>
                      <div className="text-[10px] text-[var(--text-secondary)]">{net?.name}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-sm">
                      {res.distanceKm.toFixed(1)} km
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-[var(--text-secondary)]">
                      {res.bearingDeg.toFixed(0)}°
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {getStatusBadge(res.baselineStatus)}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="text-[var(--text-primary)] font-mono text-[11px]">
                        {res.station.format}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {res.station.constellations.map((c) => (
                          <span
                            key={c}
                            className="px-1.5 py-0.2 rounded text-[10px] bg-black/30 text-[var(--text-secondary)] border border-[var(--border-color)]"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => setSelectedStationId(res.station.id)}
                        className={`py-1 px-3 rounded-lg text-xs font-semibold transition-colors ${
                          isSelected
                            ? 'bg-[var(--accent)] text-black'
                            : 'border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-[var(--text-primary)]'
                        }`}
                      >
                        {isSelected ? 'Selected' : 'Select'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
