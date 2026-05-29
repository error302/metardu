export type ObservationType = 
  | 'BS' | 'IS' | 'FS'        // leveling
  | 'ANGLE' | 'DISTANCE'       // traverse/radiation
  | 'BEARING' | 'COORDINATE'   // COGO
  | 'ELEVATION'                // spot heights

export interface SurveyObservation {
  id: string
  station: string
  target?: string
  type: ObservationType
  value1: number        // primary measurement
  value2?: number       // secondary (e.g. vertical angle)
  unit?: string
  timestamp?: string
  raw?: string          // original field entry
}

export interface SurveyDataset {
  surveyType: 'traverse' | 'leveling' | 'radiation' | 'settingout' | 'boundary' | 'unknown'
  observations: SurveyObservation[]
  metadata?: {
    station?: string
    closingStation?: string
    datum?: string
  }
}
