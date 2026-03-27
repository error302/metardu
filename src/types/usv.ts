export interface Waypoint {
  id: string
  lat: number
  lng: number
  order: number
  action?: 'waypoint' | 'start' | 'end' | 'pause'
}

export interface SurveyPattern {
  type: 'parallel' | 'radial' | 'circular' | 'waypoint'
  spacing?: number
  coverage?: number
}

export interface USVMission {
  id: string
  project_id: string
  user_id: string
  mission_name: string
  usv_ids: string[]
  waypoints: Waypoint[]
  pattern_type: string
  status: 'draft' | 'scheduled' | 'running' | 'completed' | 'cancelled'
  scheduled_start?: string
  actual_start?: string
  actual_end?: string
  created_at: string
  updated_at: string
}

export interface USVTelemetry {
  id: string
  mission_id: string
  usv_id: string
  position: { lat: number; lng: number }
  heading: number
  speed: number
  battery_percent: number
  signal_strength: number
  recorded_at: string
}

export interface CreateMissionRequest {
  project_id: string
  mission_name: string
  usv_ids: string[]
  waypoints: Waypoint[]
  pattern_type?: string
  scheduled_start?: string
}
