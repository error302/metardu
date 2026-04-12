// EDM Correction Types

export interface EDMCorrectionInput {
  measuredDistance: number
  temperature: number
  pressure: number
  humidity: number
  wavelength?: number
  elevation?: number
  latitude?: number
}

export interface EDMCorrectionResult {
  measuredDistance: number
  atmosphericCorrection: number
  correctedDistance: number
  seaLevelCorrection?: number
  scaleFactor?: number
  finalDistance: number
  workings: CorrectionStep[]
}

export interface CorrectionStep {
  name: string
  formula: string
  value: number
  unit: string
}

export interface WeatherData {
  temperature: number
  pressure: number
  humidity: number
  fetchedAt: string
}
