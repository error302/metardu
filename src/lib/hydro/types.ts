/**
 * Hydrographic Survey Types — Phase 19
 */

export interface RawSounding {
  x: number
  y: number
  depthM: number
  timestamp: string
}

export interface TideObservation {
  timestamp: string
  waterLevelM: number
}

export interface ReducedSounding {
  x: number
  y: number
  rawDepthM: number
  waterLevelM: number
  reducedDepthM: number
  timestamp: string
}

export interface TidalReductionResult {
  reducedSoundings: ReducedSounding[]
  meanWaterLevel: number
  maxWaterLevel: number
  minWaterLevel: number
  warnings: string[]
}

export interface BathymetricGrid {
  idwGrid: {
    grid: number[][]
    cols: number
    rows: number
    minX: number
    minY: number
    cellSize: number
  }
  minDepth: number
  maxDepth: number
  meanDepth: number
}

export interface RosData {
  vesselName: string
  sounderModel: string
  startDate: string
  endDate: string
  weatherSummary: string
  interruptions: string
  equipmentNotes: string
}

export interface HydroSurveyRecord {
  id: string
  project_id: string
  created_at: string
  updated_at: string
  hydro_type: string
  vessel_name: string | null
  sounder_model: string | null
  survey_datum: string
  tide_gauge_ref: string | null
  soundings: RawSounding[]
  tide_observations: TideObservation[]
  reduced_soundings: ReducedSounding[] | null
  bathymetric_grid: BathymetricGrid['idwGrid'] | null
  ros_start_date: string | null
  ros_end_date: string | null
  ros_weather_summary: string | null
  ros_equipment_notes: string | null
  ros_interruptions: string | null
  status: 'pending' | 'reduced' | 'charted' | 'submitted'
}

export interface TideGaugeStation {
  id: string
  station_id: string
  name: string
  county: string | null
  latitude: number | null
  longitude: number | null
  datum: string
}
