// METARDU Road Completion Certificate Generator
// Source: Kenya Roads Act, Cap 407
// Source: KeNHA Construction Supervision Manual
// Source: Survey Act Cap 299

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
  earthworksCertified: boolean
  pavementCertified: boolean
  drainageCertified: boolean
  signageCertified: boolean
  roadFurnitureCertified: boolean
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
  certificationChecklist: Array<{ item: string; certified: boolean }>
  declaration: string
  signatureBlock: {
    surveyorName: string
    surveyorRegistration: string
    surveyorFirm: string
    licenseNumber: string
    date: string
  }
  isComplete: boolean
  complianceNotes: string[]
}

// ─── CERTIFICATION CHECKLIST ──────────────────────────────────────────────────

export const CERTIFICATION_ITEMS = [
  { key: 'earthworks', label: 'Earthworks & Formation Levels', description: 'Formation levels within tolerance, compaction tested per RDM 1.1' },
  { key: 'pavement', label: 'Pavement Layers', description: 'Layer thicknesses verified, surface regularity within tolerance' },
  { key: 'drainage', label: 'Drainage System', description: 'Longitudinal drains, cross drains, culverts installed and functional' },
  { key: 'signage', label: 'Road Signs & Markings', description: 'Warning, regulatory, informatory signs per MUTCD Kenya' },
  { key: 'roadFurniture', label: 'Road Furniture', description: 'Guardrails, kerbs, barriers, kilometre posts installed' },
] as const

// ─── CERTIFICATE NUMBER GENERATION ────────────────────────────────────────────

let certificateCounter = 0

function generateCertificateNumber(): string {
  certificateCounter++
  const year = new Date().getFullYear()
  const seq = String(certificateCounter).padStart(3, '0')
  return `RCC-${year}-${seq}`
}

// ─── FORMAT HELPERS ───────────────────────────────────────────────────────────

function formatChainage(ch: number): string {
  const km = Math.floor(ch / 1000)
  const m = Math.round(ch % 1000)
  return `${km}+${String(m).padStart(3, '0')}`
}

function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

// ─── MAIN GENERATOR ───────────────────────────────────────────────────────────

export function generateCertificate(data: RoadCompletionData): RoadCompletionCertificate {
  const certNum = generateCertificateNumber()
  const complianceNotes: string[] = []

  // Check all certifications
  const certifications: Array<{ item: string; certified: boolean }> = [
    { item: 'Earthworks & Formation Levels', certified: data.earthworksCertified },
    { item: 'Pavement Layers', certified: data.pavementCertified },
    { item: 'Drainage System', certified: data.drainageCertified },
    { item: 'Road Signs & Markings', certified: data.signageCertified },
    { item: 'Road Furniture (Guardrails, Kerbs, KM Posts)', certified: data.roadFurnitureCertified },
  ]

  const allCertified = certifications.every(c => c.certified)
  const isComplete = allCertified && data.asBuiltPassRate >= 95

  if (!allCertified) {
    const missing = certifications.filter(c => !c.certified).map(c => c.item)
    complianceNotes.push(`Incomplete certifications: ${missing.join(', ')}`)
  }

  if (data.asBuiltPassRate < 95) {
    complianceNotes.push(`As-built pass rate (${data.asBuiltPassRate.toFixed(1)}%) is below the 95% threshold`)
  }

  if (data.defectsNoted.length > 0) {
    complianceNotes.push(`${data.defectsNoted.length} defect(s) noted`)
  }

  if (data.reservations.length > 0) {
    complianceNotes.push(`${data.reservations.length} reservation(s) recorded`)
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
        { label: 'Compliance', value: data.asBuiltPassRate >= 95 ? 'PASS' : 'FAIL' },
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
  const declaration = `I, ${data.surveyorName} (${data.surveyorRegistration}), being a Licensed Surveyor registered under the Survey Act, Cap 299 of the Laws of Kenya, and a member of the Institution of Surveyors of Kenya (ISK), hereby certify that I have supervised the construction of the above-described road and have carried out an as-built survey to verify compliance with the approved design.

The as-built survey was conducted using [instrument/method] and the results demonstrate that the constructed road meets the required tolerances as specified in the Kenya Road Design Manual (RDM 1.3) and the applicable Detail Tolerances (RDM 1.1).

${data.reservations.length > 0 ? `Reservations: ${data.reservations.join('; ')}.` : 'No reservations are noted.'}

${data.defectsNoted.length > 0 ? `Defects noted: ${data.defectsNoted.join('; ')}.` : 'No defects are noted.'}

This certificate is issued without prejudice to any rights or obligations under the contract between the Client and the Contractor.`

  return {
    title: 'ROAD COMPLETION CERTIFICATE',
    certificateNumber: certNum,
    issueDate: data.completionDate,
    sections,
    certificationChecklist: certifications,
    declaration,
    signatureBlock: {
      surveyorName: data.surveyorName,
      surveyorRegistration: data.surveyorRegistration,
      surveyorFirm: data.surveyorFirm,
      licenseNumber: data.surveyorLicense || 'N/A',
      date: data.completionDate,
    },
    isComplete,
    complianceNotes,
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
