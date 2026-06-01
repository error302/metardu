/**
 * Form No. 3 Mutation Survey Plan — Type Definitions
 *
 * Data contract for rendering Kenya cadastral mutation survey plans
 * per Survey Act Cap. 299 and Survey Regulations 1994.
 *
 * Source: RDM 1.1 §5 (Mutation Forms), Kenya Director of Surveys
 */

// ─── Plot types ─────────────────────────────────────────────────────────────

export interface MutationPlot {
  /** Plot identifier, e.g. "a1", "b23", "c5a" */
  id: string
  /** Parent plot id when this is a sub-division, e.g. "a1" is parent of "a1a", "a1b" */
  parentId?: string
  /** Boundary vertices in survey coordinates (m) */
  boundaryPoints: Array<{ easting: number; northing: number; beacon?: string }>
  /** Area in hectares */
  area_ha: number
  /** If true, suffix label with "(Approx)" */
  isApprox: boolean
  /** Series group label */
  seriesLabel: string
}

// ─── Parent parcel ──────────────────────────────────────────────────────────

export interface ParentParcel {
  /** Parent parcel identifier, e.g. "LR No. 12345/6" */
  id: string
  /** Display label for the parent plot */
  label: string
  /** Boundary vertices in survey coordinates (m) */
  boundaryPoints: Array<{ easting: number; northing: number; beacon?: string }>
  /** Area in hectares */
  area_ha: number
}

// ─── Road corridor ──────────────────────────────────────────────────────────

export interface RoadCorridor {
  /** Road identifier */
  id: string
  /** Road width in metres (9 | 12 | 15) */
  width_m: number
  /** Display label, e.g. "15M WIDE ROAD" */
  label: string
  /** Bearing along road centreline, e.g. "12° 35\"" */
  bearing_dms?: string
  /** Centreline polyline in survey coordinates (m) */
  centerline: Array<{ easting: number; northing: number }>
}

// ─── Survey monuments ───────────────────────────────────────────────────────

export interface SurveyMonument {
  /** Monument identifier, e.g. "M1" | "M2" ... "M10" */
  id: string
  /** Easting in metres */
  easting: number
  /** Northing in metres */
  northing: number
  /** Control monument vs intermediate traverse point */
  type: 'control' | 'intermediate'
}

// ─── Bearing schedule ───────────────────────────────────────────────────────

export interface BearingScheduleEntry {
  /** Unique line identifier */
  lineId: string
  /** From beacon label */
  from: string
  /** To beacon label */
  to: string
  /** Whole-circle bearing in DMS format */
  bearing_dms: string
  /** Horizontal distance in metres */
  distance_m: number
}

// ─── Root data structure ────────────────────────────────────────────────────

export interface MutationPlanData {
  project: {
    /** Scheme / development name */
    name: string
    /** General location description */
    location: string
    /** Nearest town or locality */
    locality: string
    /** Land registration district */
    registrationDistrict: string
    /** Cadastral sheet reference */
    cadastralSheet: string
    /** RIM file reference */
    rimReference: string
    /** Folio number */
    folioNumber: string
    /** Register number */
    registerNumber: string
    /** Scale denominator, e.g. 1000 for 1:1,000 */
    scale: number
    /** Coordinate reference system datum */
    datum: 'ARC1960' | 'WGS84'
    /** UTM zone number (typically 37 for Kenya) */
    utmZone: number
    /** Hemisphere */
    hemisphere: 'S'
    /** Licensed surveyor name */
    surveyor_name: string
    /** Surveyor licence number */
    surveyor_licence: string
    /** Survey / plan date (ISO string or formatted) */
    date: string
    /** Optional transaction references */
    transactions?: string
  }
  /** Outer scheme boundary polygon (m) */
  schemeBoundary: Array<{ easting: number; northing: number }>
  /** Individual mutation plots */
  plots: MutationPlot[]
  /** Road corridors within the scheme */
  roads: RoadCorridor[]
  /** Survey control monuments */
  monuments: SurveyMonument[]
  /** Bearing & distance schedule for all lines */
  bearingSchedule: BearingScheduleEntry[]
  /** Optional parent parcel for area reconciliation */
  parentParcel?: ParentParcel
  /** Grid / graticule configuration */
  grid: {
    minE: number
    maxE: number
    minN: number
    maxN: number
    /** Grid line spacing easting (m) — typically 200 */
    intervalE: number
    /** Grid line spacing northing (m) — typically 200 */
    intervalN: number
  }
}
