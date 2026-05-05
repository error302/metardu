/**
 * METARDU - Billable survey document generators.
 *
 * These templates cover project/support documents that surveyors routinely
 * prepare around the core computation outputs.
 */

import { buildPrintDocument, openPrint } from './buildPrintDocument'
import type { PrintMeta } from './buildPrintDocument'

export type Status = 'compliant' | 'review' | 'non_compliant'

export interface ParcelScheduleRow {
  parcelNo: string
  ownerOrBeneficiary: string
  areaHa: string
  landUse: string
  access: string
  remarks: string
}

export interface RoadChainageRow {
  chainage: string
  easting: string
  northing: string
  offsetLeft: string
  offsetRight: string
  reserveWidth: string
  feature: string
  remarks: string
}

export interface ValuationParcelRow {
  parcelNo: string
  tenure: string
  registeredAreaHa: string
  surveyedAreaHa: string
  variance: string
  encumbrance: string
  valuationNote: string
}

export interface SetbackRow {
  feature: string
  requiredSetback: string
  observedSetback: string
  status: Status
  affectedParcel: string
  remarks: string
}

export interface SubdivisionSchemeInput {
  meta: PrintMeta
  motherParcel: string
  county: string
  schemePurpose: string
  planningAuthority: string
  consentReference: string
  accessRoadWidth: string
  originalAreaHa: string
  proposedParcels: ParcelScheduleRow[]
  conditions: string
}

export interface RoadReserveReportInput {
  meta: PrintMeta
  roadName: string
  authority: string
  routeSection: string
  surveyPurpose: string
  designReserveWidth: string
  datum: string
  chainages: RoadChainageRow[]
  anomalies: string
  recommendations: string
}

export interface ValuationSupportInput {
  meta: PrintMeta
  valuationClient: string
  valuationPurpose: string
  propertyLocation: string
  inspectionDate: string
  parcels: ValuationParcelRow[]
  coordinateSystem: string
  boundaryNotes: string
}

export interface TitleSearchSummaryInput {
  meta: PrintMeta
  parcelNumber: string
  registry: string
  searchDate: string
  registeredOwner: string
  tenure: string
  titleArea: string
  encumbrances: string
  restrictions: string
  surveyorInterpretation: string
  clientAdvice: string
}

export interface EnvironmentalSetbackInput {
  meta: PrintMeta
  parcelNumber: string
  county: string
  permitPurpose: string
  authority: string
  inspectionDate: string
  rows: SetbackRow[]
  siteObservations: string
  conclusion: string
}

function esc(value: string | number | undefined | null): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function blank(value: string | undefined | null): string {
  const text = String(value ?? '').trim()
  return text ? esc(text) : '&mdash;'
}

function lines(text: string): string {
  return blank(text).replace(/\r?\n/g, '<br>')
}

function statusClass(status: Status): string {
  if (status === 'compliant') return 'pass'
  if (status === 'non_compliant') return 'fail'
  return 'warn'
}

function metaWith(meta: PrintMeta, title: string, reference: string): PrintMeta {
  return { ...meta, title, reference }
}

export function generateSubdivisionScheme(input: SubdivisionSchemeInput): string {
  const totalArea = input.proposedParcels.reduce((sum, row) => {
    const value = Number(row.areaHa)
    return Number.isFinite(value) ? sum + value : sum
  }, 0)

  const rows = input.proposedParcels.map((row, i) => `
<tr>
  <td class="center">${i + 1}</td>
  <td class="bold mono">${blank(row.parcelNo)}</td>
  <td>${blank(row.ownerOrBeneficiary)}</td>
  <td class="right mono">${blank(row.areaHa)}</td>
  <td>${blank(row.landUse)}</td>
  <td>${blank(row.access)}</td>
  <td>${blank(row.remarks)}</td>
</tr>`).join('')

  const body = `
<h2>1. Scheme Particulars</h2>
<div class="summary-box">
  <div class="summary-row"><span class="summary-label">Mother Parcel</span><span class="summary-value">${blank(input.motherParcel)}</span></div>
  <div class="summary-row"><span class="summary-label">County / Authority</span><span class="summary-value">${blank(input.county)} / ${blank(input.planningAuthority)}</span></div>
  <div class="summary-row"><span class="summary-label">Purpose</span><span class="summary-value">${blank(input.schemePurpose)}</span></div>
  <div class="summary-row"><span class="summary-label">Consent Reference</span><span class="summary-value">${blank(input.consentReference)}</span></div>
  <div class="summary-row"><span class="summary-label">Access Road Width</span><span class="summary-value">${blank(input.accessRoadWidth)}</span></div>
  <div class="summary-row"><span class="summary-label">Original Area / Proposed Total</span><span class="summary-value">${blank(input.originalAreaHa)} ha / ${totalArea.toFixed(4)} ha</span></div>
</div>

<h2>2. Proposed Parcel Schedule</h2>
<table>
  <thead>
    <tr>
      <th style="width:5%">No.</th>
      <th style="width:12%">Parcel</th>
      <th style="width:18%">Beneficiary</th>
      <th class="right" style="width:10%">Area (ha)</th>
      <th style="width:14%">Use</th>
      <th style="width:18%">Access</th>
      <th style="width:23%">Remarks</th>
    </tr>
  </thead>
  <tbody>${rows || '<tr><td colspan="7" class="center">No proposed parcels entered</td></tr>'}</tbody>
</table>

<h2>3. Conditions and Planning Notes</h2>
<div class="summary-box" style="line-height:1.55">${lines(input.conditions)}</div>

<h3>Submission Checklist</h3>
<ol style="font-size:8pt;line-height:1.6;padding-left:16px;">
  <li>Attach consent letter, planning approval, mutation form, deed plan/Form No. 4, computation workbook, and beacon certificate.</li>
  <li>Confirm every proposed parcel has legal access and road reserve dimensions are shown on the plan.</li>
  <li>Confirm area reconciliation between mother parcel and proposed parcel schedule before submission.</li>
</ol>`

  return buildPrintDocument(body, metaWith(
    input.meta,
    'Subdivision Scheme Document',
    'Survey Act Cap 299 | Physical and Land Use Planning Act | County subdivision consent requirements',
  ))
}

export function generateRoadReserveReport(input: RoadReserveReportInput): string {
  const rows = input.chainages.map((row, i) => `
<tr>
  <td class="center">${i + 1}</td>
  <td class="mono">${blank(row.chainage)}</td>
  <td class="right mono">${blank(row.easting)}</td>
  <td class="right mono">${blank(row.northing)}</td>
  <td class="right mono">${blank(row.offsetLeft)}</td>
  <td class="right mono">${blank(row.offsetRight)}</td>
  <td class="right mono">${blank(row.reserveWidth)}</td>
  <td>${blank(row.feature)}</td>
  <td>${blank(row.remarks)}</td>
</tr>`).join('')

  const body = `
<h2>1. Road Reserve Survey Particulars</h2>
<div class="summary-box">
  <div class="summary-row"><span class="summary-label">Road / Route</span><span class="summary-value">${blank(input.roadName)}</span></div>
  <div class="summary-row"><span class="summary-label">Authority</span><span class="summary-value">${blank(input.authority)}</span></div>
  <div class="summary-row"><span class="summary-label">Section</span><span class="summary-value">${blank(input.routeSection)}</span></div>
  <div class="summary-row"><span class="summary-label">Survey Purpose</span><span class="summary-value">${blank(input.surveyPurpose)}</span></div>
  <div class="summary-row"><span class="summary-label">Design Reserve Width</span><span class="summary-value">${blank(input.designReserveWidth)}</span></div>
  <div class="summary-row"><span class="summary-label">Datum / CRS</span><span class="summary-value">${blank(input.datum)}</span></div>
</div>

<h2>2. Chainage and Reserve Schedule</h2>
<table style="font-size:8pt;">
  <thead>
    <tr>
      <th>No.</th><th>Chainage</th><th class="right">Easting</th><th class="right">Northing</th>
      <th class="right">L Offset</th><th class="right">R Offset</th><th class="right">Width</th><th>Feature</th><th>Remarks</th>
    </tr>
  </thead>
  <tbody>${rows || '<tr><td colspan="9" class="center">No chainage observations entered</td></tr>'}</tbody>
</table>

<h2>3. Encroachments, Utilities and Anomalies</h2>
<div class="summary-box" style="line-height:1.55">${lines(input.anomalies)}</div>

<h2>4. Recommendations</h2>
<div class="summary-box" style="line-height:1.55">${lines(input.recommendations)}</div>`

  return buildPrintDocument(body, metaWith(
    input.meta,
    'Road Reserve Survey Report',
    'KeNHA/KURA/County road reserve requirements | RDM 1.1 | Survey Act Cap 299',
  ))
}

export function generateValuationSupport(input: ValuationSupportInput): string {
  const rows = input.parcels.map((row, i) => `
<tr>
  <td class="center">${i + 1}</td>
  <td class="bold mono">${blank(row.parcelNo)}</td>
  <td>${blank(row.tenure)}</td>
  <td class="right mono">${blank(row.registeredAreaHa)}</td>
  <td class="right mono">${blank(row.surveyedAreaHa)}</td>
  <td class="right mono">${blank(row.variance)}</td>
  <td>${blank(row.encumbrance)}</td>
  <td>${blank(row.valuationNote)}</td>
</tr>`).join('')

  const body = `
<h2>1. Valuation Support Particulars</h2>
<div class="summary-box">
  <div class="summary-row"><span class="summary-label">Client / Valuer</span><span class="summary-value">${blank(input.valuationClient)}</span></div>
  <div class="summary-row"><span class="summary-label">Purpose</span><span class="summary-value">${blank(input.valuationPurpose)}</span></div>
  <div class="summary-row"><span class="summary-label">Property Location</span><span class="summary-value">${blank(input.propertyLocation)}</span></div>
  <div class="summary-row"><span class="summary-label">Inspection Date</span><span class="summary-value">${blank(input.inspectionDate)}</span></div>
  <div class="summary-row"><span class="summary-label">Coordinate System</span><span class="summary-value">${blank(input.coordinateSystem)}</span></div>
</div>

<h2>2. Parcel and Area Schedule</h2>
<table style="font-size:8pt;">
  <thead>
    <tr>
      <th>No.</th><th>Parcel</th><th>Tenure</th><th class="right">Title Area</th>
      <th class="right">Survey Area</th><th class="right">Variance</th><th>Encumbrance</th><th>Valuation Note</th>
    </tr>
  </thead>
  <tbody>${rows || '<tr><td colspan="8" class="center">No parcels entered</td></tr>'}</tbody>
</table>

<h2>3. Boundary and Inspection Notes</h2>
<div class="summary-box" style="line-height:1.55">${lines(input.boundaryNotes)}</div>

<p style="font-size:8pt;color:#555;line-height:1.6;">
  This schedule supports valuation only. It does not replace an official title search, registry index map, deed plan,
  or cadastral re-survey where boundary uncertainty exists.
</p>`

  return buildPrintDocument(body, metaWith(
    input.meta,
    'Valuation Support Schedule',
    'Survey Act Cap 299 | Valuation support schedule | Boundary and area verification',
  ))
}

export function generateTitleSearchSummary(input: TitleSearchSummaryInput): string {
  const body = `
<h2>1. Registry Search Summary</h2>
<div class="summary-box">
  <div class="summary-row"><span class="summary-label">Parcel / Title Number</span><span class="summary-value">${blank(input.parcelNumber)}</span></div>
  <div class="summary-row"><span class="summary-label">Registry</span><span class="summary-value">${blank(input.registry)}</span></div>
  <div class="summary-row"><span class="summary-label">Search Date</span><span class="summary-value">${blank(input.searchDate)}</span></div>
  <div class="summary-row"><span class="summary-label">Registered Owner</span><span class="summary-value">${blank(input.registeredOwner)}</span></div>
  <div class="summary-row"><span class="summary-label">Tenure</span><span class="summary-value">${blank(input.tenure)}</span></div>
  <div class="summary-row"><span class="summary-label">Title Area</span><span class="summary-value">${blank(input.titleArea)}</span></div>
</div>

<h2>2. Encumbrances and Restrictions</h2>
<table>
  <tbody>
    <tr><td class="bold" style="width:25%">Encumbrances</td><td>${lines(input.encumbrances)}</td></tr>
    <tr><td class="bold">Restrictions / Cautions</td><td>${lines(input.restrictions)}</td></tr>
  </tbody>
</table>

<h2>3. Surveyor Interpretation</h2>
<div class="summary-box" style="line-height:1.55">${lines(input.surveyorInterpretation)}</div>

<h2>4. Client Advice / Next Action</h2>
<div class="summary-box" style="line-height:1.55">${lines(input.clientAdvice)}</div>

<p style="font-size:8pt;color:#555;line-height:1.6;">
  This is a surveyor's interpretation of registry information supplied by the client or retrieved from the registry.
  It is not a legal opinion and should be read with the official search certificate.
</p>`

  return buildPrintDocument(body, metaWith(
    input.meta,
    'Title Search Summary',
    'Land Registration Act | Registry search interpretation | Survey Act Cap 299',
  ))
}

export function generateEnvironmentalSetback(input: EnvironmentalSetbackInput): string {
  const rows = input.rows.map((row, i) => `
<tr>
  <td class="center">${i + 1}</td>
  <td>${blank(row.feature)}</td>
  <td class="right mono">${blank(row.requiredSetback)}</td>
  <td class="right mono">${blank(row.observedSetback)}</td>
  <td class="${statusClass(row.status)} bold">${blank(row.status.replace(/_/g, ' ').toUpperCase())}</td>
  <td>${blank(row.affectedParcel)}</td>
  <td>${blank(row.remarks)}</td>
</tr>`).join('')

  const body = `
<h2>1. Setback Certificate Particulars</h2>
<div class="summary-box">
  <div class="summary-row"><span class="summary-label">Parcel</span><span class="summary-value">${blank(input.parcelNumber)}</span></div>
  <div class="summary-row"><span class="summary-label">County</span><span class="summary-value">${blank(input.county)}</span></div>
  <div class="summary-row"><span class="summary-label">Permit / Use Purpose</span><span class="summary-value">${blank(input.permitPurpose)}</span></div>
  <div class="summary-row"><span class="summary-label">Reviewing Authority</span><span class="summary-value">${blank(input.authority)}</span></div>
  <div class="summary-row"><span class="summary-label">Inspection Date</span><span class="summary-value">${blank(input.inspectionDate)}</span></div>
</div>

<h2>2. Setback Compliance Schedule</h2>
<table style="font-size:8pt;">
  <thead>
    <tr>
      <th>No.</th><th>Feature / Control Line</th><th class="right">Required</th><th class="right">Observed</th>
      <th>Status</th><th>Affected Parcel</th><th>Remarks</th>
    </tr>
  </thead>
  <tbody>${rows || '<tr><td colspan="7" class="center">No setback checks entered</td></tr>'}</tbody>
</table>

<h2>3. Site Observations</h2>
<div class="summary-box" style="line-height:1.55">${lines(input.siteObservations)}</div>

<h2>4. Certification Conclusion</h2>
<div class="summary-box" style="line-height:1.55">${lines(input.conclusion)}</div>`

  return buildPrintDocument(body, metaWith(
    input.meta,
    'Environmental Setback Certificate',
    'EMCA | County planning approval | Riparian/road/building setback certification',
  ))
}

export function printSubdivisionScheme(input: SubdivisionSchemeInput): void {
  openPrint(generateSubdivisionScheme(input))
}

export function printRoadReserveReport(input: RoadReserveReportInput): void {
  openPrint(generateRoadReserveReport(input))
}

export function printValuationSupport(input: ValuationSupportInput): void {
  openPrint(generateValuationSupport(input))
}

export function printTitleSearchSummary(input: TitleSearchSummaryInput): void {
  openPrint(generateTitleSearchSummary(input))
}

export function printEnvironmentalSetback(input: EnvironmentalSetbackInput): void {
  openPrint(generateEnvironmentalSetback(input))
}
