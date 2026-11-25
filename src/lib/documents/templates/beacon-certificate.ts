/**
 * Beacon Certificate Template
 * 
 * Certificate for beacon preservation with coordinates.
 * A4 portrait.
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
import {
  ALL_COUNTRIES,
  getBeaconRule,
  getCountryStandard,
  type SurveyingCountry,
} from '@/lib/country/standards';
import { CrsError } from '@/lib/spatial/projectCrs';
import { resolvePrintableCrs } from '@/lib/spatial/projectReferenceSystem';

export interface BeaconCertificateData {
  beaconName: string;
  beaconType: string;
  /** Beacon condition (e.g., 'Found intact', 'Disturbed', 'Newly established', 'Missing') */
  beaconCondition: string;
  easting: number;
  northing: number;
  elevation?: number;
  /** Jurisdiction selected for the certificate; statutory text is derived from its registry entry. */
  country: SurveyingCountry;
  /** Registry CRS code selected for the certificate (e.g. 'EPSG:21037'). */
  horizontalCrs: string;
  /** Vertical datum / height reference, when declared. */
  verticalDatum?: string;
  description: string;
  /** Date the beacon was established or found */
  dateOfEstablishment: string;
  surveyorName: string;
  surveyorLicense: string;
  date: string;
  projectReference: string;
}

async function generateBeaconCertificatePdf(
  data: BeaconCertificateData,
  options?: TemplateGenerateOptions
): Promise<Buffer> {
  const plan: PlanId = options?.plan ?? 'free';
  const companyLogo: ResolvedLogo | null = options?.companyLogo ?? null;
  const pageW = PAPER_SIZES.A4.width;
  const pageH = PAPER_SIZES.A4.height;

  const reference = resolvePrintableCrs(data.horizontalCrs);
  if (!reference.ok) {
    throw new CrsError('CRS_INVALID', reference.message);
  }
  if (!ALL_COUNTRIES.some(country => country.id === data.country)) {
    throw new Error(`Unrecognised jurisdiction "${String(data.country)}". Select a jurisdiction from the country standards registry.`);
  }
  const jurisdiction = getCountryStandard(data.country);
  const beaconRule = getBeaconRule(data.country);

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
    companyLogo: companyLogo?.data ?? null,
    plan,
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const pdfPromise = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  // METARDU watermark for free plan
  if (plan === 'free') {
    drawMetarduWatermark(doc, pageW, pageH);
  }

  const mx = 20;
  let y = 20;

  // ─── Header with logo ──────────────────────────────────
  if (companyLogo?.data) {
    drawCompanyLogo(doc, companyLogo.data, mx, y, 30, 10);
    y += 3;
  }
  drawText(doc, jurisdiction.name.toUpperCase(), mx, y, 4, { bold: true, align: 'center' });
  y += 7;
  drawText(doc, 'BEACON PRESERVATION CERTIFICATE', mx, y, 5, { bold: true, align: 'center' });
  y += 7;
  drawText(doc, 'DRAFT — NOT CERTIFIED', mx, y, 3.5, { bold: true, align: 'center', color: '#8a1c1c' });
  y += 8;
  drawLine(doc, mx, y, 210 - mx, y, LINE_WEIGHTS.titleBorder);
  y += 8;

  // ─── Certificate Text ────────────────────────────────────
  drawText(doc, 'This draft records the beacon described below for professional review.', mx, y, 2.5);
  y += 5;
  drawText(doc, 'It is not a certified survey until signed and authenticated in the applicable jurisdiction.', mx, y, 2.5);
  y += 6;
  drawText(doc, `Jurisdictional beacon rule: ${beaconRule.regulation}`, mx, y, 2.2);
  y += 10;

  // ─── Beacon Details ─────────────────────────────────────
  const fields = [
    { label: 'Beacon Name/Number:', value: data.beaconName },
    { label: 'Beacon Type:', value: data.beaconType },
    { label: 'Beacon Condition:', value: data.beaconCondition },
    { label: 'Easting:', value: data.easting.toFixed(3) + ' m' },
    { label: 'Northing:', value: data.northing.toFixed(3) + ' m' },
    { label: 'Elevation:', value: data.elevation != null ? data.elevation.toFixed(3) + ' m' : 'Not determined' },
    { label: 'Coordinate reference:', value: reference.crs.label },
    { label: 'Vertical datum:', value: data.verticalDatum?.trim() || 'NOT DECLARED' },
    { label: 'Date of Establishment:', value: data.dateOfEstablishment },
    { label: 'Description:', value: data.description },
    { label: 'Project Reference:', value: data.projectReference },
  ];

  for (const field of fields) {
    drawText(doc, field.label, mx, y, TEXT_SIZES.coordinate, { bold: true });
    drawText(doc, field.value, mx + 55, y, TEXT_SIZES.coordinate);
    drawLine(doc, mx + 55, y + 3, 210 - mx, y + 3, 0.1);
    y += 8;
  }

  // ─── Beacon photo placeholder ─────────────────────────
  y += 10;
  drawRect(doc, mx, y, 50, 35, 0.15);
  drawText(doc, 'BEACON PHOTO', mx + 10, y + 15, 2, { color: '#999999' });

  // ─── Signatures ──────────────────────────────────────────
  y += 45;

  // Surveyor signature
  drawLine(doc, mx, y, mx + 70, y, 0.2);
  drawText(doc, data.surveyorName, mx, y + 2, TEXT_SIZES.coordinate);
  drawText(doc, `License: ${data.surveyorLicense}`, mx, y + 5, TEXT_SIZES.small);
  drawText(doc, 'Surveyor Signature', mx, y + 8, TEXT_SIZES.small);

  // Date
  drawLine(doc, mx + 90, y, mx + 140, y, 0.2);
  drawText(doc, 'Date', mx + 90, y + 2, TEXT_SIZES.small);
  drawText(doc, data.date, mx + 90, y + 5, TEXT_SIZES.small);

  // Jurisdictional approval, where the selected authority requires one.
  y += 15;
  drawLine(doc, mx, y, 210 - mx, y, LINE_WEIGHTS.titleBorder);
  y += 5;
  drawText(doc, 'JURISDICTIONAL APPROVAL (IF REQUIRED)', mx, y, TEXT_SIZES.coordinate, { bold: true });
  y += 8;
  drawLine(doc, mx + 90, y, 210 - mx, y, 0.2);
  drawText(doc, 'Approved / Date', mx + 90, y + 2, TEXT_SIZES.small);

  y += 8;
  drawLine(doc, mx + 90, y, 210 - mx, y, 0.2);
  drawText(doc, 'Official Stamp', mx + 90, y + 2, TEXT_SIZES.small);

  doc.end();
  return pdfPromise;
}

/** Keep backward-compatible named export */
export async function generateBeaconCertificate(data: BeaconCertificateData): Promise<Buffer> {
  return generateBeaconCertificatePdf(data);
}

/** Template registration object */
export const BEACON_CERTIFICATE_TEMPLATE: DocumentTemplate<BeaconCertificateData> = {
  id: 'beacon-certificate',
  name: 'Beacon Preservation Certificate',
  description: 'A4 portrait certificate for beacon preservation with coordinates and photo placeholder',
  documentType: 'beacon-certificate',
  paperSize: 'A4',
  orientation: 'portrait',
  generate: generateBeaconCertificatePdf,
};
