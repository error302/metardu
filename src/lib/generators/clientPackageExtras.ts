import { createHash } from 'crypto'
import { jsPDF } from 'jspdf'
import type { ResolvedLogo, WatermarkStrategy } from '@/lib/documents/resolve-logo'

export interface ClientPackageFile {
  name: string
  bytes: number
  sha256: string
}

export interface ClientPackagePhoto {
  originalName: string
  packageName?: string
  description?: string | null
  takenAt?: string | null
  included: boolean
  reason?: string
}

export interface ClientPackageCoverInput {
  projectName: string
  clientName?: string | null
  lrNumber?: string | null
  parcelNumber?: string | null
  county?: string | null
  locality?: string | null
  surveyType: string
  surveyorName?: string
  firmName?: string
  iskNumber?: string
  generatedAt: string
  files: ClientPackageFile[]
  photos: ClientPackagePhoto[]
  brandingStrategy: WatermarkStrategy
}

export function hashPackageFile(name: string, data: Buffer): ClientPackageFile {
  return {
    name,
    bytes: data.byteLength,
    sha256: createHash('sha256').update(data).digest('hex'),
  }
}

export function buildSha256Manifest(files: ClientPackageFile[]): string {
  return [
    '# SHA-256 checksums for the survey deliverable package',
    '# Verify a file with: sha256sum <file> (Linux/macOS) or Get-FileHash <file> (Windows PowerShell)',
    ...files.map(file => `${file.sha256}  ${file.name}`),
    '',
  ].join('\n')
}

/**
 * Make a photo filename safe for a ZIP entry and unique within the package.
 * Survey file names come from devices and reports, so they cannot be trusted
 * as archive paths.
 */
export function safePackagePhotoName(input: string | null | undefined, used: Set<string>): string {
  const raw = (input ?? '')
    .split(/[\\/]/)
    .filter(Boolean)
    .at(-1)
    ?.replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '')

  const fallback = 'field-photo.jpg'
  let candidate = raw && raw.length <= 180 ? raw : fallback
  if (!/\.[A-Za-z0-9]{2,5}$/.test(candidate)) candidate = `${candidate}.jpg`

  const dot = candidate.lastIndexOf('.')
  const stem = dot > 0 ? candidate.slice(0, dot) : candidate
  const extension = dot > 0 ? candidate.slice(dot) : ''
  let unique = candidate
  let suffix = 2
  while (used.has(unique.toLowerCase())) {
    unique = `${stem}-${suffix}${extension}`
    suffix += 1
  }
  used.add(unique.toLowerCase())
  return unique
}

function csvCell(value: string | null | undefined): string {
  return `"${(value ?? '').replace(/"/g, '""')}"`
}

export function buildPhotoIndexCsv(photos: ClientPackagePhoto[]): string {
  const rows = [
    'Original_File,Package_File,Description,Taken_At,Status,Reason',
    ...photos.map(photo => [
      csvCell(photo.originalName),
      csvCell(photo.packageName ?? ''),
      csvCell(photo.description ?? ''),
      csvCell(photo.takenAt ?? ''),
      photo.included ? 'included' : 'not_included',
      csvCell(photo.included ? '' : photo.reason ?? 'Unavailable'),
    ].join(',')),
  ]
  return rows.join('\r\n')
}

export function buildClientCoverLines(input: ClientPackageCoverInput): string[] {
  const includedPhotos = input.photos.filter(photo => photo.included).length
  return [
    'SURVEY DELIVERABLE PACKAGE',
    '',
    `Project: ${input.projectName}`,
    `Client: ${input.clientName || 'Not recorded'}`,
    `LR / Parcel: ${input.lrNumber || 'N/A'} / ${input.parcelNumber || 'N/A'}`,
    `County / Locality: ${input.county || 'N/A'} / ${input.locality || 'N/A'}`,
    `Survey type: ${input.surveyType.toUpperCase()}`,
    '',
    `Prepared by: ${input.surveyorName || 'Surveyor not recorded'}`,
    `Firm: ${input.firmName || 'Firm not recorded'}`,
    `ISK / licence: ${input.iskNumber || 'Not recorded'}`,
    `Generated: ${input.generatedAt}`,
    '',
    `Documents and data files: ${input.files.length}`,
    `Field photographs included: ${includedPhotos} of ${input.photos.length} recorded`,
    '',
    'FILE INVENTORY (SHA-256):',
    ...input.files.map(file => `${file.name} — ${file.bytes} bytes — ${file.sha256}`),
    '',
    'The SHA256SUMS.txt file in this package lets the recipient verify that the',
    'listed files have not changed after generation. Packaging does not certify',
    'regulatory compliance or replace the responsible surveyor\u2019s professional',
    'review and sign-off before filing or relying on the documents.',
  ]
}

function imageFormat(mimeType: string): 'PNG' | 'JPEG' | null {
  if (mimeType === 'image/png') return 'PNG'
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'JPEG'
  return null
}

export function renderClientCoverPdf(
  input: ClientPackageCoverInput,
  logo?: ResolvedLogo | null,
): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 16
  let y = 18

  const ensureSpace = (needed: number) => {
    if (y + needed <= pageHeight - 16) return
    doc.addPage()
    y = 18
  }

  const addWrapped = (text: string, size: number, bold = false, gap = 2) => {
    doc.setFontSize(size)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    const lines = doc.splitTextToSize(text, pageWidth - margin * 2) as string[]
    ensureSpace(lines.length * (size * 0.48 + 1) + gap)
    doc.text(lines, margin, y)
    y += lines.length * (size * 0.48 + 1) + gap
  }

  const format = logo ? imageFormat(logo.mimeType) : null
  if (logo && format) {
    try {
      doc.addImage(`data:${logo.mimeType};base64,${logo.data.toString('base64')}`, format, margin, 12, 42, 16)
      y = 36
    } catch {
      y = 18
    }
  }

  if (!logo || !format) {
    doc.setFontSize(17)
    doc.setFont('helvetica', 'bold')
    doc.text(input.brandingStrategy === 'metardu' ? 'METARDU' : (input.firmName || 'Survey Deliverable'), margin, y)
    y += 8
  }

  doc.setDrawColor(209, 123, 71)
  doc.setLineWidth(0.7)
  doc.line(margin, y, pageWidth - margin, y)
  y += 10

  const lines = buildClientCoverLines(input)
  addWrapped(lines[0], 15, true, 5)
  for (const line of lines.slice(2)) {
    if (line.startsWith('FILE INVENTORY')) {
      y += 3
      addWrapped(line, 10, true, 3)
    } else if (line.includes(' — ') && line.includes('bytes')) {
      addWrapped(line, 7.5, false, 1.5)
    } else {
      addWrapped(line, 9.5, false, 2)
    }
  }

  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(110, 110, 110)
    doc.text(`Survey deliverable package — ${input.projectName}`, margin, pageHeight - 8)
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: 'right' })
    doc.setTextColor(0, 0, 0)
  }

  return Buffer.from(doc.output('arraybuffer'))
}
