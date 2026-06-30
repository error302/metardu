export interface SoundingPoint {
  id: string
  easting: number
  northing: number
  depth: number
  timestamp?: string
}

export interface ContourLine {
  elevation: number
  coordinates: number[][]
}

export interface VolumeDelta {
  survey_id: string
  volume_change: number
  area_change: number
  period: { from: string; to: string }
}

export interface Hazard {
  id: string
  type: 'rock' | 'shallow' | 'wreck' | 'obstruction'
  location: { easting: number; northing: number }
  depth: number
  severity: 'low' | 'medium' | 'high'
  description: string
}

export interface BathymetricSurvey {
  id: string
  project_id: string
  user_id: string
  survey_name: string
  soundings: SoundingPoint[]
  contours: ContourLine[]
  deltas: VolumeDelta[]
  hazards: Hazard[]
  created_at: string
  updated_at: string
}

export interface ProcessBathymetryRequest {
  project_id: string
  soundings: SoundingPoint[]
  options?: {
    contour_interval?: number
    detect_hazards?: boolean
    compare_previous?: boolean
  }
}

export interface ProcessBathymetryResponse {
  contours: ContourLine[]
  volume_delta?: VolumeDelta
  hazards: Hazard[]
  summary: {
    min_depth: number
    max_depth: number
    avg_depth: number
    area: number
  }
}
