import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addPageFooter } from './pdfTitleBlock';

// ---------------------------------------------------------------------------
// Input interface
// ---------------------------------------------------------------------------

export interface TraverseComputationSheetInput {
  projectName: string;
  lrNumber: string;
  parcelNumber: string;
  county: string;
  division: string;
  district: string;
  locality: string;
  surveyType: string;
  surveyorName: string;
  iskNumber: string;
  firmName: string;
  referenceNumber: string;
  revision: string;
  observations: Array<{
    station: string;
    hclDeg: number; // decimal degrees
    hcrDeg: number; // decimal degrees
    meanAngleDeg: number;
    slopeDistance: number;
    verticalAngle: number;
    horizontalDistance: number;
    deltaH: number;
  }>;
  legs: Array<{
    from: string;
    to: string;
    includedAngleDeg: number;
    wcbDeg: number;
    hd: number;
    departure: number;
    latitude: number;
    depCorrection: number;
    latCorrection: number;
    adjDep: number;
    adjLat: number;
  }>;
  coordinates: Array<{
    station: string;
    easting: number;
    northing: number;
    rl?: number;
  }>;
  isClosed: boolean;
  totalPerimeter: number;
  sumDepartures: number;
  sumLatitudes: number;
  linearErrorM: number;
  precisionRatio: number;
  accuracyOrder: string;
  allowableMisclosureM: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert decimal degrees to DMS string e.g. 45°30'15.2" */
function decimalToDMS(deg: number): string {
  const absolute = Math.abs(deg);
  const d = Math.floor(absolute);
  const minFloat = (absolute - d) * 60;
  const m = Math.floor(minFloat);
  const s = (minFloat - m) * 60;
  return `${d}°${String(m).padStart(2, '0')}'${s.toFixed(1)}"`;
}

/** Convert decimal degrees to WCB (Whole Circle Bearing) quadrant string e.g. N 45°30'15.2" E */
function decimalToWCB(deg: number): string {
  const normalised = ((deg % 360) + 360) % 360;
  if (normalised <= 90) {
    return `N ${decimalToDMS(normalised)} E`;
  } else if (normalised <= 180) {
    return `S ${decimalToDMS(180 - normalised)} E`;
  } else if (normalised <= 270) {
    return `S ${decimalToDMS(normalised - 180)} W`;
  } else {
    return `N ${decimalToDMS(360 - normalised)} W`;
  }
}

/** Format a precision ratio like "1:12500" */
function formatPrecisionRatio(ratio: number): string {
  if (ratio <= 0 || !isFinite(ratio)) return '—';
  return `1:${Math.round(ratio).toLocaleString()}`;
}

/** Format a number to fixed decimals, with fallback for undefined / NaN */
function fmt(val: number | undefined, decimals: number): string {
  if (val === undefined || val === null || isNaN(val)) return '—';
  return val.toFixed(decimals);
}

// ---------------------------------------------------------------------------
// Page dimensions — A3 landscape
// ---------------------------------------------------------------------------

const PAGE_W = 420;
const PAGE_H = 297;
const MARGIN = 10;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Type alias for accessing autoTable's finalY
type DocWithTable = jsPDF & { lastAutoTable: { finalY: number } };

function getLastY(doc: jsPDF): number {
  return (doc as unknown as DocWithTable).lastAutoTable.finalY;
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export function generateTraverseComputationSheet(
  input: TraverseComputationSheetInput
): Buffer {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a3',
  });

  const today = new Date().toLocaleDateString('en-KE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  // Estimate total pages
  const totalPages = estimateTotalPages(
    input.observations.length,
    input.legs.length,
    input.coordinates.length
  );
  let currentPage = 1;

  // =========================================================================
  // PAGE 1 — Header + Info + Tables 1 & 2
  // =========================================================================
  drawPageHeader(doc, input, today);
  drawProjectInfoBlock(doc, input, today);
  drawSurveyorInfoBlock(doc, input);

  let y = 56;

  // --- Table 1: Reduced Observations ---
  y = drawReducedObservationsTable(doc, input, y);
  y += 4;

  // Check if we need a new page for Table 2
  if (y > PAGE_H - 80) {
    addPageFooter(doc, currentPage, totalPages, input.projectName);
    doc.addPage();
    currentPage++;
    y = MARGIN;
  }

  // --- Table 2: Traverse Computation — Bowditch Adjustment ---
  y = drawTraverseComputationTable(doc, input, y);
  y += 4;

  // Check if we need a new page for Table 3
  if (y > PAGE_H - 80) {
    addPageFooter(doc, currentPage, totalPages, input.projectName);
    doc.addPage();
    currentPage++;
    y = MARGIN;
  }

  // --- Table 3: Final Coordinate Schedule ---
  y = drawFinalCoordinateSchedule(doc, input, y);
  y += 4;

  // Check if we need a new page for Closure Summary + Certificate
  if (y > PAGE_H - 120) {
    addPageFooter(doc, currentPage, totalPages, input.projectName);
    doc.addPage();
    currentPage++;
    y = MARGIN;
  }

  // --- Closure Summary ---
  y = drawClosureSummary(doc, input, y);
  y += 6;

  // Check if we need a new page for certificate
  if (y > PAGE_H - 70) {
    addPageFooter(doc, currentPage, totalPages, input.projectName);
    doc.addPage();
    currentPage++;
    y = MARGIN;
  }

  // --- Surveyor's Certificate ---
  drawSurveyorCertificate(doc, input, y, today);

  // --- Professional Disclaimer ---
  drawDisclaimer(doc);

  // Finalize page footers on all pages
  const actualTotal = doc.getNumberOfPages();
  for (let p = 1; p <= actualTotal; p++) {
    doc.setPage(p);
    addPageFooter(doc, p, actualTotal, input.projectName);
  }

  return Buffer.from(doc.output('arraybuffer'));
}

// ---------------------------------------------------------------------------
// Estimate page count
// ---------------------------------------------------------------------------

function estimateTotalPages(
  obsCount: number,
  legCount: number,
  coordCount: number
): number {
  const maxRows = Math.max(obsCount, legCount, coordCount);
  if (maxRows <= 12) return 1;
  if (maxRows <= 25) return 2;
  return 3;
}

// ---------------------------------------------------------------------------
// Draw the Republic of Kenya / DoLS header
// ---------------------------------------------------------------------------

function drawPageHeader(
  doc: jsPDF,
  _input: TraverseComputationSheetInput,
  _today: string
): void {
  const cx = PAGE_W / 2;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(1.0);
  doc.rect(MARGIN, MARGIN, CONTENT_W, 36);

  // Double border effect
  doc.setLineWidth(0.3);
  doc.rect(MARGIN + 1.5, MARGIN + 1.5, CONTENT_W - 3, 33);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('REPUBLIC OF KENYA', cx, MARGIN + 10, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40, 40, 40);
  doc.text('DEPARTMENT OF LAND SERVICES', cx, MARGIN + 17, {
    align: 'center',
  });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('TRAVERSE COMPUTATION SHEET', cx, MARGIN + 26, {
    align: 'center',
  });

  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(80, 80, 80);
  doc.text(
    'Survey Act Cap 299 — Survey Regulations 1994 — Arc 1960 / UTM Zone 37S (EPSG:21037)',
    cx,
    MARGIN + 33,
    { align: 'center' }
  );
}

// ---------------------------------------------------------------------------
// Draw project information block (left column)
// ---------------------------------------------------------------------------

function drawProjectInfoBlock(
  doc: jsPDF,
  input: TraverseComputationSheetInput,
  today: string
): void {
  const x = MARGIN;
  const y = 50;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('PROJECT INFORMATION', x, y);

  const fields: [string, string][] = [
    ['LR Number', input.lrNumber || '—'],
    ['Parcel Number', input.parcelNumber || '—'],
    ['County', input.county || '—'],
    ['Division', input.division || '—'],
    ['District', input.district || '—'],
    ['Locality', input.locality || '—'],
    ['Survey Type', input.surveyType || '—'],
    ['Reference No.', input.referenceNumber || '—'],
    ['Revision', input.revision || '—'],
    ['Date', today],
  ];

  autoTable(doc, {
    startY: y + 2,
    head: [['Field', 'Value']] as unknown as (string | number)[][],
    body: fields as unknown as (string | number)[][],
    styles: { fontSize: 6.5, cellPadding: 1 },
    headStyles: { fillColor: [30, 30, 30], textColor: 255, fontSize: 6.5 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 32 },
      1: { cellWidth: 80 },
    },
    margin: { left: x },
    tableWidth: 112,
    theme: 'grid',
  });
}

// ---------------------------------------------------------------------------
// Draw surveyor information block (right column, beside project info)
// ---------------------------------------------------------------------------

function drawSurveyorInfoBlock(
  doc: jsPDF,
  input: TraverseComputationSheetInput
): void {
  const x = MARGIN + 120;
  const y = 50;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('SURVEYOR INFORMATION', x, y);

  const fields: [string, string][] = [
    ['Surveyor Name', input.surveyorName || '—'],
    ['ISK Number', input.iskNumber || '—'],
    ['Firm', input.firmName || '—'],
    ['Datum', 'Arc 1960 / UTM Zone 37S'],
    ['EPSG', '21037'],
  ];

  autoTable(doc, {
    startY: y + 2,
    head: [['Field', 'Value']] as unknown as (string | number)[][],
    body: fields as unknown as (string | number)[][],
    styles: { fontSize: 6.5, cellPadding: 1 },
    headStyles: { fillColor: [30, 30, 30], textColor: 255, fontSize: 6.5 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 32 },
      1: { cellWidth: 80 },
    },
    margin: { left: x },
    tableWidth: 112,
    theme: 'grid',
  });
}

// ---------------------------------------------------------------------------
// Table 1: Reduced Observations
// ---------------------------------------------------------------------------

function drawReducedObservationsTable(
  doc: jsPDF,
  input: TraverseComputationSheetInput,
  startY: number
): number {
  const x = MARGIN;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('TABLE 1: REDUCED OBSERVATIONS', x, startY);
  startY += 2;

  const obs = input.observations;
  const body: (string | number)[][] = obs.map((o, i) => [
    i + 1,
    o.station,
    decimalToDMS(o.hclDeg),
    decimalToDMS(o.hcrDeg),
    decimalToDMS(o.meanAngleDeg),
    fmt(o.slopeDistance, 3),
    fmt(o.verticalAngle, 4),
    fmt(o.horizontalDistance, 3),
    fmt(o.deltaH, 3),
  ]);

  autoTable(doc, {
    startY,
    head: [
      [
        'No.',
        'Station',
        'HCL',
        'HCR',
        'Mean Angle',
        'SD (m)',
        'VA (°)',
        'HD (m)',
        'ΔH (m)',
      ],
    ] as unknown as (string | number)[][],
    body: body as (string | number)[][],
    styles: { fontSize: 5.5, cellPadding: 1 },
    headStyles: {
      fillColor: [30, 30, 30],
      textColor: 255,
      fontSize: 5.5,
      halign: 'center',
    },
    alternateRowStyles: { fillColor: [245, 248, 250] },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 42, halign: 'center', font: 'courier' },
      3: { cellWidth: 42, halign: 'center', font: 'courier' },
      4: { cellWidth: 42, halign: 'center', font: 'courier' },
      5: { cellWidth: 28, halign: 'right', font: 'courier' },
      6: { cellWidth: 28, halign: 'right', font: 'courier' },
      7: { cellWidth: 28, halign: 'right', font: 'courier' },
      8: { cellWidth: 28, halign: 'right', font: 'courier' },
    },
    margin: { left: x, right: MARGIN },
    tableWidth: CONTENT_W,
    theme: 'grid',
  });

  return getLastY(doc);
}

// ---------------------------------------------------------------------------
// Table 2: Traverse Computation — Bowditch Adjustment
// ---------------------------------------------------------------------------

function drawTraverseComputationTable(
  doc: jsPDF,
  input: TraverseComputationSheetInput,
  startY: number
): number {
  const x = MARGIN;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(
    'TABLE 2: TRAVERSE COMPUTATION — BOWDITCH ADJUSTMENT',
    x,
    startY
  );
  startY += 2;

  const legs = input.legs;
  const body: (string | number)[][] = legs.map((leg, i) => [
    i + 1,
    leg.from,
    leg.to,
    decimalToDMS(leg.includedAngleDeg),
    decimalToWCB(leg.wcbDeg),
    fmt(leg.hd, 3),
    fmt(leg.departure, 4),
    fmt(leg.latitude, 4),
    fmt(leg.depCorrection, 4),
    fmt(leg.latCorrection, 4),
    fmt(leg.adjDep, 4),
    fmt(leg.adjLat, 4),
  ]);

  // Totals row
  const sumDep = legs.reduce((s, l) => s + l.departure, 0);
  const sumLat = legs.reduce((s, l) => s + l.latitude, 0);
  const sumDepCorr = legs.reduce((s, l) => s + l.depCorrection, 0);
  const sumLatCorr = legs.reduce((s, l) => s + l.latCorrection, 0);
  const sumAdjDep = legs.reduce((s, l) => s + l.adjDep, 0);
  const sumAdjLat = legs.reduce((s, l) => s + l.adjLat, 0);
  const sumHD = legs.reduce((s, l) => s + l.hd, 0);

  autoTable(doc, {
    startY,
    head: [
      [
        'No.',
        'From',
        'To',
        'Included\nAngle',
        'WCB',
        'HD (m)',
        'Departure\n(m)',
        'Latitude\n(m)',
        'δ Dep\n(m)',
        'δ Lat\n(m)',
        'Adj Dep\n(m)',
        'Adj Lat\n(m)',
      ],
    ] as unknown as (string | number)[][],
    body: body as (string | number)[][],
    foot: [
      [
        'Σ',
        '',
        '',
        '',
        '',
        fmt(sumHD, 3),
        fmt(sumDep, 4),
        fmt(sumLat, 4),
        fmt(sumDepCorr, 4),
        fmt(sumLatCorr, 4),
        fmt(sumAdjDep, 4),
        fmt(sumAdjLat, 4),
      ],
    ] as (string | number)[][],
    styles: { fontSize: 5, cellPadding: 0.8 },
    headStyles: {
      fillColor: [30, 30, 30],
      textColor: 255,
      fontSize: 4.8,
      halign: 'center',
    },
    footStyles: {
      fillColor: [30, 30, 30],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 5.5,
    },
    alternateRowStyles: { fillColor: [245, 248, 250] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 36, halign: 'center', font: 'courier' },
      4: { cellWidth: 40, halign: 'center', font: 'courier' },
      5: { cellWidth: 22, halign: 'right', font: 'courier' },
      6: { cellWidth: 28, halign: 'right', font: 'courier' },
      7: { cellWidth: 28, halign: 'right', font: 'courier' },
      8: { cellWidth: 24, halign: 'right', font: 'courier' },
      9: { cellWidth: 24, halign: 'right', font: 'courier' },
      10: { cellWidth: 28, halign: 'right', font: 'courier' },
      11: { cellWidth: 28, halign: 'right', font: 'courier' },
    },
    margin: { left: x, right: MARGIN },
    tableWidth: CONTENT_W,
    theme: 'grid',
  });

  return getLastY(doc);
}

// ---------------------------------------------------------------------------
// Table 3: Final Coordinate Schedule
// ---------------------------------------------------------------------------

function drawFinalCoordinateSchedule(
  doc: jsPDF,
  input: TraverseComputationSheetInput,
  startY: number
): number {
  const x = MARGIN;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('TABLE 3: FINAL COORDINATE SCHEDULE', x, startY);

  // Subtitle
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(80, 80, 80);
  doc.text('Arc 1960 / UTM Zone 37S', x + 145, startY);
  startY += 2;

  const coords = input.coordinates;
  const body: (string | number)[][] = coords.map((c, i) => [
    i + 1,
    c.station,
    fmt(c.easting, 3),
    fmt(c.northing, 3),
    c.rl !== undefined && c.rl !== null ? fmt(c.rl, 3) : '—',
  ]);

  autoTable(doc, {
    startY,
    head: [
      [
        'No.',
        'Station',
        'Adjusted Easting (m)',
        'Adjusted Northing (m)',
        'RL (m)',
      ],
    ] as unknown as (string | number)[][],
    body: body as (string | number)[][],
    styles: { fontSize: 6.5, cellPadding: 1.2 },
    headStyles: {
      fillColor: [30, 30, 30],
      textColor: 255,
      fontSize: 6,
      halign: 'center',
    },
    alternateRowStyles: { fillColor: [245, 248, 250] },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: 28, halign: 'center' },
      2: { cellWidth: 50, halign: 'right', font: 'courier' },
      3: { cellWidth: 50, halign: 'right', font: 'courier' },
      4: { cellWidth: 40, halign: 'right', font: 'courier' },
    },
    margin: { left: x, right: MARGIN },
    tableWidth: CONTENT_W,
    theme: 'grid',
  });

  return getLastY(doc);
}

// ---------------------------------------------------------------------------
// Closure Summary
// ---------------------------------------------------------------------------

function drawClosureSummary(
  doc: jsPDF,
  input: TraverseComputationSheetInput,
  startY: number
): number {
  const x = MARGIN;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('CLOSURE SUMMARY', x, startY);
  startY += 2;

  const traverseType = input.isClosed ? 'Closed Traverse' : 'Open Traverse';
  const numLegs = input.legs.length;
  const perimeter = input.totalPerimeter;
  const sumDep = input.sumDepartures;
  const sumLat = input.sumLatitudes;
  const linearErr = input.linearErrorM;
  const linearErrMm = linearErr * 1000;
  const precision = formatPrecisionRatio(input.precisionRatio);
  const order = input.accuracyOrder || '—';
  const allowable = input.allowableMisclosureM;

  const passes = linearErr <= allowable;

  const body: (string | number)[][] = [
    ['Traverse Type', traverseType],
    ['Number of Legs', String(numLegs)],
    ['Perimeter (m)', fmt(perimeter, 3)],
    ['Σ Departure (m)', fmt(sumDep, 4)],
    ['Σ Latitude (m)', fmt(sumLat, 4)],
    ['Linear Misclosure (m)', fmt(linearErr, 4)],
    ['Linear Misclosure (mm)', fmt(linearErrMm, 1)],
    ['Precision Ratio', precision],
    ['Accuracy Order (RDM 1.1 Table 2.4)', order],
    ['Allowable Misclosure (m)', fmt(allowable, 4)],
    ['Status', passes ? 'PASS' : 'FAIL'],
  ];

  const passColor: [number, number, number] = passes
    ? [0, 120, 60]
    : [180, 0, 0];

  autoTable(doc, {
    startY,
    head: [['Parameter', 'Value']] as unknown as (string | number)[][],
    body: body as (string | number)[][],
    styles: { fontSize: 6.5, cellPadding: 1.2 },
    headStyles: { fillColor: [30, 30, 30], textColor: 255, fontSize: 6.5 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 80 },
      1: { cellWidth: 70 },
    },
    margin: { left: x },
    tableWidth: 150,
    theme: 'grid',
    didParseCell: (data) => {
      if (data.section === 'body') {
        const rowIdx = data.row.index;
        const colIdx = data.column.index;
        if (colIdx === 1 && rowIdx === 10) {
          // Status row
          data.cell.styles.textColor = passColor;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  return getLastY(doc);
}

// ---------------------------------------------------------------------------
// Surveyor's Certificate block
// ---------------------------------------------------------------------------

function drawSurveyorCertificate(
  doc: jsPDF,
  input: TraverseComputationSheetInput,
  startY: number,
  today: string
): void {
  const x = MARGIN;
  const certH = 52;
  const certW = CONTENT_W;

  // Outer box
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.6);
  doc.rect(x, startY, certW, certH);

  // Inner border
  doc.setLineWidth(0.2);
  doc.rect(x + 1, startY + 1, certW - 2, certH - 2);

  // Title
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text("SURVEYOR'S CERTIFICATE", x + certW / 2, startY + 6, {
    align: 'center',
  });

  // Certificate text — per Survey Regulations 1994, Regulation 3(2)
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);

  const lines = [
    `I, ${input.surveyorName || '___________________________'}, Licensed Surveyor No. ${input.iskNumber || '___________'},`,
    `of ${input.firmName || '___________________________'}, hereby certify that the computations set out`,
    `in this document were carried out by me (or under my immediate direction and control)`,
    `in accordance with the Survey Act Cap 299 and the Survey Regulations 1994,`,
    `Regulation 3(2), and that to the best of my knowledge and belief the same are correct.`,
    '',
    `Datum: Arc 1960 / UTM Zone 37S (EPSG:21037)`,
    `Date: ${today}`,
  ];

  let lineY = startY + 12;
  for (const line of lines) {
    doc.text(line, x + 4, lineY);
    lineY += 3.5;
  }

  // Signature line
  const sigY = startY + certH - 6;
  doc.setLineWidth(0.3);
  doc.setDrawColor(0);
  doc.line(x + 4, sigY, x + certW / 2 - 4, sigY);
  doc.text('Signature / Date', x + 4, sigY + 3);

  // Stamp area
  doc.setDrawColor(120);
  doc.setLineWidth(0.2);
  doc.rect(x + certW / 2 + 10, sigY - 12, 30, 12);
  doc.setFontSize(5);
  doc.setTextColor(120, 120, 120);
  doc.text('Official Stamp', x + certW / 2 + 15, sigY - 5);
}

// ---------------------------------------------------------------------------
// Professional Disclaimer
// ---------------------------------------------------------------------------

function drawDisclaimer(doc: jsPDF): void {
  const y = PAGE_H - MARGIN - 16;

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);

  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(140, 60, 60);
  doc.text(
    'This document was generated by METARDU, a computation tool. All values must be independently verified by a licensed surveyor.',
    PAGE_W / 2,
    y + 3,
    { align: 'center' }
  );

  doc.setFontSize(5);
  doc.setTextColor(160, 160, 160);
  doc.text(
    'Survey Act Cap 299 · Survey Regulations 1994 · Arc 1960 / UTM Zone 37S (EPSG:21037) · Traverse Computation Sheet',
    PAGE_W / 2,
    y + 7,
    { align: 'center' }
  );
}
