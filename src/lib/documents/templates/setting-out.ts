/**
 * Setting Out Sheet Template
 *
 * A4 portrait document for setting out survey points.
 * Contains a coordinate table with design and offset values.
 *
 * Layout:
 * - Header: Project name, surveyor, date
 * - Table: Point ID, Design E, Design N, Offset E, Offset N, Remarks
 * - Footer: Surveyor signature, checked-by line
 *
 * Watermark:
 * - Free plan: METARDU watermark
 * - Paid plan + company logo: Logo in header
 * - Paid plan + no logo: Blank
 */

import {
  createSurveyDocument,
  drawLine,
  drawRect,
  drawText,
  drawCompanyLogo,
  drawMetarduWatermark,
  PAPER_SIZES,
  LINE_WEIGHTS,
  TEXT_SIZES,
} from '../pdf-engine';
import type { DocumentTemplate, TemplateGenerateOptions } from './registry';
import type { ResolvedLogo } from '../resolve-logo';
import type { PlanId } from '@/lib/subscription/catalog';

// ─── Types ───────────────────────────────────────────────────────

export interface SettingOutPoint {
  /** Point identifier */
  pointId: string;
  /** Design easting coordinate */
  designE: number;
  /** Design northing coordinate */
  designN: number;
  /** Bearing from control station to design point (e.g., "45°30'15\"") */
  bearing?: string;
  /** Distance from control station to design point (meters) */
  distance?: string;
  /** Offset from design position (easting) */
  offsetE?: number;
  /** Offset from design position (northing) */
  offsetN?: number;
  /** Tolerance check result (e.g., "PASS", "FAIL", "±0.010m") */
  toleranceCheck?: string;
  /** Additional remarks */
  remarks?: string;
}

export interface SettingOutSheetData {
  /** Project name */
  projectName: string;
  /** Surveyor name */
  surveyorName: string;
  /** Surveyor license number */
  surveyorLicense: string;
  /** Optional independent checker; blank details remain visibly unrecorded. */
  checkedByName?: string;
  checkedByLicense?: string;
  /** Date of setting out */
  date: string;
  /** Reference station name */
  referenceStation?: string;
  /** Instrument used */
  instrument?: string;
  /** Coordinate system / projection */
  projection?: string;
  /** Datum */
  datum?: string;
  /** List of setting out points */
  points: SettingOutPoint[];
}

// ─── Core Generator ──────────────────────────────────────────────

async function generateSettingOutPdf(
  data: SettingOutSheetData,
  options?: TemplateGenerateOptions
): Promise<Buffer> {
  if (!data.points.length || data.points.length > 1000) throw new RangeError('A setting-out sheet requires 1-1,000 design points.');
  for (const point of data.points) {
    if (!point.pointId.trim() || !Number.isFinite(point.designE) || !Number.isFinite(point.designN)
      || (point.offsetE != null && !Number.isFinite(point.offsetE)) || (point.offsetN != null && !Number.isFinite(point.offsetN))) {
      throw new RangeError('Every setting-out point needs an identifier and finite supplied coordinates/offsets.');
    }
  }
  const plan: PlanId = options?.plan ?? 'free';
  const companyLogo: ResolvedLogo | null = options?.companyLogo ?? null;
  const pageW = PAPER_SIZES.A4.width, pageH = PAPER_SIZES.A4.height;
  const doc = createSurveyDocument({ paperSize: 'A4', orientation: 'portrait', scale: 1, bufferPages: true,
    metadata: { title: `DRAFT Setting Out Sheet - ${data.projectName}`, surveyorName: data.surveyorName || 'Not provided',
      surveyorLicense: data.surveyorLicense || 'Not provided', projectReference: data.projectName, date: data.date },
    companyLogo: companyLogo?.data ?? null, plan });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const mx = 15, rightMargin = 15, mmToPt = 2.8346;
  const width = pageW - mx - rightMargin, contentBottom = pageH - 30;
  const columns = [14, 25, 25, 20, 16, 17, 17, 16, 30];
  const labels = ['Point', 'Design E (m)', 'Design N (m)', 'Bearing', 'Dist (m)', 'Offset E (m)', 'Offset N (m)', 'Entered check', 'Remarks'];
  let y = 15, tableStart = 0;
  const measure = (value: string, cellWidth: number, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(TEXT_SIZES.coordinate * mmToPt);
    return doc.heightOfString(value, { width: cellWidth * mmToPt, lineGap: 1 }) / mmToPt;
  };
  const write = (value: string, x: number, top: number, cellWidth: number, bold = false) => {
    const height = measure(value, cellWidth, bold);
    doc.fillColor('black').text(value, x * mmToPt, top * mmToPt, { width: cellWidth * mmToPt, lineGap: 1 });
    return height;
  };
  const pageHeader = () => {
    y = 15;
    if (plan === 'free') drawMetarduWatermark(doc, pageW, pageH);
    if (companyLogo?.data) drawCompanyLogo(doc, companyLogo.data, mx, y, 30, 10);
    drawText(doc, 'DRAFT - SETTING OUT SHEET', mx + (companyLogo?.data ? 32 : 0), y, 4, { bold: true });
    y += companyLogo?.data ? 12 : 8;
    y += write(data.projectName, mx, y, width, true) + 2;
    y += write(`Entered surveyor: ${data.surveyorName || 'Not provided'} | License: ${data.surveyorLicense || 'Not provided'} | Date: ${data.date}`, mx, y, width) + 2;
    y += write(`Reference station: ${data.referenceStation || 'Not provided'} | Instrument: ${data.instrument || 'Not provided'} | Entered CRS: ${data.projection || 'Not provided'} | Datum: ${data.datum || 'Not provided'}`, mx, y, width) + 2;
    y += write('Entered design data only; control, reference and accuracy are not verified. Coordinates/offsets shown to 0.001 m; missing values are not zero. Entered check text is not acceptance.', mx, y, width) + 3;
    if (y > contentBottom - 30) throw new RangeError('The project heading is too long for a readable setting-out sheet.');
    drawLine(doc, mx, y, pageW - rightMargin, y, LINE_WEIGHTS.titleBorder);
    y += 3;
    const height = Math.max(...labels.map((value, i) => measure(value, columns[i] - 2, true))) + 3;
    let x = mx;
    labels.forEach((value, i) => {
      drawRect(doc, x, y, columns[i], height, 0.2, 'black', '#E8E8E8');
      write(value, x + 1, y + 1.5, columns[i] - 2, true); x += columns[i];
    });
    y += height; tableStart = y;
  };
  const nextPage = () => { doc.addPage(); pageHeader(); };
  try {
    pageHeader();
    for (const point of data.points) {
      const values = [point.pointId, point.designE.toFixed(3), point.designN.toFixed(3), point.bearing ?? '-', point.distance ?? '-',
        point.offsetE == null ? '-' : point.offsetE.toFixed(3), point.offsetN == null ? '-' : point.offsetN.toFixed(3),
        point.toleranceCheck || 'Not supplied', point.remarks ?? '-'];
      const height = Math.max(6, ...values.map((value, i) => measure(value, columns[i] - 2) + 3));
      if (height > contentBottom - tableStart) throw new RangeError('A point row is too long; move extensive notes into a separate report. No points were omitted.');
      if (y + height > contentBottom) nextPage();
      let x = mx;
      values.forEach((value, i) => {
        drawRect(doc, x, y, columns[i], height, 0.08);
        write(value, x + 1, y + 1.5, columns[i] - 2); x += columns[i];
      });
      y += height;
    }
    if (y + 31 > contentBottom) nextPage();
    y += 4;
    drawLine(doc, mx, y, pageW - rightMargin, y, 0.3); y += 3;
    y += write(`All ${data.points.length} supplied design points are included.`, mx, y, width, true) + 2;
    const withOffsets = data.points.filter(point => point.offsetE != null || point.offsetN != null).length;
    const maxE = Math.max(0, ...data.points.map(point => Math.abs(point.offsetE ?? 0)));
    const maxN = Math.max(0, ...data.points.map(point => Math.abs(point.offsetN ?? 0)));
    y += write(`${withOffsets} point(s) include supplied offsets. Max supplied |E| offset: ${maxE.toFixed(3)} m; |N| offset: ${maxN.toFixed(3)} m. These entries are not verified field observations.`, mx, y, width) + 3;

    const signatureGap = 10
    const signatureColumnWidth = (width - signatureGap) / 2
    if (y + 26 > contentBottom) nextPage()
    drawLine(doc, mx, y, pageW - rightMargin, y, LINE_WEIGHTS.titleBorder)
    y += 3
    write('PREPARED BY (SURVEYOR)', mx, y, signatureColumnWidth, true)
    write('CHECKED BY', mx + signatureColumnWidth + signatureGap, y, signatureColumnWidth, true)
    write(`Name: ${data.surveyorName || 'Not provided'}`, mx, y + 5, signatureColumnWidth)
    write(`Registration: ${data.surveyorLicense || 'Not provided'}`, mx, y + 10, signatureColumnWidth)
    const checkX = mx + signatureColumnWidth + signatureGap
    write(`Name: ${data.checkedByName || 'Not supplied'}`, checkX, y + 5, signatureColumnWidth)
    write(`Registration: ${data.checkedByLicense || 'Not supplied'}`, checkX, y + 10, signatureColumnWidth)
    drawLine(doc, mx, y + 17, mx + signatureColumnWidth, y + 17, 0.2)
    drawLine(doc, checkX, y + 17, checkX + signatureColumnWidth, y + 17, 0.2)
    write('Signature', mx, y + 18, signatureColumnWidth)
    write('Signature', checkX, y + 18, signatureColumnWidth)
    write('Date: ____________________', mx, y + 23, signatureColumnWidth)
    write('Date: ____________________', checkX, y + 23, signatureColumnWidth)

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      write(`DRAFT | Entered design data; survey control and accuracy are not verified | Page ${i + 1} of ${range.count}`, mx, pageH - 20, width);
      write('Professional review and approved design are required. This sheet does not certify construction acceptance.', mx, pageH - 14, width);
    }
    doc.end();
  } catch (error) { doc.destroy(error instanceof Error ? error : new Error('Setting-out PDF generation failed.')); }
  return result;
}


// ─── Template Registration ───────────────────────────────────────

export const SETTING_OUT_TEMPLATE: DocumentTemplate<SettingOutSheetData> = {
  id: 'setting-out',
  name: 'Setting Out Sheet',
  description: 'A4 portrait sheet with coordinate table for design and offset values, with surveyor signature block',
  documentType: 'setting-out',
  paperSize: 'A4',
  orientation: 'portrait',
  generate: generateSettingOutPdf,
};
