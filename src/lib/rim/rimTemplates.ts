// ============================================================
// METARDU — RIM Collection / Template Library
// Pre-built Resurvey and Index Map templates for common
// Kenya cadastral scenarios.
//
// Survey Act Cap 299, Survey Regulations L.N. 168/1994
// Land Registration Act 2012, Community Land Act 2016
// ============================================================

import type { RimSection, RimParcel, RimBeacon } from '@/lib/rim'

// ────────────────────────────────────────────────────────────
// Template Interface
// ────────────────────────────────────────────────────────────

export interface RimTemplate {
  id: string
  name: string
  description: string
  category: string // 'urban' | 'agricultural' | 'pastoral' | 'institutional' | 'coastal' | 'special'
  tags: string[]

  // Default section config
  defaults: {
    datum: string
    projection: string
    scale: string
    registry: string
  }

  // Sample beacons (template positions)
  sampleBeacons: Array<{
    beaconNumber: string
    easting: number
    northing: number
    description: string
    type: string
  }>

  // Sample parcels
  sampleParcels: Array<{
    parcelNumber: string
    area: number
    landUse: string
    ownerName: string
    isLandmark: boolean
  }>

  // Boundary lines connecting beacons
  sampleBoundaries: Array<{
    from: string
    to: string
    bearing: string
    distance: string
  }>

  // Survey Act regulation reference
  regulationReference: string
}

// ────────────────────────────────────────────────────────────
// Template Data
// ────────────────────────────────────────────────────────────

export const RIM_TEMPLATES: RimTemplate[] = [
  // ──────────────────────────────────────────────────────────
  // 1. Urban Residential Section
  // ──────────────────────────────────────────────────────────
  {
    id: 'urban-residential-section',
    name: 'Urban Residential Section',
    description:
      'Regular grid of residential plots in a town layout. Suitable for planned urban areas such as Machakos, Nakuru, Kisumu, or satellite towns around Nairobi. Typical plot sizes 50×100 ft (0.046 Ha) to ¼ acre (0.101 Ha).',
    category: 'urban',
    tags: [
      'residential',
      'town',
      'plots',
      'grid',
      'quarter-acre',
      'eighth-acre',
      'urban',
      'machakos',
      'nakuru',
    ],
    defaults: {
      datum: 'Arc 1960',
      projection: 'UTM Zone 37S',
      scale: '1:2500',
      registry: 'Machakos',
    },
    sampleBeacons: [
      { beaconNumber: 'A1', easting: 378412.500, northing: 9962534.200, description: 'Concrete pillar at NW corner of Section', type: 'Pillar' },
      { beaconNumber: 'A2', easting: 378612.500, northing: 9962534.200, description: 'Concrete pillar at NE corner of Section', type: 'Pillar' },
      { beaconNumber: 'A3', easting: 378612.500, northing: 9962334.200, description: 'Concrete pillar at SE corner of Section', type: 'Pillar' },
      { beaconNumber: 'A4', easting: 378412.500, northing: 9962334.200, description: 'Concrete pillar at SW corner of Section', type: 'Pillar' },
      { beaconNumber: 'B1', easting: 378412.500, northing: 9962434.200, description: 'Concrete pillar, internal grid intersection', type: 'Pillar' },
      { beaconNumber: 'B2', easting: 378612.500, northing: 9962434.200, description: 'Concrete pillar, internal grid intersection', type: 'Pillar' },
      { beaconNumber: 'C1', easting: 378512.500, northing: 9962534.200, description: 'Concrete pillar, mid-north boundary', type: 'Pillar' },
      { beaconNumber: 'C2', easting: 378512.500, northing: 9962334.200, description: 'Concrete pillar, mid-south boundary', type: 'Pillar' },
      { beaconNumber: 'D1', easting: 378512.500, northing: 9962434.200, description: 'Concrete pillar, centre intersection', type: 'Pillar' },
    ],
    sampleParcels: [
      { parcelNumber: '11738/310', area: 0.0460, landUse: 'Residential', ownerName: 'KAMAU J. MWANGI', isLandmark: false },
      { parcelNumber: '11738/311', area: 0.0460, landUse: 'Residential', ownerName: 'ODERA S. PAUL', isLandmark: false },
      { parcelNumber: '11738/312', area: 0.0460, landUse: 'Residential', ownerName: 'MWANGI P. KAMAU', isLandmark: false },
      { parcelNumber: '11738/313', area: 0.1012, landUse: 'Residential', ownerName: 'NJERI W. KIBERA', isLandmark: false },
      { parcelNumber: '11738/314', area: 0.0230, landUse: 'Residential', ownerName: 'MUTHONI A. KARIUKI', isLandmark: false },
      { parcelNumber: '11738/315', area: 0.0500, landUse: 'Open Space', ownerName: 'Machakos County Council', isLandmark: true },
      { parcelNumber: '11738/316', area: 0.0810, landUse: 'Road Reserve', ownerName: 'KeNHA', isLandmark: true },
    ],
    sampleBoundaries: [
      { from: 'A1', to: 'C1', bearing: '90°00\'00"', distance: '100.000 m' },
      { from: 'C1', to: 'A2', bearing: '90°00\'00"', distance: '100.000 m' },
      { from: 'A2', to: 'B2', bearing: '180°00\'00"', distance: '100.000 m' },
      { from: 'B2', to: 'A3', bearing: '180°00\'00"', distance: '100.000 m' },
      { from: 'A3', to: 'C2', bearing: '270°00\'00"', distance: '100.000 m' },
      { from: 'C2', to: 'A4', bearing: '270°00\'00"', distance: '100.000 m' },
      { from: 'A4', to: 'B1', bearing: '0°00\'00"', distance: '100.000 m' },
      { from: 'B1', to: 'A1', bearing: '0°00\'00"', distance: '100.000 m' },
      { from: 'B1', to: 'D1', bearing: '90°00\'00"', distance: '100.000 m' },
      { from: 'D1', to: 'B2', bearing: '90°00\'00"', distance: '100.000 m' },
    ],
    regulationReference: 'Survey Act Cap 299 Sec. 15; Survey Regulations L.N. 168/1994 Reg. 20(1) — Town Survey',
  },

  // ──────────────────────────────────────────────────────────
  // 2. Agricultural Farm Block
  // ──────────────────────────────────────────────────────────
  {
    id: 'agricultural-farm-block',
    name: 'Agricultural Farm Block',
    description:
      'Large agricultural parcels typical of Rift Valley, Uasin Gishu, and Trans Nzoia farm blocks. Plots range from 5 acres (2.02 Ha) to 100+ acres (40.47 Ha). Originally surveyed as part of the Million Acre Settlement Scheme or post-independence settlement.',
    category: 'agricultural',
    tags: [
      'agricultural',
      'farm',
      'rift-valley',
      'large-parcel',
      'wheat',
      'maize',
      'dairy',
      'uasin-gishu',
      'trans-nzoia',
    ],
    defaults: {
      datum: 'Arc 1960',
      projection: 'UTM Zone 36S',
      scale: '1:5000',
      registry: 'Eldoret',
    },
    sampleBeacons: [
      { beaconNumber: 'T1', easting: 712450.300, northing: 9975821.500, description: 'Concrete pillar, trig station on hilltop', type: 'Pillar' },
      { beaconNumber: 'T2', easting: 713850.300, northing: 9975815.700, description: 'Concrete pillar, farm road junction', type: 'Pillar' },
      { beaconNumber: 'T3', easting: 713862.100, northing: 9973918.200, description: 'Concrete pillar, river crossing boundary', type: 'Pillar' },
      { beaconNumber: 'T4', easting: 712438.800, northing: 9973925.400, description: 'Concrete pillar, fence line corner', type: 'Pillar' },
      { beaconNumber: 'T5', easting: 713150.000, northing: 9975818.000, description: 'Concrete pillar, internal subdivision corner', type: 'Pillar' },
      { beaconNumber: 'T6', easting: 713155.000, northing: 9973920.000, description: 'Concrete pillar, internal subdivision corner', type: 'Pillar' },
      { beaconNumber: 'T7', easting: 712443.000, northing: 9974873.000, description: 'Concrete pillar, west boundary mid-point', type: 'Pillar' },
      { beaconNumber: 'T8', easting: 713858.000, northing: 9974868.000, description: 'Concrete pillar, east boundary mid-point', type: 'Pillar' },
    ],
    sampleParcels: [
      { parcelNumber: 'Eldoret/Kapsaret/Block 3/45', area: 8.0940, landUse: 'Agricultural', ownerName: 'KOECH ARAP BII', isLandmark: false },
      { parcelNumber: 'Eldoret/Kapsaret/Block 3/46', area: 12.1410, landUse: 'Agricultural', ownerName: 'CHEPKOECH S. LAGAT', isLandmark: false },
      { parcelNumber: 'Eldoret/Kapsaret/Block 3/47', area: 20.2350, landUse: 'Agricultural', ownerName: 'RUTTO C. KIPYEGON', isLandmark: false },
      { parcelNumber: 'Eldoret/Kapsaret/Block 3/48', area: 5.0000, landUse: 'Homestead', ownerName: 'CHERUIYOT P. KOSGEI', isLandmark: false },
      { parcelNumber: 'Eldoret/Kapsaret/Block 3/49', area: 40.4686, landUse: 'Agricultural', ownerName: 'SANG D. KIPROP', isLandmark: false },
      { parcelNumber: 'Eldoret/Kapsaret/Block 3/50', area: 2.0230, landUse: 'Road Reserve', ownerName: 'County Government of Uasin Gishu', isLandmark: true },
      { parcelNumber: 'Eldoret/Kapsaret/Block 3/51', area: 4.0469, landUse: 'River Reserve', ownerName: 'Water Resources Authority', isLandmark: true },
    ],
    sampleBoundaries: [
      { from: 'T1', to: 'T2', bearing: '89°55\'30"', distance: '1400.020 m' },
      { from: 'T2', to: 'T3', bearing: '180°12\'45"', distance: '1897.540 m' },
      { from: 'T3', to: 'T4', bearing: '270°03\'15"', distance: '1423.310 m' },
      { from: 'T4', to: 'T1', bearing: '0°08\'22"', distance: '1896.100 m' },
      { from: 'T5', to: 'T6', bearing: '180°10\'00"', distance: '1898.000 m' },
      { from: 'T1', to: 'T7', bearing: '180°01\'30"', distance: '948.500 m' },
      { from: 'T2', to: 'T8', bearing: '180°11\'15"', distance: '947.700 m' },
      { from: 'T7', to: 'T8', bearing: '89°58\'00"', distance: '1415.000 m' },
    ],
    regulationReference: 'Survey Act Cap 299 Sec. 19; Survey Regulations L.N. 168/1994 Reg. 18 — Agricultural Land Survey; Land Registration Act 2012 Sec. 28',
  },

  // ──────────────────────────────────────────────────────────
  // 3. Pastoral Community Land
  // ──────────────────────────────────────────────────────────
  {
    id: 'pastoral-community-land',
    name: 'Pastoral Community Land',
    description:
      'Large open areas designated for pastoral use under the Community Land Act 2016. Typical of Kajiado, Laikipia, Samburu, and Turkana counties. Parcels are extremely large (500–50,000 Ha) with irregular natural boundaries defined by rivers, hills, and traditional grazing territories.',
    category: 'pastoral',
    tags: [
      'pastoral',
      'community',
      'group-ranch',
      'grazing',
      'kajiado',
      'laikipia',
      'maasai',
      'samburu',
      'turkana',
      'community-land',
    ],
    defaults: {
      datum: 'Arc 1960',
      projection: 'UTM Zone 37S',
      scale: '1:10000',
      registry: 'Kajiado',
    },
    sampleBeacons: [
      { beaconNumber: 'GR-A1', easting: 487234.600, northing: 9932156.300, description: 'Concrete pillar at Ol Doinyo ridge', type: 'Pillar' },
      { beaconNumber: 'GR-A2', easting: 512845.200, northing: 9931890.400, description: 'Concrete pillar at spring point', type: 'Pillar' },
      { beaconNumber: 'GR-A3', easting: 515678.900, northing: 9911245.800, description: 'Concrete pillar at Acacia nilotica tree', type: 'Pillar' },
      { beaconNumber: 'GR-A4', easting: 488123.500, northing: 9910890.100, description: 'Concrete pillar at dry river bed crossing', type: 'Pillar' },
      { beaconNumber: 'GR-A5', easting: 500040.300, northing: 9932020.000, description: 'Concrete pillar, northern boundary', type: 'Pillar' },
      { beaconNumber: 'GR-A6', easting: 501900.500, northing: 9911068.000, description: 'Concrete pillar, southern boundary', type: 'Pillar' },
      { beaconNumber: 'GR-A7', easting: 487679.100, northing: 9921523.200, description: 'Concrete pillar, western boundary mid', type: 'Pillar' },
      { beaconNumber: 'GR-A8', easting: 514262.100, northing: 9921568.000, description: 'Concrete pillar, eastern boundary mid', type: 'Pillar' },
      { beaconNumber: 'GR-BM1', easting: 500000.000, northing: 9921544.000, description: 'Trigonometrical beacon, group ranch centre', type: 'Pillar' },
    ],
    sampleParcels: [
      { parcelNumber: 'Kajiado/Olkiramatian/Group Ranch/1', area: 8560.000, landUse: 'Pastoral Grazing', ownerName: 'Olkiramatian Group Ranch', isLandmark: false },
      { parcelNumber: 'Kajiado/Olkiramatian/Group Ranch/2', area: 2340.500, landUse: 'Dry Season Grazing Reserve', ownerName: 'Olkiramatian Group Ranch', isLandmark: true },
      { parcelNumber: 'Kajiado/Olkiramatian/Group Ranch/3', area: 120.000, landUse: 'Manyatta (Homestead Cluster)', ownerName: 'Olkiramatian Group Ranch', isLandmark: false },
      { parcelNumber: 'Kajiado/Olkiramatian/Group Ranch/4', area: 450.000, landUse: 'Water Point Reserve', ownerName: 'Olkiramatian Group Ranch', isLandmark: true },
      { parcelNumber: 'Kajiado/Olkiramatian/Group Ranch/5', area: 6200.000, landUse: 'Wildlife Corridor', ownerName: 'Kajiado County Government', isLandmark: true },
      { parcelNumber: 'Kajiado/Olkiramatian/Group Ranch/6', area: 45.000, landUse: 'Community School', ownerName: 'Olkiramatian Group Ranch', isLandmark: false },
    ],
    sampleBoundaries: [
      { from: 'GR-A1', to: 'GR-A5', bearing: '87°32\'10"', distance: '12806.200 m' },
      { from: 'GR-A5', to: 'GR-A2', bearing: '92°15\'44"', distance: '12812.400 m' },
      { from: 'GR-A2', to: 'GR-A8', bearing: '179°45\'22"', distance: '10321.800 m' },
      { from: 'GR-A8', to: 'GR-A3', bearing: '182°08\'15"', distance: '10323.600 m' },
      { from: 'GR-A3', to: 'GR-A6', bearing: '268°12\'05"', distance: '14387.200 m' },
      { from: 'GR-A6', to: 'GR-A4', bearing: '271°22\'33"', distance: '13977.800 m' },
      { from: 'GR-A4', to: 'GR-A7', bearing: '359°18\'12"', distance: '10633.100 m' },
      { from: 'GR-A7', to: 'GR-A1', bearing: '0°24\'48"', distance: '10633.400 m' },
    ],
    regulationReference: 'Community Land Act 2016 Sec. 12 & 26; Survey Act Cap 299 Sec. 15A; Survey Regulations L.N. 168/1994 Reg. 23 — Community Land Survey',
  },

  // ──────────────────────────────────────────────────────────
  // 4. Institutional Land
  // ──────────────────────────────────────────────────────────
  {
    id: 'institutional-land',
    name: 'Institutional Land',
    description:
      'Schools, hospitals, government offices, churches, and other institutional parcels. Typically gazetted under various acts and held in trust by County Governments or specific government ministries. Includes public utility reserves.',
    category: 'institutional',
    tags: [
      'institutional',
      'school',
      'hospital',
      'government',
      'church',
      'gazette',
      'public-land',
      'trust-land',
      'county',
    ],
    defaults: {
      datum: 'Arc 1960',
      projection: 'UTM Zone 37S',
      scale: '1:2500',
      registry: 'Nairobi',
    },
    sampleBeacons: [
      { beaconNumber: 'INST-1', easting: 531245.780, northing: 9982134.560, description: 'Concrete pillar at main gate entrance', type: 'Pillar' },
      { beaconNumber: 'INST-2', easting: 531723.450, northing: 9982156.320, description: 'Concrete pillar, NE corner adjacent to road', type: 'Pillar' },
      { beaconNumber: 'INST-3', easting: 531698.120, northing: 9981767.890, description: 'Concrete pillar at sports field corner', type: 'Pillar' },
      { beaconNumber: 'INST-4', easting: 531267.340, northing: 9981745.230, description: 'Concrete pillar at staff quarters fence', type: 'Pillar' },
      { beaconNumber: 'INST-5', easting: 531485.000, northing: 9982145.000, description: 'Concrete pillar, administration block corner', type: 'Pillar' },
      { beaconNumber: 'INST-6', easting: 531480.000, northing: 9981756.000, description: 'Concrete pillar, playground corner', type: 'Pillar' },
    ],
    sampleParcels: [
      { parcelNumber: '209/12156', area: 3.5000, landUse: 'Institutional — Secondary School', ownerName: 'Ministry of Education', isLandmark: true },
      { parcelNumber: '209/12157', area: 0.8200, landUse: 'Institutional — Staff Quarters', ownerName: 'Teachers Service Commission', isLandmark: false },
      { parcelNumber: '209/12158', area: 0.2000, landUse: 'Institutional — Dispensary', ownerName: 'Ministry of Health', isLandmark: true },
      { parcelNumber: '209/12159', area: 0.0500, landUse: 'Road Reserve — Access Road', ownerName: 'Kenya Urban Roads Authority', isLandmark: true },
      { parcelNumber: '209/12160', area: 1.2000, landUse: 'Institutional — Playground', ownerName: 'County Government of Nairobi', isLandmark: false },
    ],
    sampleBoundaries: [
      { from: 'INST-1', to: 'INST-2', bearing: '85°12\'30"', distance: '477.670 m' },
      { from: 'INST-2', to: 'INST-3', bearing: '181°45\'22"', distance: '388.430 m' },
      { from: 'INST-3', to: 'INST-4', bearing: '264°30\'15"', distance: '430.780 m' },
      { from: 'INST-4', to: 'INST-1', bearing: '1°15\'48"', distance: '389.330 m' },
      { from: 'INST-1', to: 'INST-5', bearing: '84°00\'00"', distance: '239.220 m' },
      { from: 'INST-5', to: 'INST-6', bearing: '180°30\'00"', distance: '389.000 m' },
      { from: 'INST-6', to: 'INST-4', bearing: '265°00\'00"', distance: '213.000 m' },
    ],
    regulationReference: 'Survey Act Cap 299 Sec. 21; Trust Land Act Cap 288 Sec. 13; Government Lands Act (Repealed) — now Land Act 2012 Sec. 108; Physical Planning Act Cap 286',
  },

  // ──────────────────────────────────────────────────────────
  // 5. Commercial / Town Centre
  // ──────────────────────────────────────────────────────────
  {
    id: 'commercial-town-centre',
    name: 'Commercial / Town Centre',
    description:
      'Small, high-value commercial plots in Central Business District areas. Plots are typically narrow frontages on main streets with depths of 15–30 m. Used for shops, offices, banks, hotels. Scale at 1:1250 or 1:1000 for precision.',
    category: 'urban',
    tags: [
      'commercial',
      'cbd',
      'town-centre',
      'office',
      'shop',
      'high-value',
      'nairobi',
      'mombasa',
      'kisumu',
    ],
    defaults: {
      datum: 'Arc 1960',
      projection: 'UTM Zone 37S',
      scale: '1:1250',
      registry: 'Nairobi',
    },
    sampleBeacons: [
      { beaconNumber: 'CB-1', easting: 532178.920, northing: 9982456.340, description: 'Concrete pillar at Kenyatta Ave/Moi Ave junction', type: 'Pillar' },
      { beaconNumber: 'CB-2', easting: 532189.650, northing: 9982301.120, description: 'Concrete pillar, rear of commercial row', type: 'Pillar' },
      { beaconNumber: 'CB-3', easting: 532345.780, northing: 9982298.450, description: 'Concrete pillar, service alley corner', type: 'Pillar' },
      { beaconNumber: 'CB-4', easting: 532338.210, northing: 9982453.670, description: 'Concrete pillar at street frontage', type: 'Pillar' },
      { beaconNumber: 'CB-5', easting: 532261.850, northing: 9982455.000, description: 'Concrete pillar, frontage mid-point', type: 'Pillar' },
      { beaconNumber: 'CB-6', easting: 532267.700, northing: 9982299.780, description: 'Concrete pillar, rear mid-point', type: 'Pillar' },
    ],
    sampleParcels: [
      { parcelNumber: '209/9345', area: 0.0060, landUse: 'Commercial — Retail Shop', ownerName: 'NATION MEDIA GROUP LTD', isLandmark: false },
      { parcelNumber: '209/9346', area: 0.0085, landUse: 'Commercial — Office Block', ownerName: 'KENYA COMMERCIAL BANK LTD', isLandmark: false },
      { parcelNumber: '209/9347', area: 0.0120, landUse: 'Commercial — Hotel', ownerName: 'HERITAGE HOTELS LTD', isLandmark: false },
      { parcelNumber: '209/9348', area: 0.0045, landUse: 'Commercial — Pharmacy', ownerName: 'MWANGI PHARMACY LTD', isLandmark: false },
      { parcelNumber: '209/9349', area: 0.0150, landUse: 'Commercial — Banking Hall', ownerName: 'EQUITY BANK KENYA LTD', isLandmark: true },
      { parcelNumber: '209/9350', area: 0.0020, landUse: 'Road Reserve — Footpath', ownerName: 'Nairobi City County', isLandmark: true },
    ],
    sampleBoundaries: [
      { from: 'CB-1', to: 'CB-5', bearing: '89°45\'30"', distance: '82.930 m' },
      { from: 'CB-5', to: 'CB-4', bearing: '90°02\'15"', distance: '76.360 m' },
      { from: 'CB-4', to: 'CB-3', bearing: '269°58\'42"', distance: '155.230 m' },
      { from: 'CB-3', to: 'CB-6', bearing: '180°05\'18"', distance: '1.330 m' },
      { from: 'CB-6', to: 'CB-2', bearing: '270°01\'08"', distance: '78.050 m' },
      { from: 'CB-2', to: 'CB-1', bearing: '90°03\'24"', distance: '155.220 m' },
      { from: 'CB-5', to: 'CB-6', bearing: '179°52\'30"', distance: '155.220 m' },
    ],
    regulationReference: 'Survey Act Cap 299 Sec. 15; Survey Regulations L.N. 168/1994 Reg. 20(2) — Town Centre Survey; Physical Planning Act Cap 286 Sec. 29',
  },

  // ──────────────────────────────────────────────────────────
  // 6. Coastal Plot
  // ──────────────────────────────────────────────────────────
  {
    id: 'coastal-plot',
    name: 'Coastal Plot',
    description:
      'Beach plots and coastal properties subject to specific regulations including the 60-metre high-water mark setback and the 200-metre Coastal Zone Management restrictions. Typical in Mombasa, Malindi, Diani, and Kwale. Affected by the Environmental Management and Coordination Act (EMCA) and the Maritime Act.',
    category: 'coastal',
    tags: [
      'coastal',
      'beach',
      'ocean',
      'mombasa',
      'diani',
      'malindi',
      'setback',
      'high-water-mark',
      'resort',
      'hotel',
    ],
    defaults: {
      datum: 'Arc 1960',
      projection: 'UTM Zone 37S',
      scale: '1:2500',
      registry: 'Mombasa',
    },
    sampleBeacons: [
      { beaconNumber: 'SH-1', easting: 923456.780, northing: 9765123.450, description: 'Concrete pillar at high-water mark (HWM)', type: 'Pillar' },
      { beaconNumber: 'SH-2', easting: 923812.340, northing: 9765098.230, description: 'Concrete pillar, 60m landward of HWM', type: 'Pillar' },
      { beaconNumber: 'SH-3', easting: 923834.560, northing: 9764876.120, description: 'Concrete pillar at rear boundary of plot', type: 'Pillar' },
      { beaconNumber: 'SH-4', easting: 923478.900, northing: 9764901.340, description: 'Concrete pillar at rear boundary of plot', type: 'Pillar' },
      { beaconNumber: 'SH-5', easting: 923635.060, northing: 9765110.840, description: 'Concrete pillar, frontage mid-point', type: 'Pillar' },
      { beaconNumber: 'HWM-A', easting: 923440.000, northing: 9765130.000, description: 'Iron pipe mark, high-water mark (chart datum)', type: 'Pin' },
      { beaconNumber: 'HWM-B', easting: 923800.000, northing: 9765106.000, description: 'Iron pipe mark, high-water mark (chart datum)', type: 'Pin' },
    ],
    sampleParcels: [
      { parcelNumber: 'MN/III/1234', area: 0.0700, landUse: 'Beach Hotel/Resort', ownerName: 'DIANI BEACH RESORTS LTD', isLandmark: true },
      { parcelNumber: 'MN/III/1235', area: 0.0500, landUse: 'Residential — Beach Villa', ownerName: 'ALI M. BAKARI', isLandmark: false },
      { parcelNumber: 'MN/III/1236', area: 0.0850, landUse: 'Commercial — Restaurant', ownerName: 'COASTAL HOSPITALITY LTD', isLandmark: false },
      { parcelNumber: 'MN/III/1237', area: 0.1200, landUse: 'Beach Reserve (HWM Setback)', ownerName: 'National Environment Management Authority', isLandmark: true },
      { parcelNumber: 'MN/III/1238', area: 0.2000, landUse: 'Marine Park Buffer', ownerName: 'Kenya Wildlife Service', isLandmark: true },
      { parcelNumber: 'MN/III/1239', area: 0.0300, landUse: 'Beach Access Path', ownerName: 'County Government of Mombasa', isLandmark: true },
    ],
    sampleBoundaries: [
      { from: 'HWM-A', to: 'HWM-B', bearing: '91°32\'18"', distance: '360.120 m' },
      { from: 'HWM-B', to: 'SH-2', bearing: '88°45\'30"', distance: '12.350 m' },
      { from: 'SH-2', to: 'SH-3', bearing: '180°15\'42"', distance: '222.110 m' },
      { from: 'SH-3', to: 'SH-4', bearing: '269°42\'18"', distance: '355.660 m' },
      { from: 'SH-4', to: 'SH-1', bearing: '0°12\'30"', distance: '222.110 m' },
      { from: 'SH-1', to: 'HWM-A', bearing: '268°58\'12"', distance: '16.780 m' },
      { from: 'SH-1', to: 'SH-5', bearing: '92°30\'00"', distance: '178.280 m' },
      { from: 'SH-5', to: 'SH-2', bearing: '87°45\'00"', distance: '177.280 m' },
    ],
    regulationReference: 'EMCA 1999 Sec. 42 & 47; Survey Act Cap 299 Sec. 15; Survey Regulations L.N. 168/1994 Reg. 20(3); Maritime Zones Act 1989; Physical Planning Act Cap 286 — Coastal Zone Planning',
  },

  // ──────────────────────────────────────────────────────────
  // 7. Group Ranch Subdivision
  // ──────────────────────────────────────────────────────────
  {
    id: 'group-ranch-subdivision',
    name: 'Group Ranch Subdivision',
    description:
      'Subdivision of a former group ranch into individual titles under the Group Representatives Act (Repealed) and now the Community Land Act 2016. Members receive individual parcels while common resources (grazing, water) remain communal. Common in Kajiado, Narok, Laikipia, and Samburu.',
    category: 'pastoral',
    tags: [
      'group-ranch',
      'subdivision',
      'individual-title',
      'adjudication',
      'kajiado',
      'narok',
      'laikipia',
      'land-adjudication',
    ],
    defaults: {
      datum: 'Arc 1960',
      projection: 'UTM Zone 37S',
      scale: '1:5000',
      registry: 'Kajiado',
    },
    sampleBeacons: [
      { beaconNumber: 'GRS-1', easting: 498234.560, northing: 9945678.120, description: 'Concrete pillar, original group ranch corner', type: 'Pillar' },
      { beaconNumber: 'GRS-2', easting: 504567.890, northing: 9945601.340, description: 'Concrete pillar, NE subdivision corner', type: 'Pillar' },
      { beaconNumber: 'GRS-3', easting: 504512.340, northing: 9942123.780, description: 'Concrete pillar, SE subdivision corner', type: 'Pillar' },
      { beaconNumber: 'GRS-4', easting: 498189.230, northing: 9942198.560, description: 'Concrete pillar, SW subdivision corner', type: 'Pillar' },
      { beaconNumber: 'GRS-5', easting: 501401.220, northing: 9945640.000, description: 'Concrete pillar, internal E-W subdivision line', type: 'Pillar' },
      { beaconNumber: 'GRS-6', easting: 501398.700, northing: 9942161.170, description: 'Concrete pillar, internal E-W subdivision line', type: 'Pillar' },
      { beaconNumber: 'GRS-7', easting: 498211.900, northing: 9943938.340, description: 'Concrete pillar, internal N-S subdivision line', type: 'Pillar' },
      { beaconNumber: 'GRS-8', easting: 504540.120, northing: 9943862.560, description: 'Concrete pillar, internal N-S subdivision line', type: 'Pillar' },
      { beaconNumber: 'GRS-9', easting: 501400.000, northing: 9943900.000, description: 'Concrete pillar, centre intersection', type: 'Pillar' },
    ],
    sampleParcels: [
      { parcelNumber: 'Kajiado/Olkejuado/GR/Adj/1', area: 5.0623, landUse: 'Individual Homestead', ownerName: 'OLE SAINTO N. (Member No. 001)', isLandmark: false },
      { parcelNumber: 'Kajiado/Olkejuado/GR/Adj/2', area: 5.0623, landUse: 'Individual Homestead', ownerName: 'NAMAYIAN S. K. (Member No. 002)', isLandmark: false },
      { parcelNumber: 'Kajiado/Olkejuado/GR/Adj/3', area: 5.0623, landUse: 'Individual Homestead', ownerName: 'KERRI T. M. (Member No. 003)', isLandmark: false },
      { parcelNumber: 'Kajiado/Olkejuado/GR/Adj/4', area: 5.0623, landUse: 'Individual Homestead', ownerName: 'TOROME P. L. (Member No. 004)', isLandmark: false },
      { parcelNumber: 'Kajiado/Olkejuado/GR/Comm/1', area: 1200.000, landUse: 'Communal Grazing (Remainder)', ownerName: 'Olkejuado Group Ranch Members', isLandmark: true },
      { parcelNumber: 'Kajiado/Olkejuado/GR/Comm/2', area: 85.000, landUse: 'Water Point (Community Borehole)', ownerName: 'Olkejuado Group Ranch Members', isLandmark: true },
    ],
    sampleBoundaries: [
      { from: 'GRS-1', to: 'GRS-5', bearing: '89°48\'12"', distance: '3166.660 m' },
      { from: 'GRS-5', to: 'GRS-2', bearing: '90°15\'30"', distance: '3166.670 m' },
      { from: 'GRS-2', to: 'GRS-8', bearing: '179°22\'08"', distance: '1738.780 m' },
      { from: 'GRS-8', to: 'GRS-3', bearing: '180°45\'42"', distance: '1738.780 m' },
      { from: 'GRS-3', to: 'GRS-6', bearing: '270°38\'22"', distance: '3113.080 m' },
      { from: 'GRS-6', to: 'GRS-4', bearing: '269°55\'10"', distance: '3203.470 m' },
      { from: 'GRS-4', to: 'GRS-7', bearing: '0°32\'18"', distance: '1739.780 m' },
      { from: 'GRS-7', to: 'GRS-1', bearing: '1°05\'45"', distance: '1739.780 m' },
      { from: 'GRS-7', to: 'GRS-9', bearing: '90°12\'00"', distance: '3188.100 m' },
      { from: 'GRS-9', to: 'GRS-8', bearing: '90°12\'00"', distance: '3141.120 m' },
      { from: 'GRS-5', to: 'GRS-9', bearing: '179°48\'00"', distance: '1740.000 m' },
      { from: 'GRS-9', to: 'GRS-6', bearing: '179°48\'00"', distance: '1738.830 m' },
    ],
    regulationReference: 'Community Land Act 2016 Sec. 13 & 14; Land Adjudication Act Cap 284; Survey Act Cap 299 Sec. 15A; Survey Regulations L.N. 168/1994 Reg. 24 — Group Ranch Subdivision',
  },

  // ──────────────────────────────────────────────────────────
  // 8. Rural Agricultural
  // ──────────────────────────────────────────────────────────
  {
    id: 'rural-agricultural',
    name: 'Rural Agricultural',
    description:
      'Small-scale farming plots in rural areas, typically ¼ acre to 5 acres. Found in most Kenyan counties outside major urban centres. Often with irregular shapes following natural boundaries (rivers, ridges, valleys). Includes subsistence and smallholder cash crop parcels.',
    category: 'agricultural',
    tags: [
      'rural',
      'agricultural',
      'smallholder',
      'subsistence',
      'tea',
      'coffee',
      'rice',
      'western',
      'nyanza',
      'central',
    ],
    defaults: {
      datum: 'Arc 1960',
      projection: 'UTM Zone 36S',
      scale: '1:5000',
      registry: 'Kakamega',
    },
    sampleBeacons: [
      { beaconNumber: 'RA-1', easting: 345678.340, northing: 9968234.120, description: 'Concrete pillar at murram road junction', type: 'Pillar' },
      { beaconNumber: 'RA-2', easting: 345912.780, northing: 9968198.450, description: 'Concrete pillar at stream bank (east side)', type: 'Pillar' },
      { beaconNumber: 'RA-3', easting: 345856.230, northing: 9967845.670, description: 'Concrete pillar at footpath crossing', type: 'Pillar' },
      { beaconNumber: 'RA-4', easting: 345612.890, northing: 9967878.340, description: 'Concrete pillar at valley bottom fence', type: 'Pillar' },
      { beaconNumber: 'RA-5', easting: 345645.500, northing: 9968056.230, description: 'Concrete pillar, north boundary', type: 'Pillar' },
      { beaconNumber: 'RA-6', easting: 345764.700, northing: 9968021.500, description: 'Concrete pillar, east boundary', type: 'Pillar' },
    ],
    sampleParcels: [
      { parcelNumber: 'Kakamega/Shianda/4523', area: 0.4047, landUse: 'Agricultural — Mixed Farming', ownerName: 'WANYAMA J. SHIKOKI', isLandmark: false },
      { parcelNumber: 'Kakamega/Shianda/4524', area: 0.2023, landUse: 'Agricultural — Sugarcane', ownerName: 'NALIAKA M. LUMUMBA', isLandmark: false },
      { parcelNumber: 'Kakamega/Shianda/4525', area: 0.6070, landUse: 'Agricultural — Maize & Beans', ownerName: 'WEKESA P. BARASA', isLandmark: false },
      { parcelNumber: 'Kakamega/Shianda/4526', area: 1.2141, landUse: 'Agricultural — Tea', ownerName: 'MUTOKA B. INDANGASI', isLandmark: false },
      { parcelNumber: 'Kakamega/Shianda/4527', area: 0.1012, landUse: 'Homestead', ownerName: 'NALIAKA W. SHITUBA', isLandmark: false },
      { parcelNumber: 'Kakamega/Shianda/4528', area: 0.0405, landUse: 'Road Reserve — Access Path', ownerName: 'Kakamega County Government', isLandmark: true },
      { parcelNumber: 'Kakamega/Shianda/4529', area: 0.0800, landUse: 'River Riparian Reserve', ownerName: 'Water Resources Authority', isLandmark: true },
    ],
    sampleBoundaries: [
      { from: 'RA-1', to: 'RA-5', bearing: '182°12\'30"', distance: '177.890 m' },
      { from: 'RA-5', to: 'RA-6', bearing: '82°45\'18"', distance: '121.350 m' },
      { from: 'RA-6', to: 'RA-2', bearing: '168°32\'42"', distance: '178.200 m' },
      { from: 'RA-2', to: 'RA-3', bearing: '186°15\'08"', distance: '352.810 m' },
      { from: 'RA-3', to: 'RA-4', bearing: '262°48\'22"', distance: '243.570 m' },
      { from: 'RA-4', to: 'RA-1', bearing: '355°24\'12"', distance: '355.810 m' },
    ],
    regulationReference: 'Survey Act Cap 299 Sec. 19; Survey Regulations L.N. 168/1994 Reg. 18 — Rural Land Survey; Land Registration Act 2012 Sec. 28',
  },

  // ──────────────────────────────────────────────────────────
  // 9. Industrial Zone
  // ──────────────────────────────────────────────────────────
  {
    id: 'industrial-zone',
    name: 'Industrial Zone',
    description:
      'Factory, warehouse, and industrial park parcels. Typically located along major highways or railway lines outside urban cores. Include heavy industry, light manufacturing, logistics hubs, and oil depot reserves. Subject to Environmental Impact Assessment requirements.',
    category: 'special',
    tags: [
      'industrial',
      'factory',
      'warehouse',
      'manufacturing',
      'logistics',
      'depot',
      'epz',
      'export-processing',
      'mombasa-road',
      'thika-road',
    ],
    defaults: {
      datum: 'Arc 1960',
      projection: 'UTM Zone 37S',
      scale: '1:2500',
      registry: 'Nairobi',
    },
    sampleBeacons: [
      { beaconNumber: 'IND-1', easting: 534567.230, northing: 9980123.450, description: 'Concrete pillar at Mombasa Road frontage', type: 'Pillar' },
      { beaconNumber: 'IND-2', easting: 536123.670, northing: 9980108.890, description: 'Concrete pillar at railway reserve boundary', type: 'Pillar' },
      { beaconNumber: 'IND-3', easting: 536098.340, northing: 9979654.210, description: 'Concrete pillar at southern boundary', type: 'Pillar' },
      { beaconNumber: 'IND-4', easting: 534542.780, northing: 9979668.760, description: 'Concrete pillar at service road rear', type: 'Pillar' },
      { beaconNumber: 'IND-5', easting: 535345.450, northing: 9980116.170, description: 'Concrete pillar, internal subdivision', type: 'Pillar' },
      { beaconNumber: 'IND-6', easting: 535320.560, northing: 9979661.490, description: 'Concrete pillar, internal subdivision', type: 'Pillar' },
    ],
    sampleParcels: [
      { parcelNumber: '209/24567', area: 2.5000, landUse: 'Industrial — Manufacturing', ownerName: 'BAJAJ AUTO KENYA LTD', isLandmark: false },
      { parcelNumber: '209/24568', area: 1.8000, landUse: 'Industrial — Warehouse', ownerName: 'LOGISTICS KENYA LTD', isLandmark: false },
      { parcelNumber: '209/24569', area: 3.2000, landUse: 'Industrial — Heavy Manufacturing', ownerName: 'EAST AFRICAN PORTLAND CEMENT CO. LTD', isLandmark: true },
      { parcelNumber: '209/24570', area: 0.8000, landUse: 'Industrial — Light Assembly', ownerName: 'KIKWETU EXPORT PROCESSING ZONE LTD', isLandmark: false },
      { parcelNumber: '209/24571', area: 0.5000, landUse: 'Road Reserve — Industrial Access Road', ownerName: 'Kenya National Highways Authority', isLandmark: true },
      { parcelNumber: '209/24572', area: 0.3500, landUse: 'Railway Reserve', ownerName: 'Kenya Railways Corporation', isLandmark: true },
      { parcelNumber: '209/24573', area: 0.1500, landUse: 'Power Line Wayleave', ownerName: 'Kenya Power and Lighting Company', isLandmark: true },
    ],
    sampleBoundaries: [
      { from: 'IND-1', to: 'IND-2', bearing: '89°42\'18"', distance: '1556.440 m' },
      { from: 'IND-2', to: 'IND-3', bearing: '180°08\'42"', distance: '454.680 m' },
      { from: 'IND-3', to: 'IND-4', bearing: '270°12\'08"', distance: '1555.560 m' },
      { from: 'IND-4', to: 'IND-1', bearing: '0°15\'30"', distance: '454.690 m' },
      { from: 'IND-1', to: 'IND-5', bearing: '89°50\'00"', distance: '778.220 m' },
      { from: 'IND-5', to: 'IND-6', bearing: '180°04\'00"', distance: '454.680 m' },
      { from: 'IND-6', to: 'IND-4', bearing: '269°56\'00"', distance: '777.670 m' },
    ],
    regulationReference: 'Survey Act Cap 299 Sec. 15; Survey Regulations L.N. 168/1994 Reg. 20(4); Physical Planning Act Cap 286 Sec. 24; EMCA 1999 Sec. 58 — EIA for Industrial Development; Special Economic Zones Act 2015',
  },

  // ──────────────────────────────────────────────────────────
  // 10. Mixed Use Development
  // ──────────────────────────────────────────────────────────
  {
    id: 'mixed-use-development',
    name: 'Mixed Use Development',
    description:
      'Combination of residential, commercial, institutional, and open space parcels within a single section. Typical of rapidly growing peri-urban areas and planned developments. Often includes anchor facilities like shopping centres, schools, and healthcare facilities.',
    category: 'urban',
    tags: [
      'mixed-use',
      'development',
      'peri-urban',
      'residential',
      'commercial',
      'institutional',
      'gated-community',
      'estate',
      'planned',
    ],
    defaults: {
      datum: 'Arc 1960',
      projection: 'UTM Zone 37S',
      scale: '1:2500',
      registry: 'Kiambu',
    },
    sampleBeacons: [
      { beaconNumber: 'MU-1', easting: 543234.560, northing: 9988456.780, description: 'Concrete pillar, main entrance gate', type: 'Pillar' },
      { beaconNumber: 'MU-2', easting: 544789.120, northing: 9988432.340, description: 'Concrete pillar, NE corner at tarmac road', type: 'Pillar' },
      { beaconNumber: 'MU-3', easting: 544765.890, northing: 9986123.450, description: 'Concrete pillar, SE corner at river', type: 'Pillar' },
      { beaconNumber: 'MU-4', easting: 543212.340, northing: 9986148.780, description: 'Concrete pillar, SW corner at murram road', type: 'Pillar' },
      { beaconNumber: 'MU-5', easting: 544011.840, northing: 9988444.560, description: 'Concrete pillar, internal commercial zone', type: 'Pillar' },
      { beaconNumber: 'MU-6', easting: 544011.840, northing: 9986136.120, description: 'Concrete pillar, internal residential zone', type: 'Pillar' },
      { beaconNumber: 'MU-7', easting: 543223.450, northing: 9987302.780, description: 'Concrete pillar, west boundary internal', type: 'Pillar' },
      { beaconNumber: 'MU-8', easting: 544777.500, northing: 9987277.890, description: 'Concrete pillar, east boundary internal', type: 'Pillar' },
    ],
    sampleParcels: [
      { parcelNumber: 'Kiambu/Ruiru/Block 12/101', area: 0.1012, landUse: 'Commercial — Shopping Centre', ownerName: 'TATU CITY DEVELOPMENTS LTD', isLandmark: true },
      { parcelNumber: 'Kiambu/Ruiru/Block 12/102', area: 0.2023, landUse: 'Residential — Townhouse', ownerName: 'NJUGUNA J. KAMAU', isLandmark: false },
      { parcelNumber: 'Kiambu/Ruiru/Block 12/103', area: 0.2023, landUse: 'Residential — Townhouse', ownerName: 'AWUOR W. OTIENO', isLandmark: false },
      { parcelNumber: 'Kiambu/Ruiru/Block 12/104', area: 0.1517, landUse: 'Residential — Apartment Block', ownerName: 'HASSAN M. ALI', isLandmark: false },
      { parcelNumber: 'Kiambu/Ruiru/Block 12/105', area: 1.5000, landUse: 'Institutional — International School', ownerName: 'GEMS EDUCATION KENYA LTD', isLandmark: true },
      { parcelNumber: 'Kiambu/Ruiru/Block 12/106', area: 0.5000, landUse: 'Healthcare — Polyclinic', ownerName: 'AGA KHAN HEALTH SERVICES', isLandmark: true },
      { parcelNumber: 'Kiambu/Ruiru/Block 12/107', area: 2.0000, landUse: 'Open Space / Park', ownerName: 'Kiambu County Government', isLandmark: true },
      { parcelNumber: 'Kiambu/Ruiru/Block 12/108', area: 0.3000, landUse: 'Road Reserve — Internal Estate Roads', ownerName: 'Kiambu County Government', isLandmark: true },
      { parcelNumber: 'Kiambu/Ruiru/Block 12/109', area: 0.0800, landUse: 'River Riparian Reserve', ownerName: 'Water Resources Authority', isLandmark: true },
    ],
    sampleBoundaries: [
      { from: 'MU-1', to: 'MU-2', bearing: '89°30\'12"', distance: '1554.560 m' },
      { from: 'MU-2', to: 'MU-3', bearing: '180°15\'42"', distance: '2308.890 m' },
      { from: 'MU-3', to: 'MU-4', bearing: '269°45\'18"', distance: '1553.550 m' },
      { from: 'MU-4', to: 'MU-1', bearing: '0°22\'08"', distance: '2308.000 m' },
      { from: 'MU-1', to: 'MU-5', bearing: '89°30\'00"', distance: '777.280 m' },
      { from: 'MU-5', to: 'MU-2', bearing: '89°30\'00"', distance: '777.280 m' },
      { from: 'MU-5', to: 'MU-6', bearing: '180°00\'00"', distance: '2308.440 m' },
      { from: 'MU-6', to: 'MU-3', bearing: '180°30\'00"', distance: '12.670 m' },
      { from: 'MU-7', to: 'MU-8', bearing: '90°18\'00"', distance: '1554.050 m' },
    ],
    regulationReference: 'Survey Act Cap 299 Sec. 15; Survey Regulations L.N. 168/1994 Reg. 20(1); Physical Planning Act Cap 286 Sec. 18 — Development Plans; Building Code 1968; County Physical & Land Use Planning Act 2018',
  },

  // ──────────────────────────────────────────────────────────
  // 11. Conservancy / Wildlife
  // ──────────────────────────────────────────────────────────
  {
    id: 'conservancy-wildlife',
    name: 'Conservancy / Wildlife',
    description:
      'Wildlife conservancy boundaries including private conservancies, community conservancies, national park boundaries, and wildlife corridors. Subject to the Wildlife Conservation and Management Act 2013. Large parcels with natural boundaries (rivers, ridgelines) and minimal beacons, often using natural features.',
    category: 'special',
    tags: [
      'conservancy',
      'wildlife',
      'national-park',
      'community-conservancy',
      'corridor',
      'laikipia',
      'maasai-mara',
      'amboseli',
      'tsavo',
      'safari',
    ],
    defaults: {
      datum: 'Arc 1960',
      projection: 'UTM Zone 36S',
      scale: '1:10000',
      registry: 'Nanyuki',
    },
    sampleBeacons: [
      { beaconNumber: 'CONV-1', easting: 267890.120, northing: 9989234.560, description: 'Concrete pillar at Ewaso Nyiro north bank', type: 'Pillar' },
      { beaconNumber: 'CONV-2', easting: 293456.780, northing: 9989123.340, description: 'Concrete pillar at Ol Olokwe ridgeline', type: 'Pillar' },
      { beaconNumber: 'CONV-3', easting: 295678.900, northing: 9965432.120, description: 'Concrete pillar at southern fence line', type: 'Pillar' },
      { beaconNumber: 'CONV-4', easting: 268012.340, northing: 9965567.890, description: 'Concrete pillar at dam wall boundary', type: 'Pillar' },
      { beaconNumber: 'CONV-5', easting: 280673.450, northing: 9989178.950, description: 'Concrete pillar, northern fence line', type: 'Pillar' },
      { beaconNumber: 'CONV-6', easting: 281845.600, northing: 9965500.230, description: 'Concrete pillar, southern fence line', type: 'Pillar' },
      { beaconNumber: 'CONV-7', easting: 267951.230, northing: 9977401.220, description: 'Concrete pillar, western boundary mid', type: 'Pillar' },
      { beaconNumber: 'CONV-8', easting: 294567.870, northing: 9977278.730, description: 'Concrete pillar, eastern boundary mid', type: 'Pillar' },
    ],
    sampleParcels: [
      { parcelNumber: 'Laikipia/Ol Pejeta/Conservancy/1', area: 15000.000, landUse: 'Wildlife Conservancy — Core Area', ownerName: 'Ol Pejeta Conservancy Ltd', isLandmark: true },
      { parcelNumber: 'Laikipia/Ol Pejeta/Conservancy/2', area: 3500.000, landUse: 'Wildlife Corridor', ownerName: 'Laikipia County Government', isLandmark: true },
      { parcelNumber: 'Laikipia/Ol Pejeta/Conservancy/3', area: 1200.000, landUse: 'Livestock Grazing Zone (Limited)', ownerName: 'Ol Pejeta Conservancy Ltd', isLandmark: false },
      { parcelNumber: 'Laikipia/Ol Pejeta/Conservancy/4', area: 800.000, landUse: 'Rhino Sanctuary (Fenced)', ownerName: 'Kenya Wildlife Service', isLandmark: true },
      { parcelNumber: 'Laikipia/Ol Pejeta/Conservancy/5', area: 150.000, landUse: 'Conservancy HQ & Tourism Facilities', ownerName: 'Ol Pejeta Conservancy Ltd', isLandmark: false },
      { parcelNumber: 'Laikipia/Ol Pejeta/Conservancy/6', area: 250.000, landUse: 'Community Grazing Access', ownerName: 'Local Maasai Community', isLandmark: false },
      { parcelNumber: 'Laikipia/Ol Pejeta/Conservancy/7', area: 100.000, landUse: 'Research Station', ownerName: 'Kenya Wildlife Service', isLandmark: true },
    ],
    sampleBoundaries: [
      { from: 'CONV-1', to: 'CONV-5', bearing: '88°15\'30"', distance: '12783.330 m' },
      { from: 'CONV-5', to: 'CONV-2', bearing: '91°42\'18"', distance: '12783.330 m' },
      { from: 'CONV-2', to: 'CONV-8', bearing: '180°48\'12"', distance: '21844.610 m' },
      { from: 'CONV-8', to: 'CONV-3', bearing: '181°12\'42"', distance: '21846.610 m' },
      { from: 'CONV-3', to: 'CONV-6', bearing: '271°08\'22"', distance: '13826.300 m' },
      { from: 'CONV-6', to: 'CONV-4', bearing: '268°55\'08"', distance: '13932.660 m' },
      { from: 'CONV-4', to: 'CONV-7', bearing: '359°32\'18"', distance: '11833.330 m' },
      { from: 'CONV-7', to: 'CONV-1', bearing: '0°45\'42"', distance: '11833.340 m' },
    ],
    regulationReference: 'Wildlife Conservation and Management Act 2013 Sec. 44 & 45; Survey Act Cap 299 Sec. 15A; Survey Regulations L.N. 168/1994 Reg. 25 — Conservancy Boundary Survey; Tourism Act 2011',
  },

  // ──────────────────────────────────────────────────────────
  // 12. Mining / Extraction
  // ──────────────────────────────────────────────────────────
  {
    id: 'mining-extraction',
    name: 'Mining / Extraction',
    description:
      'Mining claim boundaries, quarry boundaries, and mineral extraction sites. Subject to the Mining Act 2016. Include artisanal mining claims, large-scale mining leases, and quarry reserves. Require coordination with the Ministry of Mining and the County Director of Mines.',
    category: 'special',
    tags: [
      'mining',
      'extraction',
      'quarry',
      'gold',
      'titanium',
      'fluorspar',
      'soda-ash',
      'artisanal',
      'kwale',
      'migori',
      'kerio-valley',
    ],
    defaults: {
      datum: 'Arc 1960',
      projection: 'UTM Zone 37S',
      scale: '1:5000',
      registry: 'Kwale',
    },
    sampleBeacons: [
      { beaconNumber: 'MIN-1', easting: 867234.560, northing: 9745123.120, description: 'Concrete pillar at mining lease NW corner', type: 'Pillar' },
      { beaconNumber: 'MIN-2', easting: 872345.890, northing: 9745098.780, description: 'Concrete pillar at mining lease NE corner', type: 'Pillar' },
      { beaconNumber: 'MIN-3', easting: 872312.340, northing: 9740234.560, description: 'Concrete pillar at mining lease SE corner', type: 'Pillar' },
      { beaconNumber: 'MIN-4', easting: 867198.780, northing: 9740267.230, description: 'Concrete pillar at mining lease SW corner', type: 'Pillar' },
      { beaconNumber: 'MIN-5', easting: 869790.220, northing: 9745111.000, description: 'Concrete pillar, internal pit boundary', type: 'Pillar' },
      { beaconNumber: 'MIN-6', easting: 869755.560, northing: 9740250.900, description: 'Concrete pillar, internal pit boundary', type: 'Pillar' },
    ],
    sampleParcels: [
      { parcelNumber: 'Kwale/Mining Lease/ML/2024/001', area: 2100.000, landUse: 'Mining — Titanium Extraction', ownerName: 'BASE TITANIUM (KWALE) LTD', isLandmark: true },
      { parcelNumber: 'Kwale/Mining Lease/ML/2024/002', area: 450.000, landUse: 'Mining — Mineral Processing Plant', ownerName: 'BASE TITANIUM (KWALE) LTD', isLandmark: false },
      { parcelNumber: 'Kwale/Mining Lease/ML/2024/003', area: 80.000, landUse: 'Mine Infrastructure & Offices', ownerName: 'BASE TITANIUM (KWALE) LTD', isLandmark: false },
      { parcelNumber: 'Kwale/Mining Lease/ML/2024/004', area: 150.000, landUse: 'Tailings Storage Facility', ownerName: 'BASE TITANIUM (KWALE) LTD', isLandmark: true },
      { parcelNumber: 'Kwale/Mining Lease/ML/2024/005', area: 300.000, landUse: 'Environmental Buffer Zone', ownerName: 'NEMA', isLandmark: true },
      { parcelNumber: 'Kwale/Mining Lease/ML/2024/006', area: 20.000, landUse: 'Quarry Reserve (Laterite)', ownerName: 'Kwale County Government', isLandmark: false },
      { parcelNumber: 'Kwale/Mining Lease/ML/2024/007', area: 0.5000, landUse: 'Access Road (Mine Haul Road)', ownerName: 'Kenya National Highways Authority', isLandmark: true },
    ],
    sampleBoundaries: [
      { from: 'MIN-1', to: 'MIN-2', bearing: '89°42\'18"', distance: '5111.330 m' },
      { from: 'MIN-2', to: 'MIN-3', bearing: '180°15\'42"', distance: '4864.220 m' },
      { from: 'MIN-3', to: 'MIN-4', bearing: '270°12\'08"', distance: '5113.560 m' },
      { from: 'MIN-4', to: 'MIN-1', bearing: '0°18\'30"', distance: '4855.890 m' },
      { from: 'MIN-1', to: 'MIN-5', bearing: '89°50\'00"', distance: '2555.660 m' },
      { from: 'MIN-5', to: 'MIN-6', bearing: '180°00\'00"', distance: '4860.100 m' },
      { from: 'MIN-6', to: 'MIN-4', bearing: '270°10\'00"', distance: '2556.780 m' },
    ],
    regulationReference: 'Mining Act 2016 Sec. 37 & 38 — Mining Lease; Survey Act Cap 299 Sec. 22; Survey Regulations L.N. 168/1994 Reg. 26 — Mining Survey; EMCA 1999 Sec. 58 — Environmental Impact Assessment; Mineral Rights Act (Repealed)',
  },

  // ──────────────────────────────────────────────────────────
  // 13. Settlement Scheme (Bonus)
  // ──────────────────────────────────────────────────────────
  {
    id: 'settlement-scheme',
    name: 'Settlement Scheme',
    description:
      'Government settlement scheme parcels (e.g., Mwea, Bura, Hola, Perkerra). Originally established under the Settlement Fund Trustees to settle landless Kenyans. Plots are typically 1–5 acres with irrigation infrastructure and access roads. Requires adjudication and consolidation survey.',
    category: 'agricultural',
    tags: [
      'settlement',
      'scheme',
      'irrigation',
      'mwea',
      'bura',
      'hola',
      'perkerra',
      'landless',
      'government',
      'adjudication',
    ],
    defaults: {
      datum: 'Arc 1960',
      projection: 'UTM Zone 37S',
      scale: '1:5000',
      registry: 'Mbeere',
    },
    sampleBeacons: [
      { beaconNumber: 'SS-1', easting: 412345.670, northing: 9958234.120, description: 'Concrete pillar at scheme headquarters', type: 'Pillar' },
      { beaconNumber: 'SS-2', easting: 418765.340, northing: 9958198.560, description: 'Concrete pillar at main irrigation canal intake', type: 'Pillar' },
      { beaconNumber: 'SS-3', easting: 418712.890, northing: 9953456.230, description: 'Concrete pillar at Tana River boundary', type: 'Pillar' },
      { beaconNumber: 'SS-4', easting: 412298.450, northing: 9953498.780, description: 'Concrete pillar at scheme boundary SW', type: 'Pillar' },
      { beaconNumber: 'SS-5', easting: 415555.500, northing: 9958216.340, description: 'Concrete pillar, E-W internal access road', type: 'Pillar' },
      { beaconNumber: 'SS-6', easting: 415505.690, northing: 9953477.510, description: 'Concrete pillar, E-W internal access road', type: 'Pillar' },
    ],
    sampleParcels: [
      { parcelNumber: 'Mbeere/Mwea/Settlement/Block A/1', area: 1.6187, landUse: 'Irrigated Agriculture — Rice', ownerName: 'KAGWIMA J. NGARI', isLandmark: false },
      { parcelNumber: 'Mbeere/Mwea/Settlement/Block A/2', area: 1.6187, landUse: 'Irrigated Agriculture — Rice', ownerName: 'MURITHI P. KABERIA', isLandmark: false },
      { parcelNumber: 'Mbeere/Mwea/Settlement/Block A/3', area: 2.0234, landUse: 'Irrigated Agriculture — Horticulture', ownerName: 'WACHIRA G. KARANJA', isLandmark: false },
      { parcelNumber: 'Mbeere/Mwea/Settlement/Block A/4', area: 1.6187, landUse: 'Irrigated Agriculture — Rice', ownerName: 'GITONGA M. RUGENE', isLandmark: false },
      { parcelNumber: 'Mbeere/Mwea/Settlement/Block A/5', area: 1.6187, landUse: 'Irrigated Agriculture — Rice', ownerName: 'KINYUA R. MBARIA', isLandmark: false },
      { parcelNumber: 'Mbeere/Mwea/Settlement/Block A/6', area: 0.4047, landUse: 'Homestead', ownerName: 'KAGWIMA J. NGARI', isLandmark: false },
      { parcelNumber: 'Mbeere/Mwea/Settlement/Infra/1', area: 2.0000, landUse: 'Irrigation Canal Reserve', ownerName: 'National Irrigation Authority', isLandmark: true },
      { parcelNumber: 'Mbeere/Mwea/Settlement/Infra/2', area: 0.8094, landUse: 'Access Road Reserve', ownerName: 'County Government of Embu', isLandmark: true },
    ],
    sampleBoundaries: [
      { from: 'SS-1', to: 'SS-2', bearing: '89°48\'18"', distance: '6419.670 m' },
      { from: 'SS-2', to: 'SS-3', bearing: '180°32\'42"', distance: '4742.330 m' },
      { from: 'SS-3', to: 'SS-4', bearing: '270°08\'22"', distance: '6414.440 m' },
      { from: 'SS-4', to: 'SS-1', bearing: '0°15\'08"', distance: '4735.340 m' },
      { from: 'SS-1', to: 'SS-5', bearing: '89°50\'00"', distance: '3209.830 m' },
      { from: 'SS-5', to: 'SS-6', bearing: '180°15\'00"', distance: '4738.830 m' },
      { from: 'SS-6', to: 'SS-4', bearing: '270°02\'00"', distance: '3207.240 m' },
    ],
    regulationReference: 'Land Adjudication Act Cap 284 Sec. 6; Settlement Fund Trustees Act Cap 307; Survey Act Cap 299 Sec. 15; Survey Regulations L.N. 168/1994 Reg. 22 — Settlement Scheme Survey',
  },

  // ──────────────────────────────────────────────────────────
  // 14. Religious / Worship Centre (Bonus)
  // ──────────────────────────────────────────────────────────
  {
    id: 'religious-worship',
    name: 'Religious / Worship Centre',
    description:
      'Land reserved for churches, mosques, temples, and other places of worship. May include associated facilities like schools, community halls, and cemeteries. Common across all Kenyan counties. Often held by religious organisations with certificates of incorporation.',
    category: 'institutional',
    tags: [
      'religious',
      'church',
      'mosque',
      'temple',
      'worship',
      'cathedral',
      'diocese',
      'cemetery',
      'faith-based',
    ],
    defaults: {
      datum: 'Arc 1960',
      projection: 'UTM Zone 36S',
      scale: '1:2500',
      registry: 'Nakuru',
    },
    sampleBeacons: [
      { beaconNumber: 'REL-1', easting: 734521.230, northing: 9978456.780, description: 'Concrete pillar at main church gate', type: 'Pillar' },
      { beaconNumber: 'REL-2', easting: 734876.450, northing: 9978432.120, description: 'Concrete pillar, east boundary parking area', type: 'Pillar' },
      { beaconNumber: 'REL-3', easting: 734862.340, northing: 9978212.560, description: 'Concrete pillar at rear fence corner', type: 'Pillar' },
      { beaconNumber: 'REL-4', easting: 734507.890, northing: 9978237.230, description: 'Concrete pillar, west boundary side road', type: 'Pillar' },
    ],
    sampleParcels: [
      { parcelNumber: 'Nakuru/Block 18/234', area: 0.3500, landUse: 'Religious — Cathedral', ownerName: 'Catholic Diocese of Nakuru', isLandmark: true },
      { parcelNumber: 'Nakuru/Block 18/235', area: 0.1500, landUse: 'Religious — Sunday School Hall', ownerName: 'Catholic Diocese of Nakuru', isLandmark: false },
      { parcelNumber: 'Nakuru/Block 18/236', area: 0.0800, landUse: 'Cemetery / Burial Ground', ownerName: 'Catholic Diocese of Nakuru', isLandmark: false },
      { parcelNumber: 'Nakuru/Block 18/237', area: 0.0200, landUse: 'Road Reserve — Church Access', ownerName: 'Nakuru County Government', isLandmark: true },
    ],
    sampleBoundaries: [
      { from: 'REL-1', to: 'REL-2', bearing: '88°45\'12"', distance: '355.220 m' },
      { from: 'REL-2', to: 'REL-3', bearing: '180°22\'30"', distance: '219.560 m' },
      { from: 'REL-3', to: 'REL-4', bearing: '270°38\'18"', distance: '354.450 m' },
      { from: 'REL-4', to: 'REL-1', bearing: '0°15\'42"', distance: '219.550 m' },
    ],
    regulationReference: 'Survey Act Cap 299 Sec. 21; Trust Land Act Cap 288; Land Act 2012 Sec. 108; Religious Societies Rules',
  },
]

// ────────────────────────────────────────────────────────────
// Helper: Get templates by category
// ────────────────────────────────────────────────────────────

export function getTemplatesByCategory(category: string): RimTemplate[] {
  return RIM_TEMPLATES.filter(
    (t) => t.category.toLowerCase() === category.toLowerCase(),
  )
}

// ────────────────────────────────────────────────────────────
// Helper: Search templates by query
// ────────────────────────────────────────────────────────────

export function searchTemplates(query: string): RimTemplate[] {
  const q = query.toLowerCase().trim()
  if (!q) return RIM_TEMPLATES

  return RIM_TEMPLATES.filter((template) => {
    // Search across name, description, category, tags, and registry
    const haystack = [
      template.name,
      template.description,
      template.category,
      template.defaults.registry,
      template.defaults.scale,
      ...template.tags,
    ]
      .join(' ')
      .toLowerCase()

    // Support both space-separated terms and quoted phrases
    const terms = q.split(/\s+/)
    return terms.every((term) => haystack.includes(term))
  })
}

// ────────────────────────────────────────────────────────────
// Helper: Create section from template
// ────────────────────────────────────────────────────────────

interface TemplateCustomizations {
  sectionName?: string
  registry?: string
  district?: string
  surveyorName?: string
  iskNumber?: string
}

export function createSectionFromTemplate(
  templateId: string,
  customizations: TemplateCustomizations = {},
): {
  section: Partial<RimSection>
  parcels: Partial<RimParcel>[]
  beacons: Partial<RimBeacon>[]
} {
  const template = RIM_TEMPLATES.find((t) => t.id === templateId)

  if (!template) {
    throw new Error(
      `Template not found: "${templateId}". Available templates: ${RIM_TEMPLATES.map((t) => t.id).join(', ')}`,
    )
  }

  const totalArea = template.sampleParcels.reduce((sum, p) => sum + p.area, 0)

  // Build the section from template defaults + customizations
  const section: Partial<RimSection> = {
    section_name: customizations.sectionName || template.name,
    registry: customizations.registry || template.defaults.registry,
    district: customizations.district || '',
    scale: template.defaults.scale,
    datum: template.defaults.datum,
    projection: template.defaults.projection,
    total_area: totalArea,
    parcels_count: template.sampleParcels.length,
    status: 'draft',
    notes: `Created from template: ${template.name} (${template.id}). ${template.regulationReference}`,
  }

  // Build parcels from template
  const parcels: Partial<RimParcel>[] = template.sampleParcels.map((p) => ({
    parcel_number: p.parcelNumber,
    area: p.area,
    land_use: p.landUse,
    owner_name: p.ownerName,
    beacon_count: 4, // Default 4 corners per parcel
    eastings: [],
    northings: [],
    is_landmark: p.isLandmark,
  }))

  // Build beacons from template
  const beacons: Partial<RimBeacon>[] = template.sampleBeacons.map((b) => ({
    beacon_number: b.beaconNumber,
    easting: b.easting,
    northing: b.northing,
    description: b.description,
    type: b.type,
    survey_status: 'Original',
  }))

  return { section, parcels, beacons }
}

// ────────────────────────────────────────────────────────────
// Helper: Get all available categories
// ────────────────────────────────────────────────────────────

export function getTemplateCategories(): Array<{
  id: string
  label: string
  description: string
  count: number
}> {
  const categoryMeta: Record<string, { label: string; description: string }> = {
    urban: {
      label: 'Urban',
      description: 'Town and city residential, commercial, and mixed-use layouts',
    },
    agricultural: {
      label: 'Agricultural',
      description: 'Farms, settlement schemes, and smallholder plots',
    },
    pastoral: {
      label: 'Pastoral / Community',
      description: 'Group ranches, pastoral community land, and subdivisions',
    },
    institutional: {
      label: 'Institutional',
      description: 'Schools, hospitals, government land, and places of worship',
    },
    coastal: {
      label: 'Coastal',
      description: 'Beach plots, resorts, and coastal zone properties',
    },
    special: {
      label: 'Special',
      description: 'Industrial zones, conservancies, mining, and unique land uses',
    },
  }

  const categories = [...new Set(RIM_TEMPLATES.map((t) => t.category))]

  return categories.map((id) => ({
    id,
    label: categoryMeta[id]?.label || id,
    description: categoryMeta[id]?.description || '',
    count: RIM_TEMPLATES.filter((t) => t.category === id).length,
  }))
}

// ────────────────────────────────────────────────────────────
// Helper: Validate template completeness
// ────────────────────────────────────────────────────────────

export function validateTemplate(template: RimTemplate): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!template.id) errors.push('Missing template id')
  if (!template.name) errors.push('Missing template name')
  if (!template.description) errors.push('Missing template description')
  if (!template.category) errors.push('Missing template category')
  if (template.tags.length === 0) errors.push('No tags defined')
  if (!template.defaults.datum) errors.push('Missing datum')
  if (!template.defaults.projection) errors.push('Missing projection')
  if (!template.defaults.scale) errors.push('Missing scale')
  if (!template.defaults.registry) errors.push('Missing registry')
  if (template.sampleBeacons.length < 4)
    errors.push(`Only ${template.sampleBeacons.length} beacons (minimum 4)`)
  if (template.sampleParcels.length === 0) errors.push('No parcels defined')
  if (template.sampleBoundaries.length < 2)
    errors.push('Insufficient boundary lines to form a closed polygon')
  if (!template.regulationReference)
    errors.push('Missing regulation reference')

  // Check all beacon references in boundaries are valid
  const beaconNumbers = new Set(template.sampleBeacons.map((b) => b.beaconNumber))
  for (const boundary of template.sampleBoundaries) {
    if (!beaconNumbers.has(boundary.from))
      errors.push(`Boundary references unknown beacon: ${boundary.from}`)
    if (!beaconNumbers.has(boundary.to))
      errors.push(`Boundary references unknown beacon: ${boundary.to}`)
  }

  return { valid: errors.length === 0, errors }
}
