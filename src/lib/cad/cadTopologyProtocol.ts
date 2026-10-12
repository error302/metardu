import type { CADBeacon, CADBoundary, CADDocument } from '@/components/cad-editor/CADEditor'
import type { CrsInfo } from '@/lib/spatial/projectCrs'

export type CadTopologyInput = Pick<CADDocument, 'width' | 'height' | 'metersPerPixel' | 'originEasting' | 'originNorthing' | 'coordinateReferenceSystem'> & {
  registeredCrs?: {info:CrsInfo;def:string}
  beacons: Array<Pick<CADBeacon, 'id' | 'label' | 'x' | 'y' | 'easting' | 'northing'>>
  boundaries: Array<Pick<CADBoundary, 'id' | 'fromId' | 'toId' | 'type'>>
}
export interface CadTopologyResult {
  status: 'empty' | 'open' | 'closed' | 'mixed' | 'invalid'
  basis: 'project-grid' | 'scaled-drawing' | 'unscaled-drawing' | 'invalid-reference'
  faces: Array<{ areaM2: number | null; perimeterM: number | null; rings: Array<Array<{ easting: number; northing: number }>> }>
  networkLengthM: number | null
  totalAreaM2: number | null
  totalAreaHa: number | null
  totalAreaAcres: number | null
  unenclosedEdgeCount: number
  issues: string[]
  measurements: Array<Pick<CADBoundary, 'id' | 'bearing' | 'bearingDeg' | 'distance' | 'distanceM'>>
}
export type CadTopologyResponse = { revision: number; result: CadTopologyResult } | { revision: number; error: string }
