// GNSS Types for Baseline Processing

export interface GNSSSession {
  id: string
  projectId: string
  userId: string
  status: 'uploading' | 'processing' | 'complete' | 'failed'
  inputFiles: RINEXFile[]
  results?: GNSSBaseline[]
  errorMsg?: string
  createdAt: string
  updatedAt: string
}

export interface RINEXFile {
  filename: string
  stationId: string
  fileType: 'OBS' | 'NAV' | 'MET'
  sizeBytes: number
  storagePath: string
  occupationStart?: string
  occupationEnd?: string
  occupationDuration?: number
}

export interface GNSSBaseline {
  fromStation: string
  toStation: string
  deltaX: number
  deltaY: number
  deltaZ: number
  distance: number
  rmsError: number
  ratio: number
  fixed: boolean
  toEasting: number
  toNorthing: number
  toElevation: number
  qualityClass: 'A' | 'B' | 'C' | 'D'
}

export interface GNSSProcessingRequest {
  files: RINEXFile[]
  projectId: string
  stationLabels: string[]
}

export interface GNSSProcessingResponse {
  sessionId: string
  results: GNSSBaseline[]
  status: 'complete' | 'failed' | 'simulated'
  message?: string
}

export type DatumCode =
  | 'WGS84'
  | 'ARC1960'
  | 'CASSINI'
  | 'UTM'
  | 'GEOGRAPHIC_WGS84'
  | 'GEOGRAPHIC_ARC'

export interface CoordInput {
  id?: string
  x: number
  y: number
  z?: number
}

export interface TransformRequest {
  coordinates: CoordInput[]
  fromDatum: DatumCode
  toDatum: DatumCode
  fromZone?: number
  fromHemisphere?: 'N' | 'S'
  toZone?: number
  toHemisphere?: 'N' | 'S'
}

export interface TransformResponse {
  results: TransformedCoord[]
  fromDatum: DatumCode
  toDatum: DatumCode
  note?: string
}

export interface TransformedCoord {
  id?: string
  x: number
  y: number
  z?: number
  roundTripError?: number
}
