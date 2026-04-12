export interface SafetyIncident {
  id: string
  project_id: string
  user_id: string
  incident_type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  location?: { lat: number; lng: number; name?: string }
  description: string
  evidence_images: string[]
  status: 'reported' | 'investigating' | 'resolved' | 'closed'
  risk_score?: number
  created_at: string
  updated_at: string
}

export interface SafetyReport {
  id: string
  project_id: string
  user_id: string
  report_type: 'daily' | 'weekly' | 'monthly' | 'incident'
  period_start: string
  period_end: string
  summary: {
    total_incidents: number
    high_severity_count: number
    resolved_count: number
    average_risk_score: number
  }
  recommendations: string[]
  risk_trends: { date: string; score: number }[]
  created_at: string
}

export interface AnalyzeSafetyRequest {
  image_data?: string
  location?: { lat: number; lng: number }
  detection_types?: string[]
}

export interface AnalyzeSafetyResponse {
  hazards_detected: {
    type: string
    confidence: number
    location: { x: number; y: number }
    severity: 'low' | 'medium' | 'high'
  }[]
  overall_risk_score: number
  recommendations: string[]
}
