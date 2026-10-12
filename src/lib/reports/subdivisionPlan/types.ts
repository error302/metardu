/** User-entered metadata and geometry for a draft subdivision plan. */

export interface PlanPoint2D {
  easting: number
  northing: number
}

export interface SubdivisionPortion {
  id: string
  label: string
  areaHa: number           // Display value is recalculated from boundaryPoints when rendered.
  areaSqM?: number
  user?: string            // User-entered land-use description; not verified.
  boundaryPoints: PlanPoint2D[]
  fillColor?: string       // Optional SVG hex fill color; renderer sanitizes this value.
}

export interface SchemeRoadReserve {
  label: string
  widthM: number
  /** Surveyed/calculated corridor rings; without these the reserve is metadata only. */
  boundaryRings?: PlanPoint2D[][]
  startPoint?: PlanPoint2D
  endPoint?: PlanPoint2D
  direction?: 'N' | 'S' | 'E' | 'W' | 'frontage' | 'access'
}

export interface RoadTruncation {
  atJunction: string       // e.g. "Main Access / 15M Reserve"
  widthM: number           // Road width (e.g. 9 or 15)
  truncationM: number      // Half road width (e.g. 4.5 or 7.5)
}

export interface CadastralAbuttal {
  direction: 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW'
  label: string            // e.g. "Abbutal i.e KER/...."
}

export interface LocationPlanInset {
  landmarkName: string     // e.g. "PRY SCHOOL / CENTRE"
  nearbyParcels: string[]  // e.g. ["KER/..", "KER/..", "KER/.."]
  accessRoadLabel: string  // e.g. "30M Road Reserve"
}

export interface SchemeOwner {
  name: string
  address: string
  idNo: string
  signatureDate?: string
}

export interface SchemePlanner {
  name: string
  address: string
  rppNo: string            // Registered Physical Planner No.
  signatureDate?: string
}

export interface SchemeSurveyor {
  name: string
  address: string
  lsNo: string              // Licensed Surveyor No.
  signatureDate?: string
}

export interface SubdivisionPlanData {
  /** Registered project coordinate system used for all plan geometry. */
  projectCrs?: string
  countyName: string
  parcelNumber: string
  ward: string
  location: string
  userCategory: string
  portions: SubdivisionPortion[]
  roadReserves: SchemeRoadReserve[]
  truncations: RoadTruncation[]
  abuttals: CadastralAbuttal[]
  locationPlan: LocationPlanInset
  owner: SchemeOwner
  planner: SchemePlanner
  surveyor: SchemeSurveyor
  notes?: string[]
}

