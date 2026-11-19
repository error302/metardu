export type FieldbookType = 'leveling' | 'traverse' | 'control'

export type SaveStatus = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; when: string; message?: string } | { kind: 'error'; message: string }

/** Shared session header: one header per field book, visible on every observation tab. */
export type FieldbookSession = {
  date: string
  party: string
  instrumentMake: string
  instrumentModel: string
  instrumentSerial: string
  calibrationDate: string
  calibrationReference: string
  weather: string
  units: 'metres' | 'feet'
  crs: string
}

export const EMPTY_FIELDBOOK_SESSION: FieldbookSession = {
  date: '',
  party: '',
  instrumentMake: '',
  instrumentModel: '',
  instrumentSerial: '',
  calibrationDate: '',
  calibrationReference: '',
  weather: '',
  units: 'metres',
  crs: '',
}

/**
 * Sketch/photo attachment for one observation page. The image is stored as a
 * downscaled data URL so the book stays portable offline; it is field evidence,
 * not survey control.
 */
export type FieldbookAttachment = {
  id: string
  page: FieldbookType
  kind: 'sketch' | 'photo'
  name: string
  note: string
  dataUrl: string
  capturedAt: string
  capturedBy: string
}

export type SavedFieldbook = {
  id: string
  type: FieldbookType
  name: string
  updated_at?: string
  created_at?: string
  data: Record<string, unknown>
  user_id?: string
  project_id?: string
  localEditId?: string
  _origin?: 'server' | 'device'
}

/** Rejection fields shared by every observation row. Rows are never deleted. */
export type RowAudit = {
  /** Rejected rows are struck through, excluded from computation, and kept in the audit trail. */
  rejected?: boolean
  rejectedReason?: string
  rejectedAt?: string
  rejectedBy?: string
}

export type LevelRow = RowAudit & {
  id: string
  station: string
  bs: string
  is: string
  fs: string
  remarks: string
  createdAt?: string
  updatedAt?: string
}
export type TravRow = RowAudit & {
  id: string
  station: string
  bearing: string
  hclDeg: string; hclMin: string; hclSec: string
  hcrDeg: string; hcrMin: string; hcrSec: string
  slopeDist: string
  vaDeg: string; vaMin: string; vaSec: string
  ih: string; th: string
  remarks: string
}
export type ControlRow = RowAudit & {
  id: string
  pointId: string
  instrumentHeight: string
  targetHeight: string
  bearing: string
  verticalAngle: string
  slopeDistance: string
  remarks: string
}
export type ControlSetup = {
  id: string
  station: { name: string; e: string; n: string; z: string }
  rows: ControlRow[]
}

export type ControlStation = { name: string; e: string; n: string; z: string }
