/**
 * Traverse Computation Sheet Template
 * 
 * A4 landscape sheet showing all traverse computations including
 * corrections, adjusted coordinates, and misclosure analysis.
 */

import PDFDocument from 'pdfkit';
import { createSurveyDocument, drawLine, drawRect, drawText, PAPER_SIZES, LINE_WEIGHTS, TEXT_SIZES } from '../pdf-engine';

export interface TraverseSheetData {
  projectName: string;
  surveyorName: string;
  surveyorLicense: string;
  date: string;
  order: number;
  method: string;
  stations: Array<{
    name: string;
    bearing: string;
    distance: string;
    dE: string;
    dN: string;
    easting: string;
    northing: string;
    correctionE: string;
    correctionN: string;
  }>;
  misclosure: {
    easting: string;
    northing: string;
    linear: string;
    ratio: string;
    angular: string;
  };
}

export async function generateTraverseSheet(data: TraverseSheetData): Promise<Buffer> {
  const doc = createSurveyDocument({
    paperSize: 'A4',
    orientation: 'landscape',
    scale: 1,
    metadata: {
      title: `Traverse Sheet - ${data.projectName}`,
      surveyorName: data.surveyorName,
      surveyorLicense: data.surveyorLicense,
      projectReference: data.projectName,
      date: data.date,
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const pdfPromise = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const mmToPt = 2.8346;
  const mx = 10;
  let y = 10;

  // ─── Header ──────────────────────────────────────────────
  drawText(doc, 'TRAVERSE COMPUTATION SHEET', mx, y, 5, { bold: true });
  y += 7;
  drawText(doc, `${data.projectName} | ${data.method} | ${data.order} Order | ${data.date}`, mx, y, 2.5);
  y += 5;
  drawText(doc, `Surveyor: ${data.surveyorName} (${data.surveyorLicense})`, mx, y, 2);
  y += 6;

  // ─── Column headers ─────────────────────────────────────
  const cols = [
    { header: 'Station', width: 18 },
    { header: 'Bearing', width: 22 },
    { header: 'Distance', width: 20 },
    { header: 'dE', width: 20 },
    { header: 'dN', width: 20 },
    { header: 'Corr. E', width: 16 },
    { header: 'Corr. N', width: 16 },
    { header: 'Easting', width: 28 },
    { header: 'Northing', width: 28 },
  ];

  let cx = mx;
  for (const col of cols) {
    drawRect(doc, cx, y, col.width, 6, 0.15);
    drawText(doc, col.header, cx + 1, y + 1, 1.8, { bold: true, align: 'center' });
    cx += col.width;
  }
  y += 6;

  // ─── Data rows ──────────────────────────────────────────
  const rowH = 5;
  for (const station of data.stations) {
    cx = mx;
    const values = [
      station.name,
      station.bearing,
      station.distance,
      station.dE,
      station.dN,
      station.correctionE,
      station.correctionN,
      station.easting,
      station.northing,
    ];

    for (let i = 0; i < cols.length; i++) {
      drawRect(doc, cx, y, cols[i].width, rowH, 0.08);
      drawText(doc, values[i], cx + 1, y + 1, 1.5);
      cx += cols[i].width;
    }
    y += rowH;
  }

  // ─── Misclosure summary ─────────────────────────────────
  y += 5;
  drawLine(doc, mx, y, 287 - mx, y, 0.3);
  y += 3;
  drawText(doc, 'MISCLOSURE ANALYSIS', mx, y, 3, { bold: true, color: 'var(--accent)' });
  y += 5;
  drawText(doc, `dE: ${data.misclosure.easting}   dN: ${data.misclosure.northing}   Linear: ${data.misclosure.linear}   Ratio: ${data.misclosure.ratio}   Angular: ${data.misclosure.angular}`, mx, y, 2);

  doc.end();
  return pdfPromise;
}
