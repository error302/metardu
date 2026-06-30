export interface KenCORSStation {
  id: string
  name: string
  shortCode: string
  county: string
  latitude: number
  longitude: number
  elevation: number
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED'
  lastHeartbeat: string
  mountPoints: MountPoint[]
}

export interface MountPoint {
  name: string
  format: 'RTCM3' | 'RTCM2' | 'CMR'
  navSystem: string
  network: string
}

export interface KenCORSSession {
  stationId: string
  mountPoint: string
  startTime: string
  endTime?: string
  correctionMethod: 'RTK' | 'VRS' | 'FKP'
  baselineLength: number
  expectedAccuracy: string
}
