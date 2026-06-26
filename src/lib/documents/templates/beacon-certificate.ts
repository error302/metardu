/**
 * Beacon Certificate Template
 * 
 * Certificate for beacon preservation with coordinates.
 * A4 portrait.
 */

import PDFDocument from 'pdfkit';
import { createSurveyDocument, drawLine, drawRect, drawText, PAPER_SIZES, LINE_WEIGHTS, TEXT_SIZES } from '../pdf-engine';

export interface BeaconCertificateData {
  beaconName: string;
  beaconType: string;
  easting: number;
  northing: number;
  elevation?: number;
  datum: string;
  projection: string;
  description: string;
  surveyorName: string;
  surveyorLicense: string;
  date: string;
  projectReference: string;
}

export async function generateBeaconCertificate(data: BeaconCertificateData): Promise<Buffer> {
  const doc = createSurveyDocument({
    paperSize: 'A4',
    orientation: 'portrait',
    scale: 1,
    metadata: {
      title: `Beacon Certificate - ${data.beaconName}`,
      surveyorName: data.surveyorName,
      surveyorLicense: data.surveyorLicense,
      projectReference: data.projectReference,
      date: data.date,
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const pdfPromise = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const mx = 20;
  let y = 20;

  // ─── Header ──────────────────────────────────────────────
  drawText(doc, 'REPUBLIC OF KENYA', mx, y, 4, { bold: true, align: 'center' });
  y += 7;
  drawText(doc, 'BEACON PRESERVATION CERTIFICATE', mx, y, 5, { bold: true, align: 'center' });
  y += 10;
  drawLine(doc, mx, y, 210 - mx, y, LINE_WEIGHTS.titleBorder);
  y += 8;

  // ─── Certificate Text ────────────────────────────────────
  drawText(doc, 'This is to certify that the beacon described below has been established', mx, y, 2.5);
  y += 5;
  drawText(doc, 'and preserved in accordance with the Survey Act.', mx, y, 2.5);
  y += 10;

  // ─── Beacon Details ─────────────────────────────────────
  const fields = [
    { label: 'Beacon Name/Number:', value: data.beaconName },
    { label: 'Beacon Type:', value: data.beaconType },
    { label: 'Easting:', value: data.easting.toFixed(3) + ' m' },
    { label: 'Northing:', value: data.northing.toFixed(3) + ' m' },
    { label: 'Elevation:', value: data.elevation != null ? data.elevation.toFixed(3) + ' m' : 'Not determined' },
    { label: 'Datum:', value: data.datum },
    { label: 'Projection:', value: data.projection },
    { label: 'Description:', value: data.description },
    { label: 'Project Reference:', value: data.projectReference },
  ];

  for (const field of fields) {
    drawText(doc, field.label, mx, y, TEXT_SIZES.coordinate, { bold: true });
    drawText(doc, field.value, mx + 55, y, TEXT_SIZES.coordinate);
    drawLine(doc, mx + 55, y + 3, 210 - mx, y + 3, 0.1);
    y += 8;
  }

  // ─── Signatures ──────────────────────────────────────────
  y += 15;
  drawLine(doc, mx + 90, y, 210 - mx, y, 0.2);
  drawText(doc, data.surveyorName, mx + 90, y + 2, TEXT_SIZES.coordinate);
  drawText(doc, `License: ${data.surveyorLicense}`, mx + 90, y + 5, TEXT_SIZES.small);

  y += 12;
  drawLine(doc, mx + 90, y, 210 - mx, y, 0.2);
  drawText(doc, 'Date', mx + 90, y + 2, TEXT_SIZES.small);

  doc.end();
  return pdfPromise;
}
