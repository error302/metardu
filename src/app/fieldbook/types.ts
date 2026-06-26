export type FieldbookType = 'leveling' | 'traverse' | 'control' | 'hydrographic' | 'mining'

export type SaveStatus = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; when: string } | { kind: 'error'; message: string }

export type SavedFieldbook = {
  id: string
  type: FieldbookType
  name: string
  updated_at?: string
  created_at?: string
  data: Record<string, unknown>
}

export type LevelRow = { id: string; station: string; bs: string; is: string; fs: string; remarks: string }
export type TravRow = {
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
export type ControlRow = {
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
export type HydroRow = { id: string; soundingId: string; easting: string; northing: string; depth: string; tide: string; remarks: string }
export type MiningRow = { id: string; pointId: string; bearing: string; verticalAngle: string; slopeDistance: string; remarks: string }

export type ControlStation = { name: string; e: string; n: string; z: string }
