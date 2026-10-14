import type { DrainageMapAlignmentSource } from '@/lib/engineering/drainageAlignment'
import type { PartialFlowResult } from '@/lib/engineering/pipeNetworkEngine'
import type { PipeNetworkProjectData } from '@/lib/engineering/pipeNetworkPersistence'

export type EngineeringMode = 'road' | 'drainage'
export type EngineeringStandard = 'KRDM2017' | 'KeRRA'
export type RoadClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'J' | 'K' | 'L' | 'M' | 'N' | 'P'
export type TerrainType = 'flat' | 'rolling' | 'mountainous' | 'escarpment'
export type PipeMaterial = 'HDPE' | 'Concrete' | 'uPVC' | 'VCP'
export type GradientStatus = 'POSITIVE' | 'ZERO' | 'ADVERSE'
export type StepStatus = 'locked' | 'pending' | 'in_progress' | 'complete'

export interface EngineeringData {
  mode: EngineeringMode
  standard: EngineeringStandard
  road?: RoadDesignData
  roadFieldPlan?: RoadFieldPlan
  drainage?: DrainageData
  /** Standalone pipe-network draft, stored separately from surveyed drainage records. */
  pipeNetwork?: PipeNetworkProjectData
}

export type RoadFieldFeatureCode =
  | 'CL'
  | 'LE'
  | 'RE'
  | 'SHL'
  | 'SHR'
  | 'DITCH_L'
  | 'DITCH_R'
  | 'CULV_IN'
  | 'CULV_OUT'
  | 'ACCESS'
  | 'BREAKLINE'

/** User-authored field instructions; values are never inferred from a road standard. */
export interface RoadFieldPlan {
  startChainageM: number
  endChainageM: number
  stationIntervalM: number
  leftExtentM: number | null
  rightExtentM: number | null
  projectCrs: string
  controlReference: string
  featureCodes: RoadFieldFeatureCode[]
}

export interface RoadDesignData {
  roadName: string
  startChainage: number
  datum: string
  coordinateSystem: string
  designSpeed: number
  roadClass: RoadClass
  terrainType?: TerrainType
  standard?: EngineeringStandard

  ips: IntersectionPoint[]
  vips: VerticalIP[]
  /** Operator-selected design sampling interval; absence uses saved/critical chainages only. */
  verticalStationIntervalM?: number
  crossSectionTemplate: CrossSectionTemplate
  stations: StationData[]

  horizontalAlignment?: HorizontalAlignmentResult[]
  verticalAlignment?: VerticalAlignmentResult[]
  earthworksTable?: EarthworksRow[]
}

export interface IntersectionPoint {
  id: string
  name: string
  easting: number
  northing: number
  radius: number
  deflectionAngle?: number
  tangentLength?: number
  arcLength?: number
  chainageTC?: number
  chainageMC?: number
  chainageCT?: number
  sortOrder?: number
  hasTransition?: boolean
  transitionLengthIn?: number
  transitionLengthOut?: number
  spiralParameters?: Record<string, unknown>
  computed?: boolean
}

export interface VerticalIP {
  id: string
  chainage: number
  reducedLevel: number
  kValue?: number
  gradientIn?: number
  gradientOut?: number
  curveLength?: number
  sortOrder?: number
  computed?: boolean
}

export interface CrossSectionTemplate {
  carriagewayWidth: number
  shoulderWidth: number
  cutSlope: string
  fillSlope: string
  camber: number
  subgradeDepth: number
  /** Operator-entered shoulder crossfall percent; absence means unassessed. */
  shoulderCrossfall?: number
}

export interface StationData {
  chainage: number
  groundLevel: number
  designLevel?: number
  /** Explicit target source; omitted retains the manually entered design RL. */
  designLevelSource?: 'manual' | 'vertical-alignment'
  /** Measured offset/RL ground observations; offsets negative left, positive right. */
  groundProfile?: Array<{ offset: number; level: number }>
  cutArea?: number
  fillArea?: number
  sortOrder?: number
}

export interface HorizontalAlignmentResult {
  ipId: string
  deflectionAngle: number
  tangentLength: number
  arcLength: number
  chainageTC: number
  chainageMC: number
  chainageCT: number
}

export interface VerticalAlignmentResult {
  vipId: string
  gradientIn: number
  gradientOut: number
  algebraicDifference: number
  kValue: number
  curveLength: number
  highLowPoint?: {
    chainage: number
    level: number
  }
}

export interface EarthworksRow {
  chainage: number
  cutArea: number
  fillArea: number
  cutVolume: number
  fillVolume: number
  cumulativeCut: number
  cumulativeFill: number
  method?: string
  netVolume?: number
  massOrdinate?: number
}

export interface DrainageData {
  manholes: Manhole[]
  pipeRuns?: PipeRun[]
  /** Explicit projected CRS for coordinates entered in the drainage schedule. */
  projectCrs?: string
  /** Project specification criterion; null/blank means no cover assessment. */
  minimumCoverM?: number
  /** Field schedule interval along the entered pipe alignment in projected metres. */
  setoutIntervalM?: number
  /** Optional chainage applied at the beginning of this schedule. */
  setoutStartChainageM?: number
  /** User-transcribed project criteria; never replaced with a METARDU default. */
  setoutToleranceProfile?: import('@/lib/engineering/setoutToleranceProfile').SetoutToleranceProfileDraft
}

export interface Manhole {
  id: string
  name: string
  chainage?: number
  easting?: number
  northing?: number
  coverLevel?: number
  invertLevelIn?: number
  invertLevelOut?: number
  pipeDiameterOut?: number
  pipeOutsideDiameterOut?: number
  pipeMaterial?: PipeMaterial
  pipeManningN?: number
  designFlowOutLs?: number
  depth?: number
  /** Optional intermediate plan vertices for the outgoing pipe alignment, in project CRS coordinates. */
  alignmentVerticesOut?: Array<{ easting: number; northing: number }>
  /** Provenance for an alignment imported from a saved map line. */
  alignmentSourceOut?: DrainageMapAlignmentSource
}

export interface PipeRun {
  fromMH: string
  toMH: string
  length: number
  gradient: number
  velocity: number
  fullBoreCapacity: number
  gradientStatus: GradientStatus
  internalDiameterMm: number
  material: PipeMaterial
  manningN: number
  designFlowLs?: number
  partialFlow?: PartialFlowResult
  capacityStatus:
    | 'No design flow supplied'
    | 'Within supplied full-bore capacity'
    | 'Above full-bore rate; near-crown free-surface flow'
    | 'Exceeds open-channel capacity; pressure-flow analysis required'
}

export interface HorizontalCurveInput {
  bearing1: number
  bearing2: number
  radius: number
  chainageIP: number
}

export interface VerticalCurveInput {
  chainageA: number
  levelA: number
  chainageVIP: number
  levelVIP: number
  chainageB: number
  levelB: number
}

export interface SuperelevationInput {
  designSpeed: number
  radius: number
}

export interface SightDistanceInput {
  designSpeed: number
  standard: EngineeringStandard
}
