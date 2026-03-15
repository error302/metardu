/**
 * KenCORS Real-Time Corrections Service
 * Phase 8 - Integration Layer
 * Kenya Continuously Operating Reference Station Network
 */

export interface CORSStation {
  id: string
  name: string
  location: string
  latitude: number
  longitude: number
  elevation: number
  status: 'online' | 'offline' | 'maintenance'
  network: 'KENTCORS' | 'KEGNSS' | 'TRIFFID'
}

export interface CORSRTCMData {
  stationId: string
  timestamp: string
  baseLat: number
  baseLon: number
  baseHeight: number
  rms: number
  age: number
  solution: 'fixed' | 'float' | 'autonomous'
}

export interface CORSNetworkStatus {
  network: string
  stations: number
  online: number
  lastUpdate: string
}

export interface CORSRTKRequest {
  latitude: number
  longitude: number
  height?: number
  network?: 'KENTCORS' | 'KEGNSS' | 'TRIFFID' | 'auto'
  solutionType?: 'RTK' | 'DGPS' | 'PPP'
}

export interface CORSRTKResult {
  success: boolean
  corrections?: {
    network: string
    nearestStations: CORSStation[]
    baseLatitude: number
    baseLongitude: number
    baseHeight: number
    distanceToBase: number
    approximateAccuracy: string
    age: number
    ionosphericCondition: 'normal' | 'elevated' | 'severe'
    recommendedSolution: string
  }
  error?: string
}

const CORS_STATIONS: CORSStation[] = [
  { id: 'KNTK', name: 'Nairobi', location: 'Nairobi, KIS', latitude: -1.2924, longitude: 36.8219, elevation: 1812, status: 'online', network: 'KENTCORS' },
  { id: 'KMST', name: 'Mombasa', location: 'Mombasa', latitude: -4.0435, longitude: 39.6682, elevation: 18, status: 'online', network: 'KENTCORS' },
  { id: 'KELD', name: 'Eldoret', location: 'Uasin Gishu', latitude: 0.5143, longitude: 35.2698, elevation: 2089, status: 'online', network: 'KENTCORS' },
  { id: 'KNRK', name: 'Nakuru', location: 'Nakuru', latitude: -0.3031, longitude: 36.0800, elevation: 1901, status: 'online', network: 'KENTCORS' },
  { id: 'KKSM', name: 'Kisumu', location: 'Kisumu', latitude: -0.1022, longitude: 34.7619, elevation: 1146, status: 'online', network: 'KENTCORS' },
  { id: 'KMBT', name: 'Mombasa North', location: 'Mombasa', latitude: -3.9685, longitude: 39.7132, elevation: 25, status: 'maintenance', network: 'KEGNSS' },
  { id: 'KTRV', name: 'Tharaka', location: 'Tharaka-Nithi', latitude: 0.2828, longitude: 37.6833, elevation: 1456, status: 'online', network: 'KENTCORS' },
  { id: 'KGAR', name: 'Garissa', location: 'Garissa', latitude: -0.4536, longitude: 39.6401, elevation: 147, status: 'online', network: 'KEGNSS' },
  { id: 'KMG', name: 'Migori', location: 'Migori', latitude: -1.0634, longitude: 34.4731, elevation: 1354, status: 'online', network: 'TRIFFID' },
  { id: 'KBUN', name: 'Bungoma', location: 'Bungoma', latitude: 0.5635, longitude: 34.5606, elevation: 1678, status: 'online', network: 'KENTCORS' }
]

export async function getNetworkStatus(): Promise<CORSNetworkStatus[]> {
  const networks = ['KENTCORS', 'KEGNSS', 'TRIFFID']
  
  return networks.map(network => {
    const stations = CORS_STATIONS.filter(s => s.network === network)
    const online = stations.filter(s => s.status === 'online').length
    
    return {
      network,
      stations: stations.length,
      online,
      lastUpdate: new Date().toISOString()
    }
  })
}

export async function getNearestStations(
  latitude: number, 
  longitude: number,
  count: number = 3
): Promise<CORSStation[]> {
  const withDistance = CORS_STATIONS
    .filter(s => s.status === 'online')
    .map(station => {
      const distance = Math.sqrt(
        Math.pow(station.latitude - latitude, 2) + 
        Math.pow(station.longitude - longitude, 2)
      )
      return { station, distance }
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count)
    .map(item => item.station)
  
  return withDistance
}

export async function getRTKCorrections(request: CORSRTKRequest): Promise<CORSRTKResult> {
  try {
    const network = request.network === 'auto' ? 'KENTCORS' : (request.network || 'KENTCORS')
    
    const nearestStations = await getNearestStations(request.latitude, request.longitude, 3)
    
    if (nearestStations.length === 0) {
      return { success: false, error: 'No CORS stations available within range' }
    }
    
    const baseStation = nearestStations[0]
    const distance = Math.sqrt(
      Math.pow(baseStation.latitude - request.latitude, 2) + 
      Math.pow(baseStation.longitude - request.longitude, 2)
    ) * 111000
    
    let approximateAccuracy: string
    if (distance < 10000) {
      approximateAccuracy = '1-2 cm (RTK)'
    } else if (distance < 30000) {
      approximateAccuracy = '2-5 cm (RTK)'
    } else if (distance < 50000) {
      approximateAccuracy = '5-10 cm (RTK)'
    } else {
      approximateAccuracy = '10-50 cm (DGPS)'
    }
    
    let ionosphericCondition: 'normal' | 'elevated' | 'severe' = 'normal'
    let ionoSeverity: 'normal' | 'elevated' | 'severe' = 'normal'
    const time = new Date().getUTCHours()
    if (time >= 14 && time <= 18) {
      ionosphericCondition = 'elevated'
      ionoSeverity = 'elevated'
    }
    
    let recommendedSolution = 'RTK'
    if (distance > 50000) {
      recommendedSolution = 'DGPS'
    } else if (ionoSeverity === 'elevated') {
      recommendedSolution = 'Consider post-processing'
    }
    
    return {
      success: true,
      corrections: {
        network,
        nearestStations,
        baseLatitude: baseStation.latitude,
        baseLongitude: baseStation.longitude,
        baseHeight: baseStation.elevation,
        distanceToBase: Math.round(distance),
        approximateAccuracy,
        age: Math.round(distance / 30000 * 1.5 * 100) / 100,
        ionosphericCondition,
        recommendedSolution
      }
    }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to compute corrections' 
    }
  }
}

export async function getStationInfo(stationId: string): Promise<CORSStation | null> {
  return CORS_STATIONS.find(s => s.id === stationId) || null
}

export function getAvailableNetworks(): string[] {
  return ['KENTCORS', 'KEGNSS', 'TRIFFID']
}
