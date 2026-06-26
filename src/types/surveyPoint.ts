export interface SurveyPoint {
  id?: string
  name: string
  easting: number
  northing: number
  elevation?: number
  is_control?: boolean
  control_order?: string
  locked?: boolean
  lat?: number
  lon?: number
}