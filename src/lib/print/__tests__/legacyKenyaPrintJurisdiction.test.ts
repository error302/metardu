import type { SurveyingCountry } from '@/lib/country/standards'
import type { PrintMeta as ShellPrintMeta } from '../buildPrintDocument'
import { generateLevelBookSheet } from '../levelBookPrint'
import { generateGNSSObservationLog } from '../gnssObservationLog'
import { generateSettingOutSchedule } from '../settingOutSchedule'
import { generateDroneReport } from '../droneReportPrint'
import {
  generateEnvironmentalSetback,
  generateRoadReserveReport,
  generateSubdivisionScheme,
  generateTitleSearchSummary,
  generateValuationSupport,
} from '../billableDocuments'

const baseMeta = {
  title: 'Legacy print draft',
  projectName: 'Example project',
  clientName: 'Example client',
  surveyorName: 'Example surveyor',
  surveyorEmail: '',
  clientEmail: '',
  regNo: 'REG-001',
  iskNo: 'MEMBER-001',
  date: '2026-11-25',
  instrument: 'Example instrument',
  weather: 'Not recorded',
  observer: 'Example observer',
  submissionNo: '',
  jurisdiction: undefined as SurveyingCountry | undefined,
}

const levelResult = {
  rows: [],
  method: 'rise_and_fall' as const,
  sumBS: 0,
  sumFS: 0,
  sumRise: 0,
  sumFall: 0,
  arithmeticCheck: 0,
  arithmeticPass: true,
  misclosure: 0,
  allowableMisclosure: 0,
  isAcceptable: true,
  openingRL: 0,
  distanceKm: 0,
  formula: 'Synthetic fixture',
}

const gnssInput = {
  observations: [],
  baselines: [],
  receiverModel: 'Example receiver',
  receiverSerial: 'R-001',
  antennaModel: 'Example antenna',
  antennaSerial: 'A-001',
  baseStationId: 'BASE',
  baseStationSource: 'OWN_BASE' as const,
  datum: 'Declared test datum',
  projection: 'Declared test projection',
  geoidModel: 'Declared test geoid',
  elevationMask: 15,
  epochInterval: 1,
}

const settingOutResult = {
  instrumentStation: { e: 0, n: 0, rl: 0, ih: 0 },
  backsight: { e: 1, n: 0 },
  bsBearing: '000°00\'00.0"',
  bsBearingDecimal: 0,
  rows: [],
  totalPoints: 0,
}

const droneInput = {
  gcps: [],
  accuracyResults: null,
  selectedClass: {
    name: 'Example class',
    horizontal: 0.1,
    vertical: 0.15,
    scale: '1:500',
  },
  flightParams: {
    height: '100 m',
    gsd: '5 cm/px',
    overlapFront: '80',
    overlapSide: '70',
  },
}

const subdivisionInput = {
  motherParcel: '',
  county: '',
  schemePurpose: '',
  planningAuthority: '',
  consentReference: '',
  accessRoadWidth: '',
  originalAreaHa: '',
  proposedParcels: [],
  conditions: '',
}

const roadInput = {
  roadName: '',
  authority: '',
  routeSection: '',
  surveyPurpose: '',
  designReserveWidth: '',
  datum: '',
  chainages: [],
  anomalies: '',
  recommendations: '',
}

const valuationInput = {
  valuationClient: '',
  valuationPurpose: '',
  propertyLocation: '',
  inspectionDate: '2026-11-25',
  parcels: [],
  coordinateSystem: '',
  boundaryNotes: '',
}

const titleInput = {
  parcelNumber: '',
  registry: '',
  searchDate: '2026-11-25',
  registeredOwner: '',
  tenure: '',
  titleArea: '',
  encumbrances: '',
  restrictions: '',
  surveyorInterpretation: '',
  clientAdvice: '',
}

const setbackInput = {
  parcelNumber: '',
  county: '',
  permitPurpose: '',
  authority: '',
  inspectionDate: '2026-11-25',
  rows: [],
  siteObservations: '',
  conclusion: '',
}

type LegacyCase = {
  name: string
  generate: (meta: typeof baseMeta) => string
}

const legacyCases: LegacyCase[] = [
  {
    name: 'level book',
    generate: meta => generateLevelBookSheet({ meta: meta as ShellPrintMeta, result: levelResult }),
  },
  {
    name: 'GNSS observation log',
    generate: meta => generateGNSSObservationLog({ ...gnssInput, meta: meta as ShellPrintMeta }),
  },
  {
    name: 'setting-out schedule',
    generate: meta => generateSettingOutSchedule({ meta, result: settingOutResult }),
  },
  {
    name: 'drone report',
    generate: meta => generateDroneReport({ ...droneInput, meta: meta as ShellPrintMeta }),
  },
  {
    name: 'subdivision scheme',
    generate: meta => generateSubdivisionScheme({ meta: meta as ShellPrintMeta, ...subdivisionInput }),
  },
  {
    name: 'road reserve report',
    generate: meta => generateRoadReserveReport({ meta: meta as ShellPrintMeta, ...roadInput }),
  },
  {
    name: 'valuation support',
    generate: meta => generateValuationSupport({ meta: meta as ShellPrintMeta, ...valuationInput }),
  },
  {
    name: 'title search summary',
    generate: meta => generateTitleSearchSummary({ meta: meta as ShellPrintMeta, ...titleInput }),
  },
  {
    name: 'environmental setback',
    generate: meta => generateEnvironmentalSetback({ meta: meta as ShellPrintMeta, ...setbackInput }),
  },
]

describe('legacy Kenya print packs', () => {
  // These legacy templates still use fixed Kenya rules. Binding a persisted
  // project jurisdiction is tracked in PRINT_JURISDICTION_SCOPE_2026-11-25.md.
  it.each(legacyCases)('$name retains its Kenya review and certification wording', ({ generate }) => {
    const html = generate(baseMeta)

    expect(html).toMatch(/Kenya|ISK|Cap\.? 299/i)
    expect(html).toMatch(/independently verified|licensed surveyor|not certified/i)
  })

  it('escapes the setting-out technical reference exactly once', () => {
    const html = generateSettingOutSchedule({
      meta: baseMeta,
      result: settingOutResult,
    })

    expect(html).toContain('Ghilani ' + '&' + 'amp; Wolf Ch.23')
    expect(html).not.toContain('Ghilani ' + '&' + 'amp;amp; Wolf')
  })
})
