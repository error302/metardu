/**
 * Title Block Generator
 * 
 * Generates the standard Kenya survey plan title block.
 * Positioned at the bottom-right of the plan.
 * 
 * Standard title block contains:
 * - LR Number (Land Registration)
 * - Area (hectares/acres)
 * - Scale (representative fraction + graphical bar)
 * - Surveyor name and license number
 * - Date of survey
 * - County and sub-county
 * - Revision number
 * - Legend
 * - North arrow
 */

import type { PDFKit.PDFDocument } from '../pdf-engine';
import { drawLine, drawRect, drawText, LINE_WEIGHTS, TEXT_SIZES } from '../pdf-engine';
import { drawNorthArrow, drawScaleBar } from '../pdf-engine';

// ─── Types ───────────────────────────────────────────────────────

export interface TitleBlockData {
  lrNumber: string;
  area: string;
  scale: number;
  surveyorName: string;
  surveyorLicense: string;
  date: string;
  county: string;
  subCounty?: string;
  revision?: string;
  projection?: string;
  datum?: string;
}

// ─── Constants ───────────────────────────────────────────────────

const TITLE_BLOCK_WIDTH = 120; // mm
const TITLE_BLOCK_HEIGHT = 45; // mm
const MARGIN = 3; // mm internal padding
const ROW_HEIGHT = 5; // mm per row

// ─── Core Function ───────────────────────────────────────────────

/**
 * Draw the standard Kenya title block on a survey plan.
 * 
 * @param doc - PDFKit document
 * @param x - Bottom-right X position (mm)
 * @param y - Bottom-right Y position (mm)
 * @param data - Title block data
 */
export function drawTitleBlock(
  doc: PDFKit.PDFDocument,
  x: number, y: number,
  data: TitleBlockData
): void {
  const mmToPt = 2.8346;
  
  // Title block origin (top-left corner)
  const bx = x - TITLE_BLOCK_WIDTH;
  const by = y - TITLE_BLOCK_HEIGHT;
  
  // ─── Outer border ────────────────────────────────────────────
  drawRect(doc, bx, by, TITLE_BLOCK_WIDTH, TITLE_BLOCK_HEIGHT, LINE_WEIGHTS.titleBorder);
  
  // ─── Header row ──────────────────────────────────────────────
  const headerY = by + MARGIN;
  drawText(doc, 'DEED PLAN', bx + MARGIN, headerY, TEXT_SIZES.titleBlock, {
    bold: true,
    align: 'center',
  });
  
  // Separator line
  drawLine(doc, bx, by + ROW_HEIGHT * 2, bx + TITLE_BLOCK_WIDTH, by + ROW_HEIGHT * 2, 0.3);
  
  // ─── Data rows (two columns) ────────────────────────────────
  let currentY = by + ROW_HEIGHT * 2 + MARGIN;
  const col1X = bx + MARGIN;
  const col2X = bx + TITLE_BLOCK_WIDTH / 2 + MARGIN;
  const labelWidth = 30;
  
  // Left column
  drawLabelValue(doc, col1X, currentY, 'LR No.:', data.lrNumber, labelWidth);
  drawLabelValue(doc, col1X, currentY + ROW_HEIGHT, 'Area:', data.area, labelWidth);
  drawLabelValue(doc, col1X, currentY + ROW_HEIGHT * 2, 'Scale:', `1:${data.scale}`, labelWidth);
  drawLabelValue(doc, col1X, currentY + ROW_HEIGHT * 3, 'County:', data.county, labelWidth);
  
  // Right column
  drawLabelValue(doc, col2X, currentY, 'Surveyor:', data.surveyorName, labelWidth);
  drawLabelValue(doc, col2X, currentY + ROW_HEIGHT, 'License:', data.surveyorLicense, labelWidth);
  drawLabelValue(doc, col2X, currentY + ROW_HEIGHT * 2, 'Date:', data.date, labelWidth);
  drawLabelValue(doc, col2X, currentY + ROW_HEIGHT * 3, 'Datum:', data.datum ?? 'Arc 1960', labelWidth);
  
  // Column separator
  drawLine(doc, bx + TITLE_BLOCK_WIDTH / 2, by + ROW_HEIGHT * 2, 
           bx + TITLE_BLOCK_WIDTH / 2, by + TITLE_BLOCK_HEIGHT, 0.15);
  
  // ─── North arrow (top-left of title block) ──────────────────
  drawNorthArrow(doc, bx - 15, by + 20, 12, undefined);
  
  // ─── Scale bar (below title block) ──────────────────────────
  const scaleBarY = by + TITLE_BLOCK_HEIGHT + 5;
  const groundDistance = data.scale <= 1000 ? 100 : 200; // meters
  drawScaleBar(doc, bx, scaleBarY, data.scale, TITLE_BLOCK_WIDTH, groundDistance, 0.3);
}

/**
 * Draw a label-value pair.
 */
function drawLabelValue(
  doc: PDFKit.PDFDocument,
  x: number, y: number,
  label: string, value: string,
  labelWidth: number
): void {
  // Label (smaller, left-aligned)
  drawText(doc, label, x, y, TEXT_SIZES.small, { bold: true });
  
  // Value (larger, after label)
  drawText(doc, value, x + labelWidth, y, TEXT_SIZES.coordinate);
}
