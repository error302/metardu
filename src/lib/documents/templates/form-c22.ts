/**
 * Form C-22 Template — Kenya Land Registration
 * 
 * Standard form for deed plan submission to Ardhi House.
 * A4 portrait, with fields for all required registration data.
 */

import PDFDocument from 'pdfkit';
import { createSurveyDocument, drawLine, drawRect, drawText, PAPER_SIZES, LINE_WEIGHTS, TEXT_SIZES } from '../pdf-engine';

export interface FormC22Data {
  lrNumber: string;
  area: string;
  county: string;
  subCounty?: string;
  surveyorName: string;
  surveyorLicense: string;
  date: string;
  deedPlanNumber?: string;
  registry?: string;
  ownerName?: string;
  plotNumber?: string;
}

export async function generateFormC22(data: FormC22Data): Promise<Buffer> {
  const doc = createSurveyDocument({
    paperSize: 'A4',
    orientation: 'portrait',
    scale: 1,
    metadata: {
      title: `Form C-22 - ${data.lrNumber}`,
      surveyorName: data.surveyorName,
      surveyorLicense: data.surveyorLicense,
      projectReference: data.lrNumber,
      date: data.date,
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const pdfPromise = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const mmToPt = 2.8346;
  const mx = 20; // Left margin mm
  let y = 20;    // Current Y position

  // ─── Header ──────────────────────────────────────────────
  drawText(doc, 'REPUBLIC OF KENYA', mx, y, 5, { align: 'center', bold: true });
  y += 8;
  drawText(doc, 'THE LAND REGISTRATION ACT', mx, y, 3.5, { align: 'center', bold: true });
  y += 6;
  drawText(doc, 'FORM C-22', mx, y, 6, { align: 'center', bold: true });
  y += 8;
  drawText(doc, 'APPLICATION FOR REGISTRATION', mx, y, 3, { align: 'center' });
  y += 10;

  // ─── Separator ───────────────────────────────────────────
  drawLine(doc, mx, y, 210 - mx, y, LINE_WEIGHTS.titleBorder);
  y += 8;

  // ─── Form Fields ────────────────────────────────────────
  const fields = [
    { label: 'Land Registration Number:', value: data.lrNumber },
    { label: 'Area:', value: data.area },
    { label: 'County:', value: data.county },
    { label: 'Sub-County:', value: data.subCounty ?? '' },
    { label: 'Registry:', value: data.registry ?? '' },
    { label: 'Owner/Applicant:', value: data.ownerName ?? '' },
    { label: 'Plot Number:', value: data.plotNumber ?? '' },
    { label: 'Deed Plan Number:', value: data.deedPlanNumber ?? '' },
    { label: 'Surveyor Name:', value: data.surveyorName },
    { label: 'Surveyor License:', value: data.surveyorLicense },
    { label: 'Date:', value: data.date },
  ];

  for (const field of fields) {
    // Label
    drawText(doc, field.label, mx, y, TEXT_SIZES.coordinate, { bold: true });
    // Value (after label)
    drawText(doc, field.value, mx + 60, y, TEXT_SIZES.coordinate);
    // Underline for value
    drawLine(doc, mx + 60, y + 3, 210 - mx, y + 3, 0.1);
    y += 8;
  }

  // ─── Signature Area ──────────────────────────────────────
  y += 15;
  drawLine(doc, mx + 100, y, 210 - mx, y, 0.2);
  drawText(doc, 'Signature of Applicant', mx + 100, y + 2, TEXT_SIZES.small);

  y += 15;
  drawLine(doc, mx + 100, y, 210 - mx, y, 0.2);
  drawText(doc, 'Date', mx + 100, y + 2, TEXT_SIZES.small);

  // ─── For Official Use ────────────────────────────────────
  y += 15;
  drawLine(doc, mx, y, 210 - mx, y, LINE_WEIGHTS.titleBorder);
  y += 5;
  drawText(doc, 'FOR OFFICIAL USE ONLY', mx, y, 3, { bold: true });

  doc.end();
  return pdfPromise;
}
