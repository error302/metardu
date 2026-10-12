// METARDU Road Completion Certificate Generator
// Produces a user-entered draft record. It does not determine legal compliance or issue certification.

// ─── TYPES ─────────────────────────────────────────────────────────────────────

export interface RoadCompletionData {
  projectName: string
  roadName: string
  roadClass: string
  roadNumber?: string
  chainageStart: number
  chainageEnd: number
  totalLength: number
  county: string
  subCounty?: string
  designSpeed: number
  carriagewayWidth: number
  shoulderWidth: number
  designStandard: string
  contractorName: string
  contractorRegistration?: string
  clientName: string
  contractDate?: string
  commencementDate?: string
  completionDate: string
  supervisionStartDate?: string
  surveyorName: string
  surveyorRegistration: string
  surveyorFirm: string
  surveyorLicense?: string
  asBuiltPassRate: number
  asBuiltTotalPoints: number
  asBuiltPassPoints: number
  maxDeviation: number
  rmsError: number
  pavementLayers: Array<{ name: string; material: string; thicknessMm: number }>
  earthworksReviewed: boolean
  pavementReviewed: boolean
  drainageReviewed: boolean
  signageReviewed: boolean
  roadFurnitureReviewed: boolean
  defectsNoted: string[]
  reservations: string[]
}

export interface CertificateSection {
  title: string
  rows: Array<{ label: string; value: string }>
}

export interface RoadCompletionCertificate {
  title: string
  certificateNumber: string
  issueDate: string
  sections: CertificateSection[]
  reviewChecklist: Array<{ item: string; markedReviewed: boolean }>
  declaration: string
  signatureBlock: {
    surveyorName: string
    surveyorRegistration: string
    surveyorFirm: string
    licenseNumber: string
    date: string
  }
  checklistComplete: boolean
  recordNotes: string[]
}

// ─── CERTIFICATION CHECKLIST ──────────────────────────────────────────────────

export const CERTIFICATION_ITEMS = [
  { key: 'earthworks', label: 'Earthworks & formation', description: 'Project records reviewed by the responsible professional' },
  { key: 'pavement', label: 'Pavement layers', description: 'Project records reviewed by the responsible professional' },
  { key: 'drainage', label: 'Drainage system', description: 'Project records reviewed by the responsible professional' },
  { key: 'signage', label: 'Signs and markings', description: 'Project records reviewed by the responsible professional' },
  { key: 'roadFurniture', label: 'Road furniture', description: 'Project records reviewed by the responsible professional' },
] as const

// ─── CERTIFICATE NUMBER GENERATION ────────────────────────────────────────────

function generateCertificateNumber(): string {
  const year = new Date().getFullYear()
  return `DRAFT-RCR-${year}-${globalThis.crypto.randomUUID().slice(0, 8).toUpperCase()}`
}

// ─── FORMAT HELPERS ───────────────────────────────────────────────────────────

function formatChainage(ch: number): string {
  const roundedMetres = Math.round(ch)
  const km = Math.floor(roundedMetres / 1000)
  const m = roundedMetres - km * 1000
  return `${km}+${String(m).padStart(3, '0')}`
}

function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

// ─── MAIN GENERATOR ───────────────────────────────────────────────────────────

export function generateCertificate(data: RoadCompletionData): RoadCompletionCertificate {
  const requiredText = [data.projectName, data.roadName, data.roadClass, data.county, data.designStandard, data.contractorName, data.clientName, data.completionDate, data.surveyorName, data.surveyorRegistration]
  const requiredNumbers = [data.chainageStart, data.chainageEnd, data.designSpeed, data.carriagewayWidth, data.shoulderWidth, data.asBuiltTotalPoints, data.asBuiltPassPoints, data.maxDeviation, data.rmsError, data.asBuiltPassRate]
  if (requiredText.some(value => !value.trim())) throw new Error('Complete required project, construction, design, and surveyor details before generating the draft record.')
  if (requiredNumbers.some(value => !Number.isFinite(value)) || data.chainageStart < 0 || data.chainageEnd <= data.chainageStart || data.designSpeed <= 0 || data.carriagewayWidth <= 0 || data.shoulderWidth < 0 || !Number.isInteger(data.asBuiltTotalPoints) || !Number.isInteger(data.asBuiltPassPoints) || data.asBuiltTotalPoints <= 0 || data.asBuiltPassPoints < 0 || data.asBuiltPassPoints > data.asBuiltTotalPoints || data.maxDeviation < 0 || data.rmsError < 0 || data.asBuiltPassRate < 0 || data.asBuiltPassRate > 100) {
    throw new Error('Enter valid finite chainage, design dimensions, and as-built summary values before generating the draft record.')
  }
  const certNum = generateCertificateNumber()
  const recordNotes: string[] = []

  // Check all certifications
  const reviewChecklist: Array<{ item: string; markedReviewed: boolean }> = [
    { item: 'Earthworks & Formation Levels', markedReviewed: data.earthworksReviewed },
    { item: 'Pavement Layers', markedReviewed: data.pavementReviewed },
    { item: 'Drainage System', markedReviewed: data.drainageReviewed },
    { item: 'Road Signs & Markings', markedReviewed: data.signageReviewed },
    { item: 'Road Furniture (Guardrails, Kerbs, KM Posts)', markedReviewed: data.roadFurnitureReviewed },
  ]

  const allReviewed = reviewChecklist.every(item => item.markedReviewed)

  if (!allReviewed) {
    const missing = reviewChecklist.filter(item => !item.markedReviewed).map(item => item.item)
    recordNotes.push(`Not marked reviewed: ${missing.join(', ')}`)
  }

  recordNotes.push('METARDU has not verified survey evidence, professional registration, tolerances, approvals, or statutory compliance. This record requires independent professional review and sign-off.')

  if (data.defectsNoted.length > 0) {
    recordNotes.push(`${data.defectsNoted.length} defect(s) noted`)
  }

  if (data.reservations.length > 0) {
    recordNotes.push(`${data.reservations.length} reservation(s) recorded`)
  }

  // Build certificate sections
  const sections: CertificateSection[] = [
    {
      title: 'PROJECT INFORMATION',
      rows: [
        { label: 'Project Name', value: data.projectName },
        { label: 'Road Name', value: data.roadName },
        { label: 'Road Number', value: data.roadNumber || 'N/A' },
        { label: 'Road Class', value: `Class ${data.roadClass}` },
        { label: 'County', value: data.county },
        { label: 'Sub-County', value: data.subCounty || 'N/A' },
        { label: 'Chainage', value: `${formatChainage(data.chainageStart)} to ${formatChainage(data.chainageEnd)}` },
        { label: 'Total Length', value: `${formatNumber(data.totalLength)} m (${formatNumber(data.totalLength / 1000, 2)} km)` },
      ],
    },
    {
      title: 'DESIGN STANDARDS',
      rows: [
        { label: 'Design Standard', value: data.designStandard },
        { label: 'Design Speed', value: `${data.designSpeed} km/h` },
        { label: 'Carriageway Width', value: `${data.carriagewayWidth} m` },
        { label: 'Shoulder Width', value: `${data.shoulderWidth} m` },
        { label: 'Formation Width', value: `${data.carriagewayWidth + 2 * data.shoulderWidth} m` },
      ],
    },
    {
      title: 'CONSTRUCTION DETAILS',
      rows: [
        { label: 'Contractor', value: data.contractorName },
        { label: 'Contractor Reg.', value: data.contractorRegistration || 'N/A' },
        { label: 'Client', value: data.clientName },
        { label: 'Contract Date', value: data.contractDate || 'N/A' },
        { label: 'Commencement Date', value: data.commencementDate || 'N/A' },
        { label: 'Completion Date', value: data.completionDate },
        { label: 'Supervision Start', value: data.supervisionStartDate || 'N/A' },
      ],
    },
    {
      title: 'AS-BUILT SURVEY SUMMARY',
      rows: [
        { label: 'Total Survey Points', value: formatNumber(data.asBuiltTotalPoints) },
        { label: 'Points Within Tolerance', value: formatNumber(data.asBuiltPassPoints) },
        { label: 'Pass Rate', value: `${data.asBuiltPassRate.toFixed(1)}%` },
        { label: 'Maximum Deviation', value: `${data.maxDeviation.toFixed(1)} mm` },
        { label: 'RMS Error', value: `${data.rmsError.toFixed(1)} mm` },
        { label: 'Reported pass rate (not assessed)', value: `${data.asBuiltPassRate.toFixed(1)}%` },
      ],
    },
    {
      title: 'PAVEMENT STRUCTURE',
      rows: data.pavementLayers.map(l => ({
        label: l.name,
        value: `${l.material} — ${l.thicknessMm} mm`,
      })),
    },
  ]

  // Declaration text
  const declaration = `DRAFT RECORD FOR PROFESSIONAL REVIEW. Prepared with the survey method/instrument recorded as: [instrument/method]. The values and checklist selections in this document are user supplied and have not been independently verified by METARDU. This draft does not certify professional registration, construction completion, survey accuracy, compliance with a design or standard, statutory approval, or legal rights. An appropriately authorized professional must review the source evidence, applicable project criteria, and this record before signing or issuing any formal certification.

${data.reservations.length > 0 ? `Reservations recorded: ${data.reservations.join('; ')}.` : 'No reservations were entered in this draft; this does not establish that none exist.'}

${data.defectsNoted.length > 0 ? `Defects recorded: ${data.defectsNoted.join('; ')}.` : 'No defects were entered in this draft; this does not establish that none exist.'}`

  return {
    title: 'ROAD COMPLETION RECORD — DRAFT',
    certificateNumber: certNum,
    issueDate: data.completionDate,
    sections,
    reviewChecklist,
    declaration,
    signatureBlock: {
      surveyorName: data.surveyorName,
      surveyorRegistration: data.surveyorRegistration,
      surveyorFirm: data.surveyorFirm,
      licenseNumber: data.surveyorLicense || 'N/A',
      date: data.completionDate,
    },
    checklistComplete: allReviewed,
    recordNotes,
  }
}

// ─── DEFECT SCHEDULE ──────────────────────────────────────────────────────────

export interface DefectItem {
  chainage: number
  description: string
  severity: 'minor' | 'major' | 'critical'
  rectificationDeadline?: string
}

export interface DefectSchedule {
  items: DefectItem[]
  totalDefects: number
  criticalCount: number
  majorCount: number
  minorCount: number
}

export function generateDefectSchedule(defects: DefectItem[]): DefectSchedule {
  return {
    items: defects.sort((a, b) => {
      const severityOrder = { critical: 0, major: 1, minor: 2 }
      return severityOrder[a.severity] - severityOrder[b.severity] || a.chainage - b.chainage
    }),
    totalDefects: defects.length,
    criticalCount: defects.filter(d => d.severity === 'critical').length,
    majorCount: defects.filter(d => d.severity === 'major').length,
    minorCount: defects.filter(d => d.severity === 'minor').length,
  }
}
