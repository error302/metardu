export interface DetailTolerance {
  feature: string
  xy: string
  z: string
  fieldUse: string
}

export const RDM_DETAIL_TOLERANCES: DetailTolerance[] = [
  {
    feature: 'Structures, buildings, paved roads',
    xy: '+/-0.025 m',
    z: '+/-0.015 m',
    fieldUse: 'Building corners, kerbs, paved carriageway edges, drainage structures',
  },
  {
    feature: 'Gravel pavements',
    xy: '+/-0.050 m',
    z: '+/-0.025 m',
    fieldUse: 'Gravel shoulders, unpaved access roads, compacted formation surfaces',
  },
  {
    feature: 'All other areas',
    xy: '+/-0.100 m',
    z: '+/-0.050 m',
    fieldUse: 'Open ground, vegetation breaks, general topographic spot levels',
  },
]

export const MOBILISATION_SECTIONS = [
  'Introduction',
  'Health and safety considerations',
  'Personnel',
  'Equipment',
  'Calibration',
  'Field forms',
  'Miscellaneous',
]

export const CONTROL_MARK_REGISTER_COLUMNS = [
  'Mark ID',
  'Type',
  'Order',
  'Easting (m)',
  'Northing (m)',
  'Elevation (m)',
  'Description',
  'Condition',
  'Photo / Sketch Ref',
  'Witness / Recovery Notes',
]

// PHASE13_DEMO_PROJECTS removed — demo seed data no longer needed
