export interface BoundaryPoint {
  easting: number
  northing: number
}

export interface BoundaryPolygon {
  points: BoundaryPoint[]
  crs?: string
}

export interface ValidationResult {
  score: number
  overlaps: Overlap[]
  gaps: Gap[]
  summary: {
    total_overlap_area: number
    total_gap_area: number
    risk_level: 'low' | 'medium' | 'high'
    boundary_area: number
  }
}

export interface Overlap {
  id: string
  area: number
  coordinates: BoundaryPoint[]
  severity: 'minor' | 'moderate' | 'severe'
  description: string
}

export interface Gap {
  id: string
  area: number
  coordinates: BoundaryPoint[]
  severity: 'minor' | 'moderate' | 'severe'
  description: string
}

export interface CadastraValidation {
  id: string
  project_id: string
  user_id: string
  boundary_data: BoundaryPolygon
  satellite_overlay: Record<string, unknown> | null
  historical_cadastre: Record<string, unknown> | null
  score: number
  overlaps: Overlap[]
  gaps: Gap[]
  report_url: string | null
  created_at: string
  updated_at: string
}

export interface ValidateRequest {
  project_id: string
  boundary: BoundaryPolygon
  options?: {
    include_satellite?: boolean
    historical_comparison?: boolean
  }
}

export interface ValidateResponse {
  validation: ValidationResult
  overlays?: {
    satellite_url: string
    historical_url: string
  }
}