export interface DeedPlanInput {
  surveyNumber: string
  drawingNumber: string
  parcelNumber: string
  locality: string
  area: number
  registrationSection: string
  county: string
  utmZone: number
  hemisphere: 'N' | 'S'
  scale: 500 | 1000 | 2500 | 5000
  datum: 'ARC1960' | 'WGS84'
  projectionType: 'UTM' | 'Cassini'
  boundaryPoints: BoundaryPoint[]
  abuttalNorth: string
  abuttalSouth: string
  abuttalEast: string
  abuttalWest: string
  surveyorName: string
  iskNumber: string
  firmName: string
  firmAddress: string
  surveyDate: string
  signatureDate: string
  clientName?: string
  titleDeedNumber?: string
  drawnBy?: string
  checkedBy?: string
}

export interface BoundaryPoint {
  id: string
  easting: number
  northing: number
  elevation?: number
  markType: BeaconType
  markStatus: 'FOUND' | 'SET' | 'REFERENCED'
  description?: string
}

export interface BoundaryLeg {
  fromPoint: string
  toPoint: string
  bearing: string
  distance: number
}

export type BeaconType =
  // Primary marks
  | 'PSC'              // Primary Survey Control — concrete pillar
  | 'PSC_FLUSH'        // PSC flush with ground
  | 'SSC'              // Secondary Survey Control
  | 'TSC'              // Tertiary Survey Control

  // Boundary marks
  | 'MASONRY_NAIL'     // Nail in masonry/concrete
  | 'IRON_PIN'         // Iron pin driven in ground
  | 'WOODEN_PEG'       // Temporary wooden peg
  | 'CONCRETE_BEACON'  // Concrete boundary beacon
  | 'INDICATORY'       // Indicatory beacon (not physical corner)
  | 'RIVET'            // Brass/steel rivet in rock or concrete

  // Level marks  
  | 'BM'               // Benchmark (permanent)
  | 'TBM'              // Temporary Benchmark
  | 'FLUSH_BRACKET'    // Flush bracket on wall

  // Road / infrastructure
  | 'ROAD_NAIL'        // Nail in tarmac
  | 'SPIKE'            // Railway spike

  // Special
  | 'NATURAL_FEATURE'  // Tree, rock face used as reference
  | 'FENCE_POST'       // Fence post at boundary
  | 'WALL_CORNER'      // Corner of permanent wall

export type BeaconStatus = 'FOUND' | 'SET' | 'REFERENCED' | 'DESTROYED' | 'NOT_FOUND'

export interface BeaconDefinition {
  type: BeaconType
  shortCode: string
  fullName: string
  regulation: string
  isPermanent: boolean
  isControlMark: boolean
  defaultOrder: 'PRIMARY' | 'SECONDARY' | 'TERTIARY' | 'DETAIL'
  description: string
}

export interface DeedPlanOutput {
  svg: string
  bearingSchedule: BoundaryLeg[]
  coordinateSchedule: BoundaryPoint[]
  closureCheck: ClosureCheck
}

export interface ClosureCheck {
  closingErrorE: number
  closingErrorN: number
  perimeter: number
  precisionRatio: string
  passes: boolean
}

export interface DeedPlanDocument extends DeedPlanInput {
  id: string
  projectId: string
  userId: string
  svgContent: string
  closureCheck: ClosureCheck
  status: 'draft' | 'finalised'
  createdAt: string
  updatedAt: string
}
