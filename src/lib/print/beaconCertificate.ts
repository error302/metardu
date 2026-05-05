/**
 * METARDU — Beacon Certificate / Beacon Description Sheet
 *
 * Produces a Kenya Survey Regulations 1994-compliant beacon description
 * certificate listing all beacons set or found during a survey.
 *
 * References:
 *   Survey Regulations 1994, Reg. 20 (beacon descriptions)
 *   Survey Act Cap 299, s.22 (duty to describe beacons)
 *   Cadastral Survey Standards and Guidelines Manual (ISK/DoLS)
 */

import { buildPrintDocument, openPrint } from './buildPrintDocument'

// ── Re-export shared meta type so callers have one source of truth ────────────
// PrintMeta from PrintMetaPanel (all string fields, non-optional)
export interface BeaconCertMeta {
  projectName: string
  clientName: string
  surveyorName: string
  regNo: string
  iskNo: string
  date: string
  instrument: string
  weather: string
  observer: string
  submissionNo: string
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type BeaconCondition = 'SET' | 'FOUND' | 'DISTURBED' | 'DESTROYED' | 'NOT_FOUND'

export type MonumentType =
  | 'Iron Pin'
  | 'Concrete Beacon'
  | 'Scribing on Rock'
  | 'Peg in Concrete'
  | 'Iron Post'
  | 'Trig Beacon'
  | 'Bench Mark'
  | 'GNSS Pillar'
  | 'Nail in Tree'
  | 'Nail in Road'
  | 'Other'

export interface BeaconEntry {
  id: string
  name: string
  monumentType: MonumentType
  condition: BeaconCondition
  easting: string
  northing: string
  elevation: string
  description: string          // e.g. "Iron pin set in concrete, flush with ground"
  adjacentFeatures: string     // e.g. "0.5m east of road kerb, 1.2m south of gate post"
}

export interface BeaconCertificateInput {
  meta: BeaconCertMeta
  location: {
    parcelRef: string          // e.g. LR/NYERI/MWEIGA/105
    county: string
    subCounty: string
    location: string
    subLocation: string
    surveyJobNo: string        // DoLS job number
  }
  beacons: BeaconEntry[]
}

// ── Condition display ─────────────────────────────────────────────────────────

const CONDITION_STYLE: Record<BeaconCondition, { label: string; color: string }> = {
  SET:       { label: 'SET',       color: '#14532d' },
  FOUND:     { label: 'FOUND',     color: '#1e3a5f' },
  DISTURBED: { label: 'DISTURBED', color: '#78350f' },
  DESTROYED: { label: 'DESTROYED', color: '#7f1d1d' },
  NOT_FOUND: { label: 'NOT FOUND', color: '#374151' },
}

function esc(value: string | number | undefined | null): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmtCoord(value: string): string {
  if (!value.trim()) return '&mdash;'
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(3) : '&mdash;'
}

// ── Main generator ────────────────────────────────────────────────────────────

export function generateBeaconCertificate(input: BeaconCertificateInput): string {
  const { meta, location, beacons } = input

  const setCount       = beacons.filter(b => b.condition === 'SET').length
  const foundCount     = beacons.filter(b => b.condition === 'FOUND').length
  const disturbedCount = beacons.filter(b => b.condition === 'DISTURBED').length
  const destroyedCount = beacons.filter(b => b.condition === 'DESTROYED').length

  const beaconRows = beacons.map((b, i) => {
    const cond = CONDITION_STYLE[b.condition]
    const east = fmtCoord(b.easting)
    const nrth = fmtCoord(b.northing)
    const elev = fmtCoord(b.elevation)

    return `
<tr style="page-break-inside:avoid;">
  <td class="bold" style="width:6%">${i + 1}</td>
  <td class="bold" style="width:9%">${b.name ? esc(b.name) : '&mdash;'}</td>
  <td style="width:14%">${esc(b.monumentType)}</td>
  <td style="width:10%;text-align:center;">
    <span style="font-weight:bold;color:${cond.color};">${cond.label}</span>
  </td>
  <td class="right mono" style="width:16%">${east}</td>
  <td class="right mono" style="width:16%">${nrth}</td>
  <td class="right mono" style="width:11%">${elev}</td>
  <td style="width:18%">${b.adjacentFeatures ? esc(b.adjacentFeatures) : '&mdash;'}</td>
</tr>
<tr style="background:#f0f4f0 !important;">
  <td colspan="8" style="padding:4px 6px 6px 20px;font-size:8.5pt;font-style:italic;border-top:none;">
    <strong>Description:</strong> ${b.description ? esc(b.description) : '&mdash;'}
  </td>
</tr>`
  }).join('\n')

  const bodyHtml = `

<h2>Location Particulars</h2>
<div class="summary-box">
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;">
    <div style="padding:4px 8px;border-right:1px solid #ccc;">
      <span style="font-size:7pt;text-transform:uppercase;color:#666;display:block;margin-bottom:2px;">Parcel Reference</span>
      <span style="font-weight:bold;font-size:9pt;">${location.parcelRef ? esc(location.parcelRef) : '&mdash;'}</span>
    </div>
    <div style="padding:4px 8px;border-right:1px solid #ccc;">
      <span style="font-size:7pt;text-transform:uppercase;color:#666;display:block;margin-bottom:2px;">Survey Job No.</span>
      <span style="font-weight:bold;font-size:9pt;">${location.surveyJobNo ? esc(location.surveyJobNo) : '&mdash;'}</span>
    </div>
    <div style="padding:4px 8px;">
      <span style="font-size:7pt;text-transform:uppercase;color:#666;display:block;margin-bottom:2px;">County</span>
      <span style="font-weight:bold;font-size:9pt;">${location.county ? esc(location.county) : '&mdash;'}</span>
    </div>
    <div style="padding:4px 8px;border-right:1px solid #ccc;border-top:1px solid #ccc;">
      <span style="font-size:7pt;text-transform:uppercase;color:#666;display:block;margin-bottom:2px;">Sub-County</span>
      <span style="font-weight:bold;font-size:9pt;">${location.subCounty ? esc(location.subCounty) : '&mdash;'}</span>
    </div>
    <div style="padding:4px 8px;border-right:1px solid #ccc;border-top:1px solid #ccc;">
      <span style="font-size:7pt;text-transform:uppercase;color:#666;display:block;margin-bottom:2px;">Location</span>
      <span style="font-weight:bold;font-size:9pt;">${location.location ? esc(location.location) : '&mdash;'}</span>
    </div>
    <div style="padding:4px 8px;border-top:1px solid #ccc;">
      <span style="font-size:7pt;text-transform:uppercase;color:#666;display:block;margin-bottom:2px;">Sub-Location</span>
      <span style="font-weight:bold;font-size:9pt;">${location.subLocation ? esc(location.subLocation) : '&mdash;'}</span>
    </div>
  </div>
</div>

<h2>Beacon Summary &mdash; ${beacons.length} Mark${beacons.length !== 1 ? 's' : ''}</h2>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid #000;margin:6px 0 12px;">
  <div style="padding:8px 12px;text-align:center;border-right:1px solid #ccc;">
    <div style="font-size:18pt;font-weight:bold;color:#14532d;">${setCount}</div>
    <div style="font-size:7.5pt;text-transform:uppercase;color:#555;">Beacons Set</div>
  </div>
  <div style="padding:8px 12px;text-align:center;border-right:1px solid #ccc;">
    <div style="font-size:18pt;font-weight:bold;color:#1e3a5f;">${foundCount}</div>
    <div style="font-size:7.5pt;text-transform:uppercase;color:#555;">Beacons Found</div>
  </div>
  <div style="padding:8px 12px;text-align:center;border-right:1px solid #ccc;">
    <div style="font-size:18pt;font-weight:bold;color:#78350f;">${disturbedCount}</div>
    <div style="font-size:7.5pt;text-transform:uppercase;color:#555;">Disturbed</div>
  </div>
  <div style="padding:8px 12px;text-align:center;">
    <div style="font-size:18pt;font-weight:bold;color:#7f1d1d;">${destroyedCount}</div>
    <div style="font-size:7.5pt;text-transform:uppercase;color:#555;">Destroyed</div>
  </div>
</div>

<h2>Beacon Descriptions &mdash; Survey Regulations 1994, Reg. 20</h2>
<table style="font-size:8.5pt;">
  <thead>
    <tr>
      <th style="width:6%">No.</th>
      <th style="width:9%">Beacon ID</th>
      <th style="width:14%">Monument Type</th>
      <th style="width:10%;text-align:center;">Condition</th>
      <th class="right" style="width:16%">Easting (m)</th>
      <th class="right" style="width:16%">Northing (m)</th>
      <th class="right" style="width:11%">RL (m)</th>
      <th style="width:18%">Adjacent Features</th>
    </tr>
  </thead>
  <tbody>
    ${beaconRows || '<tr><td colspan="8" style="text-align:center;color:#999;font-style:italic;padding:12px;">No beacons entered</td></tr>'}
  </tbody>
</table>

<div class="summary-box" style="margin-top:12px;">
  <div style="font-size:8pt;font-weight:bold;margin-bottom:4px;letter-spacing:0.5px;text-transform:uppercase;">Notes</div>
  <div style="font-size:8pt;line-height:1.65;color:#333;">
    1. Coordinates are in UTM (Arc 1960 / UTM Zone 37S, SRID 21037) unless otherwise stated.<br>
    2. Reduced levels (RL) are relative to Mean Sea Level datum unless otherwise stated.<br>
    3. Monument types and conditions are recorded as observed in the field on the date of survey.<br>
    4. &ldquo;SET&rdquo; = new beacon placed during this survey. &ldquo;FOUND&rdquo; = existing beacon verified in-situ.<br>
    5. Adjacent feature distances are approximate (&plusmn;50mm) and for site-identification purposes only.<br>
    6. Disturbed or destroyed beacons must be reported to the Director of Surveys, Ministry of Lands.
  </div>
</div>`

  return buildPrintDocument(bodyHtml, {
    title:        'Beacon Certificate',
    projectName:  meta.projectName,
    clientName:   meta.clientName,
    surveyorName: meta.surveyorName,
    regNo:        meta.regNo,
    iskNo:        meta.iskNo,
    date:         meta.date,
    instrument:   meta.instrument,
    observer:     meta.observer,
    submissionNo: meta.submissionNo,
    reference:    'Survey Regulations 1994, Reg. 20 &nbsp;|&nbsp; Survey Act Cap 299, s.22 &nbsp;|&nbsp; Cadastral Survey Standards Manual',
  })
}

export function printBeaconCertificate(input: BeaconCertificateInput): void {
  openPrint(generateBeaconCertificate(input))
}
