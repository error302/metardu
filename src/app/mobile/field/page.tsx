'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { offlineStorage, FieldObservation, PhotoData } from '@/lib/mobile/offlineStorage'
import { syncService } from '@/lib/mobile/syncService'
import { createClient } from '@/lib/api-client/client'
import Link from 'next/link'

// Icons
const LocationIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const CameraIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const SyncIcon = ({ spinning }: { spinning?: boolean }) => (
  <svg className={`w-6 h-6 ${spinning ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
)

const WifiIcon = ({ connected }: { connected: boolean }) => (
  <svg className={`w-6 h-6 ${connected ? 'text-green-500' : 'text-red-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
      d={connected 
        ? "M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" 
        : "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"} />
  </svg>
)

export default function MobileFieldPage() {
  const searchParams = useSearchParams()
  const projectId = searchParams.get('project') || ''
  
  const [projectName, setProjectName] = useState('Unknown Project')
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [lastSync, setLastSync] = useState<string | null>(null)
  
  // GPS State
  const [isCapturing, setIsCapturing] = useState(false)
  const [gpsData, setGpsData] = useState<{
    latitude: number
    longitude: number
    accuracy: number
    altitude: number | null
    heading: number | null
    speed: number | null
    satellites: number
  } | null>(null)
  
  // Form State
  const [pointName, setPointName] = useState('')
  const [observationType, setObservationType] = useState<'gps' | 'manual'>('gps')
  const [notes, setNotes] = useState('')
  const [rodHeight, setRodHeight] = useState('')
  const [photos, setPhotos] = useState<PhotoData[]>([])
  const [recentObservations, setRecentObservations] = useState<FieldObservation[]>([])

  // Initialize
  useEffect(() => {
    if (projectId) {
      loadProject()
      loadObservations()
      loadStats()
    }

    // Listen for online/offline
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    // Start auto sync
    syncService.startAutoSync()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      syncService.stopAutoSync()
    }
  }, [projectId])

  const loadProject = async () => {
    const dbClient = createClient()
    const { data } = await dbClient.from('projects').select('name').eq('id', projectId).single()
    if (data?.name) setProjectName(data.name)
  }

  const loadObservations = async () => {
    if (!projectId) return
    const observations = await offlineStorage.getFieldObservations(projectId)
    setRecentObservations(observations.slice(-5).reverse())
  }

  const loadStats = async () => {
    const stats = await offlineStorage.getStorageStats()
    setPendingCount(stats.pendingSync)
  }

  const captureGPS = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by this device')
      return
    }

    setIsCapturing(true)
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsData({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          heading: position.coords.heading,
          speed: position.coords.speed,
          satellites: 0, // Not available in standard API
        })
        setIsCapturing(false)
      },
      (error) => {
        console.error('GPS Error:', error)
        alert(`GPS Error: ${error.message}`)
        setIsCapturing(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0
      }
    )
  }

  const takePhoto = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.capture = 'environment'
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      // Convert to base64
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64 = reader.result as string
        
        // Create thumbnail
        const thumbnail = await createThumbnail(base64, 200)
        
        const photo: PhotoData = {
          id: undefined,
          projectId,
          pointName,
          data: base64,
          thumbnail,
          timestamp: Date.now(),
          synced: false,
        }
        
        setPhotos(prev => [...prev, photo])
      }
      reader.readAsDataURL(file)
    }
    
    input.click()
  }

  const createThumbnail = (base64: string, maxSize: number): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = maxSize / Math.max(img.width, img.height)
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height)
        
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }
      img.src = base64
    })
  }

  const saveObservation = async () => {
    if (!pointName.trim()) {
      alert('Please enter a point name')
      return
    }

    if (observationType === 'gps' && !gpsData) {
      alert('Please capture GPS location first')
      return
    }

    const observation: FieldObservation = {
      projectId,
      pointName: pointName.trim(),
      observationType,
      northing: gpsData?.latitude || 0, // Convert to UTM in real implementation
      easting: gpsData?.longitude || 0,
      elevation: gpsData?.altitude || undefined,
      latitude: gpsData?.latitude,
      longitude: gpsData?.longitude,
      accuracy: gpsData?.accuracy,
      rodHeight: rodHeight ? parseFloat(rodHeight) : undefined,
      notes: notes.trim() || undefined,
    }

    try {
      // Save observation
      await offlineStorage.saveFieldObservation(observation)
      
      // Save photos
      for (const photo of photos) {
        await offlineStorage.savePhoto(photo)
      }
      
      // Reset form
      setPointName('')
      setGpsData(null)
      setPhotos([])
      setNotes('')
      setRodHeight('')
      
      // Refresh
      await loadObservations()
      await loadStats()
      
      // Show success
      alert('Observation saved! Will sync when online.')
      
    } catch (error) {
      console.error('Save error:', error)
      alert('Failed to save observation')
    }
  }

  const handleSync = async () => {
    if (!isOnline) {
      alert('No internet connection. Data will sync when connection is restored.')
      return
    }

    setIsSyncing(true)
    try {
      const { synced, failed } = await syncService.forceSync()
      setLastSync(new Date().toLocaleTimeString())
      await loadStats()
      await loadObservations()
      
      if (failed > 0) {
        alert(`Synced: ${synced}, Failed: ${failed}`)
      } else if (synced > 0) {
        alert(`Successfully synced ${synced} observations!`)
      } else {
        alert('Everything is up to date!')
      }
    } catch (error) {
      console.error('Sync error:', error)
      alert('Sync failed. Will retry automatically.')
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-bold">Field Collection</h1>
            <p className="text-xs text-gray-400 truncate max-w-[200px]">{projectName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleSync} disabled={isSyncing || !isOnline}
            className={`p-2 rounded-lg ${isSyncing ? 'bg-blue-600' : isOnline ? 'bg-green-600' : 'bg-red-600'}`}>
            <SyncIcon spinning={isSyncing} />
          </button>
          <WifiIcon connected={isOnline} />
        </div>
      </header>

      {/* Stats Bar */}
      <div className="bg-gray-800 px-4 py-2 flex justify-between items-center text-xs">
        <span className="text-gray-400">
          Pending: <span className="text-yellow-400 font-mono">{pendingCount}</span>
        </span>
        {lastSync && (
          <span className="text-gray-500">
            Last sync: {lastSync}
          </span>
        )}
      </div>

      {/* Main Form */}
      <main className="p-4 space-y-4 pb-32">
        {/* Point Name */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Point Name</label>
          <input
            type="text"
            value={pointName}
            onChange={(e) => setPointName(e.target.value)}
            placeholder="e.g., BM1, P100, Control A"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Observation Type */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setObservationType('gps')}
            className={`py-3 px-4 rounded-lg font-medium transition-colors ${
              observationType === 'gps'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 border border-gray-700'
            }`}
          >
            GPS
          </button>
          <button
            onClick={() => setObservationType('manual')}
            className={`py-3 px-4 rounded-lg font-medium transition-colors ${
              observationType === 'manual'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 border border-gray-700'
            }`}
          >
            Manual
          </button>
        </div>

        {/* GPS Capture */}
        {observationType === 'gps' && (
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-200">GPS Location</h3>
              <button
                onClick={captureGPS}
                disabled={isCapturing}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium active:scale-95 transition-transform"
              >
                <LocationIcon />
                {isCapturing ? 'Capturing...' : 'Capture GPS'}
              </button>
            </div>
            
            {gpsData ? (
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-gray-500">Latitude</span>
                    <p className="font-mono text-green-400">{gpsData.latitude.toFixed(7)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Longitude</span>
                    <p className="font-mono text-green-400">{gpsData.longitude.toFixed(7)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-gray-500">Accuracy</span>
                    <p className={`font-mono ${gpsData.accuracy < 5 ? 'text-green-400' : gpsData.accuracy < 15 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {gpsData.accuracy.toFixed(1)}m
                    </p>
                  </div>
                  {gpsData.altitude && (
                    <div>
                      <span className="text-gray-500">Elevation</span>
                      <p className="font-mono text-green-400">{gpsData.altitude.toFixed(2)}m</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">
                Tap "Capture GPS" to record location
              </p>
            )}
          </div>
        )}

        {/* Rod Height */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Rod / Instrument Height (m)</label>
          <input
            type="number"
            value={rodHeight}
            onChange={(e) => setRodHeight(e.target.value)}
            placeholder="1.5"
            step="0.001"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Photos */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Photos</label>
          <div className="flex gap-2 flex-wrap">
            {photos.map((photo, idx) => (
              <div key={idx} className="relative">
                <img
                  src={photo.thumbnail || photo.data}
                  alt={`Photo ${idx + 1}`}
                  className="w-20 h-20 object-cover rounded-lg border border-gray-700"
                />
                <button
                  onClick={() => setPhotos(p => p.filter((_, i) => i !== idx))}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={takePhoto}
              className="w-20 h-20 border-2 border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center text-gray-400 active:border-blue-500 active:text-blue-500"
            >
              <CameraIcon />
              <span className="text-xs mt-1">Add</span>
            </button>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any observations about the point, access conditions, etc."
            rows={3}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* Recent Observations */}
        {recentObservations.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="font-medium text-gray-200 mb-3">Recent Observations</h3>
            <div className="space-y-2">
              {recentObservations.map((obs) => (
                <div key={obs.id} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                  <div>
                    <p className="font-medium text-white">{obs.pointName}</p>
                    <p className="text-xs text-gray-500">
                      {obs.observationType === 'gps' ? '📍 GPS' : '✏️ Manual'}
                      {' • '}
                      {new Date(obs.timestamp || 0).toLocaleTimeString()}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${obs.synced ? 'bg-green-900 text-green-400' : 'bg-yellow-900 text-yellow-400'}`}>
                    {obs.synced ? 'Synced' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer Action */}
      <footer className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 p-4">
        <button
          onClick={saveObservation}
          disabled={!pointName.trim() || (observationType === 'gps' && !gpsData)}
          className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform"
        >
          Save Observation
        </button>
      </footer>
    </div>
  )
}
