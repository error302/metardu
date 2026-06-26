/**
 * PDF Engine — Vector PDF Generation for Survey Documents
 * 
 * Generates professional vector PDFs for deed plans, traverse sheets,
 * and other Kenya survey documents. All lines, arcs, and text are
 * vector paths — no raster elements except for aerial photos.
 * 
 * Line weights follow Kenya Survey Department standards:
 * - Boundary lines: 0.5mm
 * - Plot boundaries: 0.3mm
 * - Dimension lines: 0.15mm
 * - Grid lines: 0.1mm
 * - Contour index: 0.5mm
 * - Contour intermediate: 0.15mm
 * 
 * Text sizes:
 * - Title block: 5mm caps
 * - Coordinates: 2.5mm
 * - Bearings: 2mm
 * - North arrow label: 3mm
 */

import PDFDocument from 'pdfkit';

// ─── Paper Size Constants (mm) ───────────────────────────────────

export const PAPER_SIZES = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A2: { width: 420, height: 594 },
  A1: { width: 594, height: 841 },
  A0: { width: 841, height: 1189 },
} as const;

export type PaperSizeName = keyof typeof PAPER_SIZES;

// ─── Kenya Standard Line Weights (mm) ────────────────────────────

export const LINE_WEIGHTS = {
  schemeBoundary: 0.5,
  parcelBoundary: 0.3,
  dimensionLine: 0.15,
  gridLine: 0.1,
  contourIndex: 0.5,
  contourIntermediate: 0.15,
  titleBorder: 0.7,
  buildingOutline: 0.25,
  waterLine: 0.3,
  roadLine: 0.4,
} as const;

// ─── Kenya Standard Text Sizes (mm) ──────────────────────────────

export const TEXT_SIZES = {
  titleBlock: 5,
  subTitle: 4,
  coordinate: 2.5,
  bearing: 2,
  dimension: 2,
  northArrow: 3,
  gridLabel: 2,
  legend: 2.5,
  small: 1.5,
} as const;

// ─── Types ───────────────────────────────────────────────────────

export interface DocumentMetadata {
  title: string;
  surveyorName: string;
  surveyorLicense: string;
  projectReference: string;
  date: string;
  county?: string;
  lrNumber?: string;
}

export interface PDFGenerationOptions {
  paperSize: PaperSizeName;
  orientation: 'portrait' | 'landscape';
  scale: number;
  metadata: DocumentMetadata;
  dpi?: number;
}

// ─── Core PDF Engine ─────────────────────────────────────────────

/**
 * Create a new PDF document configured for survey document output.
 * 
 * Uses mm units internally for precision, converts to PDF points (1pt = 0.3528mm).
 * All vector operations use exact coordinates for plotting accuracy.
 */
export function createSurveyDocument(options: PDFGenerationOptions): PDFKit.PDFDocument {
  const paper = PAPER_SIZES[options.paperSize];
  const isLandscape = options.orientation === 'landscape';
  
  const width = isLandscape ? paper.height : paper.width;
  const height = isLandscape ? paper.width : paper.height;
  
  // Convert mm to points (1mm = 2.8346 pt)
  const mmToPt = 2.8346;
  const pageWidthPt = width * mmToPt;
  const pageHeightPt = height * mmToPt;
  
  const doc = new PDFDocument({
    size: [pageWidthPt, pageHeightPt],
    margins: {
      top: 10 * mmToPt,
      bottom: 10 * mmToPt,
      left: 10 * mmToPt,
      right: 10 * mmToPt,
    },
    info: {
      Title: options.metadata.title,
      Author: `${options.metadata.surveyorName} (License: ${options.metadata.surveyorLicense})`,
      Subject: options.metadata.projectReference,
      Creator: 'METARDU Survey Engine',
      CreationDate: new Date(),
    },
  });
  
  return doc;
}

/**
 * Draw a line with a specific weight in mm.
 */
export function drawLine(
  doc: PDFKit.PDFDocument,
  x1: number, y1: number,
  x2: number, y2: number,
  weightMm: number,
  color: string = 'black'
): void {
  const mmToPt = 2.8346;
  
  doc
    .save()
    .lineWidth(weightMm * mmToPt)
    .strokeColor(color)
    .moveTo(x1 * mmToPt, y1 * mmToPt)
    .lineTo(x2 * mmToPt, y2 * mmToPt)
    .stroke()
    .restore();
}

/**
 * Draw text with a specific size in mm.
 */
export function drawText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number, y: number,
  sizeMm: number,
  options: {
    align?: 'left' | 'center' | 'right';
    color?: string;
    bold?: boolean;
  } = {}
): void {
  const mmToPt = 2.8346;
  const fontSizePt = sizeMm * mmToPt;
  
  doc
    .save()
    .fontSize(fontSizePt)
    .fillColor(options.color ?? 'black')
    .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
    .text(text, x * mmToPt, y * mmToPt, {
      align: options.align ?? 'left',
      lineBreak: false,
    })
    .restore();
}

/**
 * Draw a rectangle with specific line weight.
 */
export function drawRect(
  doc: PDFKit.PDFDocument,
  x: number, y: number,
  width: number, height: number,
  weightMm: number,
  color: string = 'black',
  fill?: string
): void {
  const mmToPt = 2.8346;
  
  doc
    .save()
    .lineWidth(weightMm * mmToPt)
    .strokeColor(color)
    .rect(x * mmToPt, y * mmToPt, width * mmToPt, height * mmToPt);
  
  if (fill) {
    doc.fillAndStroke(fill, color);
  } else {
    doc.stroke();
  }
  
  doc.restore();
}

/**
 * Draw a circle (beacon symbol).
 */
export function drawCircle(
  doc: PDFKit.PDFDocument,
  cx: number, cy: number,
  radiusMm: number,
  weightMm: number,
  color: string = 'black'
): void {
  const mmToPt = 2.8346;
  
  doc
    .save()
    .lineWidth(weightMm * mmToPt)
    .strokeColor(color)
    .circle(cx * mmToPt, cy * mmToPt, radiusMm * mmToPt)
    .stroke()
    .restore();
}

/**
 * Draw a cross inside a circle (Kenya beacon symbol).
 */
export function drawBeaconSymbol(
  doc: PDFKit.PDFDocument,
  cx: number, cy: number,
  diameterMm: number = 3,
  weightMm: number = 0.15,
  color: string = 'black'
): void {
  const radius = diameterMm / 2;
  
  // Circle
  drawCircle(doc, cx, cy, radius, weightMm, color);
  
  // Cross inside circle
  const crossSize = radius * 0.6;
  drawLine(doc, cx - crossSize, cy, cx + crossSize, cy, weightMm, color);
  drawLine(doc, cx, cy - crossSize, cx, cy + crossSize, weightMm, color);
}

/**
 * Draw a north arrow at specified position.
 */
export function drawNorthArrow(
  doc: PDFKit.PDFDocument,
  x: number, y: number,
  sizeMm: number = 15,
  convergence?: number
): void {
  const mmToPt = 2.8346;
  const s = sizeMm * mmToPt;
  const cx = x * mmToPt;
  const cy = y * mmToPt;
  
  doc.save();
  doc.strokeColor('black').lineWidth(0.3 * mmToPt).fillColor('black');
  
  // Arrow body (triangle pointing up)
  doc
    .moveTo(cx, cy - s / 2)           // Top point
    .lineTo(cx - s / 4, cy + s / 4)   // Bottom left
    .lineTo(cx, cy + s / 8)            // Bottom center indent
    .lineTo(cx + s / 4, cy + s / 4)   // Bottom right
    .closePath()
    .fillAndStroke('black', 'black');
  
  // Right half lighter
  doc
    .moveTo(cx, cy - s / 2)
    .lineTo(cx + s / 4, cy + s / 4)
    .lineTo(cx, cy + s / 8)
    .closePath()
    .fillAndStroke('white', 'black');
  
  // N label
  doc
    .fontSize(3 * mmToPt)
    .font('Helvetica-Bold')
    .text('N', cx - 2 * mmToPt, cy - s / 2 - 4 * mmToPt, {
      align: 'center',
      width: 4 * mmToPt,
    });
  
  // Convergence notation if provided
  if (convergence !== undefined && Math.abs(convergence) > 0.001) {
    const convStr = `γ = ${convergence.toFixed(1)}°`;
    doc
      .fontSize(1.5 * mmToPt)
      .font('Helvetica')
      .text(convStr, cx - 10 * mmToPt, cy + s / 2 + 2 * mmToPt, {
        width: 20 * mmToPt,
        align: 'center',
      });
  }
  
  doc.restore();
}

/**
 * Draw a graphical scale bar.
 * Must be verified to ±0.5mm accuracy on paper.
 */
export function drawScaleBar(
  doc: PDFKit.PDFDocument,
  x: number, y: number,
  scale: number,
  paperSizeMm: number,
  groundDistanceM: number,
  weightMm: number = 0.3
): void {
  const mmToPt = 2.8346;
  const barLengthMm = (groundDistanceM / scale) * 1000; // Convert to mm on paper
  
  // Main bar
  drawLine(doc, x, y, x + barLengthMm, y, weightMm);
  
  // End ticks
  const tickHeight = 2;
  drawLine(doc, x, y - tickHeight / 2, x, y + tickHeight / 2, weightMm);
  drawLine(doc, x + barLengthMm, y - tickHeight / 2, x + barLengthMm, y + tickHeight / 2, weightMm);
  
  // Intermediate ticks
  const numDivisions = 4;
  for (let i = 1; i < numDivisions; i++) {
    const dx = (barLengthMm * i) / numDivisions;
    drawLine(doc, x + dx, y - tickHeight / 4, x + dx, y + tickHeight / 4, weightMm * 0.7);
  }
  
  // Labels
  drawText(doc, '0', x, y + 3, 1.5, { align: 'center' });
  drawText(doc, `${groundDistanceM}m`, x + barLengthMm, y + 3, 1.5, { align: 'center' });
  drawText(doc, `1:${scale}`, x + barLengthMm / 2, y + 6, 2, { align: 'center' });
}
