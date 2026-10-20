import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import db from '@/lib/db';
import { computeDeedPlanGeometry } from './deedPlanGeometry';
import { renderBoundaryPlan, drawRevisionHistory, type RoadSegment } from './deedPlanRenderer';
import { addPageFooter } from './pdfTitleBlock';
import { resolveStageReference } from '@/lib/workspaces/stageReference';

interface ProjectRow {
  name: string | null
  survey_type: string | null
  lr_number: string | null
  folio_number: string | null
  register_number: string | null
  fir_number: string | null
  registration_block: string | null
  registration_district: string | null
  locality: string | null
  computations_no: string | null
  field_book_no: string | null
  file_reference: string | null
  client_name: string | null
  survey_date: string | null
  area_ha: string | number | null
  utm_zone: number | null
  datum: string | null
  hemisphere: string | null
  user_id: string
  created_at: string | Date
  surveyor_name: string | null
  surveyor_license: string | null
  firm_name: string | null
}

interface RevisionsRow {
  revisions: Array<{ rev: string; date: string; description: string; by: string }> | null
}

const A3_W = 420;
const A3_H = 297;
const MARGIN = 8;
const PLAN_WIDTH = Math.round(A3_W * 0.63);
const SCHEDULE_X = PLAN_WIDTH + MARGIN;
const SCHEDULE_W = A3_W - SCHEDULE_X - MARGIN;

function getBeaconDescription(monument: string): { type: string; material: string; dimensions: string } {
  const key = (monument ?? '').toUpperCase().replace(/[^A-Z0-9_]/g, '');
  const lookup: Record<string, { type: string; material: string; dimensions: string }> = {
    // Short codes
    'CP':              { type: 'Concrete Pillar',      material: 'Concrete + Steel Rod',       dimensions: '300×300mm, 600mm deep' },
    'CONCRETEBEACON':  { type: 'Concrete Pillar',      material: 'Concrete + Steel Rod',       dimensions: '300×300mm, 600mm deep' },
    'PSC':             { type: 'Precast Concrete',     material: 'Reinforced Concrete',        dimensions: '150×150mm, 450mm deep' },
    'PSCFLUSH':        { type: 'Precast Concrete',     material: 'Reinforced Concrete',        dimensions: '150×150mm, flush' },
    'SSC':             { type: 'Steel Stake',          material: 'Mild Steel',                  dimensions: '12mm sq × 450mm' },
    'TSC':             { type: 'Timber Stake',         material: 'Treated Timber',              dimensions: '50×50mm × 600mm' },
    'IP':              { type: 'Iron Pin',             material: 'Galvanized Iron',             dimensions: '16mm dia × 300mm' },
    'IRONPIN':         { type: 'Iron Pin',             material: 'Galvanized Iron',             dimensions: '16mm dia × 300mm' },
    'MN':              { type: 'Masonry Nail',         material: 'Steel',                       dimensions: '50mm nail' },
    'MASONRYNAIL':     { type: 'Masonry Nail',         material: 'Steel',                       dimensions: '50mm nail' },
    'BM':              { type: 'Bench Mark',           material: 'Concrete + Bronze Plate',     dimensions: '200×200mm' },
    'TBM':             { type: 'Temp. Bench Mark',     material: 'Concrete + Brass Plug',       dimensions: '150×150mm' },
    'FB':              { type: 'Flag Beacon',          material: 'Painted PVC Pipe',            dimensions: '100mm dia × 1200mm' },
    'INDICATORY':      { type: 'Indicatory Beacon',    material: 'Concrete + Steel Rod',        dimensions: '300×300mm, 600mm deep' },
    'RIVET':           { type: 'Brass Rivet',          material: 'Brass',                       dimensions: '12mm dia' },
    'ROADNAIL':        { type: 'Road Nail',            material: 'Steel',                       dimensions: '75mm nail' },
    'SPIKE':           { type: 'Railway Spike',        material: 'Mild Steel',                  dimensions: '300mm × 16mm' },
    'WOODENPEG':       { type: 'Wooden Peg',           material: 'Treated Timber',              dimensions: '50×50mm × 450mm' },
    'FLUSHBRACKET':    { type: 'Flush Bracket',        material: 'Brass / Gunmetal',            dimensions: '100×75mm' },
    'NATURALFEATURE':  { type: 'Natural Feature',      material: '—',                           dimensions: '—' },
    'FENCEPOST':       { type: 'Fence Post',           material: 'Timber / Concrete',           dimensions: '100mm dia' },
    'WALLCORNER':      { type: 'Wall Corner',          material: 'Masonry',                     dimensions: '—' },
  };
  return { type: lookup[key]?.type || monument || 'Not recorded', material: 'Not recorded', dimensions: 'Not recorded' };
}

/**
 * Load Bowditch-adjusted traverse coordinates from the database.
 * Delegates to the shared loadPreAdjustedFromDB() from deedPlanGeometry.ts
 * which now includes field book beacon enrichment.
 * This ensures all output documents use a single, consistent source of truth.
 */

export async function generateDeedPlan(
  projectId: string
): Promise<Buffer> {
  const projectRes = await db.query<ProjectRow>(
    `SELECT
      name, survey_type, lr_number, folio_number, register_number,
      fir_number, registration_block, registration_district,
      locality, computations_no, field_book_no, file_reference,
      client_name, survey_date, area_ha, utm_zone, hemisphere, datum,
      user_id, created_at, surveyor_name, surveyor_license, firm_name
    FROM projects WHERE id = $1`,
    [projectId]
  );
  const project = projectRes.rows[0];

  if (!project) throw new Error('Project not found');
  const references = await db.query<Record<string, unknown>>('SELECT * FROM project_reference_systems WHERE project_id=$1', [projectId]);
  const reference = resolveStageReference(references.rows[0], project);
  const referenceLabel = reference.code ? `${reference.name} (${reference.code}; ${reference.source})` : 'UNVERIFIED — no valid project reference';

  const { fetchSurveyorProfile } = await import('../survey/fetchSurveyorProfile');
  const savedProfile = await fetchSurveyorProfile(projectId);
  const profile = {
    full_name: savedProfile.surveyorName,
    isk_number: savedProfile.licenseNumber,
    firm_name: savedProfile.firmName,
  };

  // ── Coordinate Pipeline: Use Bowditch-adjusted traverse coordinates ──
  // Fetch pre-adjusted coordinates from the traverse_coordinates table.
  // This guarantees 100% consistency with the traverse computation sheet,
  // Form C22, area computation, and all other output documents.
  // Source: Ghilani & Wolf Ch.12 — Bowditch (Compass) Rule
  const geom = await computeDeedPlanGeometry(projectId);

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a3',
  });

  const surveyDate = project.survey_date
    ? new Date(project.survey_date).toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'Not supplied';

  doc.setDrawColor(0);
  doc.setLineWidth(1.0);
  doc.rect(MARGIN, MARGIN, A3_W - MARGIN * 2, A3_H - MARGIN * 2);

  doc.setLineWidth(0.5);
  doc.line(PLAN_WIDTH, MARGIN, PLAN_WIDTH, A3_H - MARGIN);

  // A project street name does not identify which boundary legs abut a road.
  const roadSegments: RoadSegment[] = [];

  const scaleRatio = await renderBoundaryPlan(doc, geom, {
    x: MARGIN,
    y: MARGIN,
    width: PLAN_WIDTH - MARGIN,
    height: A3_H - MARGIN * 2,
  }, {
    roadSegments,
    surveyorName: profile?.full_name ?? undefined,
    surveyorLicence: profile?.isk_number ?? undefined,
    firmName: profile?.firm_name ?? undefined,
  });

  let ry = MARGIN + 4;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('DEED PLAN — UNVERIFIED DRAFT', SCHEDULE_X + SCHEDULE_W / 2, ry + 4, { align: 'center' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text('Boundary geometry for independent review', SCHEDULE_X + SCHEDULE_W / 2, ry + 9, { align: 'center' });
  ry += 13;

  doc.setDrawColor(180);
  doc.setLineWidth(0.2);
  doc.line(SCHEDULE_X, ry, SCHEDULE_X + SCHEDULE_W, ry);
  ry += 4;

  const infoRows = [
    ['Part of L.R. No.', project.lr_number ?? '—'],
    ['Deposited Plan No.', project.folio_number ?? '—'],
    ['FIR No.', project.fir_number ?? '—'],
    ['Register No.', project.register_number ?? '—'],
    ['Reg. Block', project.registration_block ?? '—'],
    ['Reg. District', project.registration_district ?? '—'],
    ['Registry Map Sheet', project.registration_block ?? '—'],
    ['Locality', project.locality ?? '—'],
    ['Computations No.', project.computations_no ?? '—'],
    ['Field Book No.', project.field_book_no ?? '—'],
    ['File Reference', project.file_reference ?? '—'],
    ['Registered Owner', project.client_name ?? '—'],
  ].filter(([, v]) => v !== '—') as [string, string][];

  autoTable(doc, {
    startY: ry,
    head: [['Field', 'Value']],
    body: infoRows,
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [0, 0, 0], textColor: 255, fontSize: 7 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 32 }, 1: { cellWidth: SCHEDULE_W - 32 } },
    margin: { left: SCHEDULE_X, right: MARGIN },
    tableWidth: SCHEDULE_W,
    theme: 'grid',
  });

  ry = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('AREA', SCHEDULE_X, ry);
  ry += 4;

  autoTable(doc, {
    startY: ry,
    body: [
      ['A = co = ' + geom.areaHa.toFixed(4) + ' Ha', geom.areaM2.toFixed(2) + ' m² (' + geom.areaAcres.toFixed(4) + ' Acres)'],
    ],
    styles: { fontSize: 7, cellPadding: 1.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 32 }, 1: { cellWidth: SCHEDULE_W - 32 } },
    margin: { left: SCHEDULE_X, right: MARGIN },
    tableWidth: SCHEDULE_W,
    theme: 'grid',
  });

  ry = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('BEARING & DISTANCE SCHEDULE', SCHEDULE_X, ry);
  ry += 4;

  const bearingBody = geom.bearingSchedule.map((l) => [l.from, l.to, l.bearing, l.distance])

  autoTable(doc, {
    startY: ry,
    head: [['From', 'To', 'Bearing', 'Distance (m)']] as unknown as (string | number)[][],
    body: bearingBody as (string | number)[][],
    styles: { fontSize: 6.5, cellPadding: 1.2 },
    headStyles: { fillColor: [0, 0, 0], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 248, 250] },
    columnStyles: { 0: { cellWidth: 14 }, 1: { cellWidth: 14 }, 2: { cellWidth: 28 }, 3: { cellWidth: SCHEDULE_W - 56 } },
    margin: { left: SCHEDULE_X, right: MARGIN },
    tableWidth: SCHEDULE_W,
    theme: 'grid',
  });

  ry = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('COORDINATE SCHEDULE', SCHEDULE_X, ry);
  ry += 4;

  autoTable(doc, {
    startY: ry,
    head: [['Stn', 'Easting (m)', 'Northing (m)', 'Beacon No.']] as unknown as (string | number)[][],
    body: geom.stations.map((s) => [s.station, s.easting.toFixed(3), s.northing.toFixed(3), s.beaconNo ?? '—']) as unknown as (string | number)[][],
    styles: { fontSize: 6.5, cellPadding: 1.2 },
    headStyles: { fillColor: [0, 0, 0], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 248, 250] },
    columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 24 }, 2: { cellWidth: 24 }, 3: { cellWidth: SCHEDULE_W - 60 } },
    margin: { left: SCHEDULE_X, right: MARGIN },
    tableWidth: SCHEDULE_W,
    theme: 'grid',
  });

  ry = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('BEACON DESCRIPTION', SCHEDULE_X, ry);
  ry += 4;

  const beaconBody = geom.stations.map((s) => {
    const desc = getBeaconDescription(s.monument ?? '');
    const status = s.markStatus || '';
    const condition = status === 'SET' ? 'Set' : status === 'FOUND' ? 'Found' : status === 'REFERENCED' ? 'Referenced' : status === 'DESTROYED' ? 'Destroyed' : status === 'NOT_FOUND' ? 'Not Found' : 'Not recorded';
    return [s.station, desc.type, desc.material, desc.dimensions, condition, 'Not recorded'];
  });

  autoTable(doc, {
    startY: ry,
    head: [['Mark', 'Type', 'Material', 'Dimensions', 'Found/Set', 'Condition']] as unknown as (string | number)[][],
    body: beaconBody as unknown as (string | number)[][],
    styles: { fontSize: 5.5, cellPadding: 1 },
    headStyles: { fillColor: [0, 0, 0], textColor: 255, fontSize: 5.5 },
    alternateRowStyles: { fillColor: [245, 248, 250] },
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 26 },
      2: { cellWidth: 28 },
      3: { cellWidth: SCHEDULE_W - 98 },
      4: { cellWidth: 14 },
      5: { cellWidth: 16 },
    },
    margin: { left: SCHEDULE_X, right: MARGIN },
    tableWidth: SCHEDULE_W,
    theme: 'grid',
  });

  ry = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('TRAVERSE ACCURACY', SCHEDULE_X, ry);
  ry += 4;

  const statusColor: [number, number, number] = geom.closureStatus === 'PASS' ? [0, 120, 60] : [180, 0, 0];

  autoTable(doc, {
    startY: ry,
    body: [
      ['Precision ratio', geom.precisionRatio.replace('∞', 'Infinity')],
      ['Linear misclosure', Number.isFinite(geom.misclosureMm) ? `${geom.misclosureMm.toFixed(1)} mm` : 'UNVERIFIED'],
      ['Status', geom.closureStatus],
      ['Min. standard', '1:5000 (Survey Act Cap 299)'],
    ],
    styles: { fontSize: 6.5, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 32 }, 1: { cellWidth: SCHEDULE_W - 32 } },
    margin: { left: SCHEDULE_X, right: MARGIN },
    tableWidth: SCHEDULE_W,
    theme: 'grid',
    didParseCell: (data) => {
      if (data.row.index === 2 && data.column.index === 1) {
        data.cell.styles.textColor = statusColor;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  ry = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;

  // ── Phase 2: Revision History ──
  // Per Survey Act Cap. 299, every amendment must be recorded
  const revisionsRes = await db.query<RevisionsRow>(
    `SELECT boundary_data->'revisions' AS revisions FROM projects WHERE id = $1`,
    [projectId]
  );
  const savedRevisions = revisionsRes.rows[0]?.revisions || [];
  const revisionH = drawRevisionHistory(doc, SCHEDULE_X, ry, SCHEDULE_W, savedRevisions, profile?.full_name ?? undefined);
  ry += revisionH + 4;

  const certY = ry;
  const certH = A3_H - MARGIN - 2 - certY;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.rect(SCHEDULE_X, certY, SCHEDULE_W, certH);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('DRAFT REVIEW RECORD', SCHEDULE_X + SCHEDULE_W / 2, certY + 4, { align: 'center' });

  const iskNo = profile?.isk_number ?? '___________';
  const survName = profile?.full_name ?? '___________________________';
  const firm = profile?.firm_name ?? '___________________________';

  const certText = [
    `Recorded preparer: ${survName}`,
    `Recorded registration: ${iskNo} (not verified)`,
    `Recorded firm: ${firm}`,
    'Field control, monuments, legal boundary and',
    'professional acceptance remain unverified.',
    'This draft is not certification or authority',
    'to register a parcel or carry out construction.',
    '',
    `Survey date: ${surveyDate}`,
    `Scale: 1:${scaleRatio.toLocaleString()}`,
    ...doc.splitTextToSize(`Project grid: ${referenceLabel}`, SCHEDULE_W - 6) as string[],
  ];

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);

  let lineY = certY + 10;
  certText.forEach((line) => {
    doc.text(line, SCHEDULE_X + 3, lineY);
    lineY += 4;
  });

  const sigY = certY + certH - 10;
  doc.setLineWidth(0.2);
  doc.setDrawColor(0);
  doc.line(SCHEDULE_X + 3, sigY, SCHEDULE_X + SCHEDULE_W - 3, sigY);
  doc.setFontSize(6);
  doc.setTextColor(80);
  doc.text('Independent reviewer / Date (unsigned draft)', SCHEDULE_X + 3, sigY + 3.5);

  addPageFooter(doc, 1, 1, project.name ?? '');

  return Buffer.from(doc.output('arraybuffer'));
}
