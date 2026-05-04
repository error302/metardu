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

export const PHASE13_DEMO_PROJECTS = {
  topographicRoad: {
    projectName: 'Kangundo Road Junction Improvement Topographic Survey',
    clientName: 'County Government of Machakos',
    surveyorName: 'Eng. Amina W. Njoroge',
    regNo: 'RS149',
    iskNo: 'ISK-2217',
    submissionNo: 'RS149_2026_002_R00',
    instrument: 'Leica TS16 I 1" / Leica LS15 Digital Level',
    county: 'Machakos',
    location: 'Kangundo Road, Joska - Malaa section',
  },
  cadastral: {
    projectName: 'Subdivision Survey for L.R. No. Kajiado/Kaputiei North/18462',
    clientName: 'Kaputiei Holdings Ltd',
    surveyorName: 'Samuel K. Muriithi',
    regNo: 'RS087',
    iskNo: 'ISK-1402',
    submissionNo: 'RS087_2026_014_R00',
    instrument: 'Trimble R12i GNSS / S7 Total Station',
    county: 'Kajiado',
    location: 'Kitengela, Kajiado County',
  },
  engineeringControl: {
    projectName: 'Athi River Industrial Park Control Extension',
    clientName: 'Kenya Urban Roads Authority',
    surveyorName: 'Faith A. Otieno',
    regNo: 'RS233',
    iskNo: 'ISK-3189',
    submissionNo: 'RS233_2026_006_R01',
    instrument: 'Trimble SX12 Scanning Total Station',
    county: 'Machakos',
    location: 'Athi River Industrial Park',
  },
}
