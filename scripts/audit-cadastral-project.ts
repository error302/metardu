import { config } from 'dotenv';
import path from 'path';
import { readFile, mkdir, writeFile } from 'fs/promises';

config({ path: '.env', quiet: true } as any);
process.env.DATABASE_URL = `postgresql://${encodeURIComponent(process.env.POSTGRES_USER || 'metardu')}:${encodeURIComponent(process.env.POSTGRES_PASSWORD || '')}@127.0.0.1:5432/${process.env.POSTGRES_DB || 'metardu'}`;
process.env.STORAGE_ROOT = path.resolve('live-test-results/export-storage');

async function audit() {
  const projectId = '0e7f1a12-2e1f-4b33-91ba-27dca290426c';
  const { db } = await import('../src/lib/db');
  const { resolveDocumentEvidence } = await import('../src/lib/reports/documentEvidence');
  const {
    generateComputationSheet,
    generateAreaCertificate,
    generateCoverLetter,
    generateFieldNotes,
    generateBeaconDescriptions,
  } = await import('../src/lib/reports/documentPackage');
  const { generateDocument } = await import('../src/lib/submission/assembleDocument');

  console.log('=== AUDITING PROJECT:', projectId);

  // 1. Load project and survey_points from DB
  const projRes = await db.query('SELECT * FROM projects WHERE id = $1', [projectId]);
  if (!projRes.rows[0]) throw new Error(`Project ${projectId} not found`);
  const project = projRes.rows[0];
  const ptsRes = await db.query('SELECT * FROM survey_points WHERE project_id = $1 ORDER BY created_at', [projectId]);
  const surveyPoints = ptsRes.rows;

  console.log(`Loaded project: "${project.name}", survey_type: ${project.survey_type}, points in survey_points table: ${surveyPoints.length}`);

  // 2. Resolve document evidence
  const evidence = resolveDocumentEvidence(project, surveyPoints.map((p: any) => ({
    name: p.name,
    easting: p.easting,
    northing: p.northing,
    elevation: p.elevation ?? undefined,
    is_control: p.is_control ?? false,
  })));

  console.log('\n--- EVIDENCE RESOLUTION ---');
  console.log('Resolved point names:', evidence.points.map((p: any) => p.name));
  console.log('Coordinates:', evidence.points.map((p: any) => ({ name: p.name, E: p.easting, N: p.northing, Z: p.elevation })));
  console.log('Area:', evidence.area);
  console.log('Traverse:', {
    totalDistance: evidence.traverse?.totalDistance,
    linearError: evidence.traverse?.linearError,
    precisionRatio: evidence.traverse?.precisionRatio,
    precisionGrade: evidence.traverse?.precisionGrade,
  });

  // Verify coordinates
  if (evidence.points.length !== 4) throw new Error(`Expected 4 points, got ${evidence.points.length}`);
  const expectedCoords = [
    { name: 'A1', easting: 500000, northing: 9900000 },
    { name: 'A2', easting: 500000, northing: 9900080 },
    { name: 'A10', easting: 500100, northing: 9900080 },
    { name: 'A3', easting: 500100, northing: 9900000 },
  ];
  for (let i = 0; i < 4; i++) {
    const pt = evidence.points[i];
    const exp = expectedCoords[i];
    if (pt.name !== exp.name || Math.abs(pt.easting - exp.easting) > 0.001 || Math.abs(pt.northing - exp.northing) > 0.001) {
      throw new Error(`Point ${i} mismatch: got ${JSON.stringify(pt)}, expected ${JSON.stringify(exp)}`);
    }
    if (pt.elevation !== undefined) {
      throw new Error(`Point ${pt.name} elevation should be undefined/blank, got ${pt.elevation}`);
    }
  }

  // Verify area and perimeter
  if (evidence.area?.squareMeters !== 8000) throw new Error(`Area expected 8000 m2, got ${evidence.area?.squareMeters}`);
  if (evidence.area?.hectares !== 0.8) throw new Error(`Area expected 0.8 ha, got ${evidence.area?.hectares}`);
  if (evidence.area?.perimeter !== 360) throw new Error(`Perimeter expected 360 m, got ${evidence.area?.perimeter}`);

  // 3. Test HTML Document Generators (Print Document Package)
  console.log('\n--- TESTING PRINT DOCUMENT PACKAGE GENERATORS ---');
  await mkdir('live-test-results/audit-documents', { recursive: true });

  const compSheetHtml = generateComputationSheet(project, {}, evidence.points, evidence.traverse, evidence.area);
  await writeFile('live-test-results/audit-documents/computation-sheet.html', compSheetHtml);
  console.log('computation-sheet.html written, length:', compSheetHtml.length);

  // Checks on computation sheet
  if (!compSheetHtml.includes('500000.0000') || !compSheetHtml.includes('500100.0000') || !compSheetHtml.includes('9900080.0000')) {
    throw new Error('computation-sheet missing expected coordinates');
  }
  if (!compSheetHtml.includes('8000.00') || !compSheetHtml.includes('0.8000')) {
    throw new Error('computation-sheet missing area 8000 m2 / 0.8000 ha');
  }
  if (!compSheetHtml.includes('ARC1960')) {
    throw new Error('computation-sheet missing ARC1960 datum');
  }
  if (!compSheetHtml.includes('DRAFT')) {
    throw new Error('computation-sheet missing DRAFT watermark/header');
  }
  if (compSheetHtml.includes('I certify that the above computations')) {
    throw new Error('computation-sheet should NOT contain practitioner certification');
  }

  const areaCertHtml = generateAreaCertificate(project, {}, evidence.area);
  await writeFile('live-test-results/audit-documents/area-certificate.html', areaCertHtml);
  console.log('area-certificate.html written, length:', areaCertHtml.length);
  if (!areaCertHtml.includes('8,000') && !areaCertHtml.includes('8000')) {
    throw new Error('area-certificate missing area 8000');
  }

  const coverLetterHtml = generateCoverLetter(project, {}, {});
  await writeFile('live-test-results/audit-documents/cover-letter.html', coverLetterHtml);
  console.log('cover-letter.html written, length:', coverLetterHtml.length);

  // 4. Test Submission Document Generation (assembleDocument: PDFs, DXF, Shapefile, Workbook)
  console.log('\n--- TESTING SUBMISSION DOCUMENT GENERATION ---');
  const docTypes = [
    'traverse-computation-sheet',
    'area-computation',
    'statutory-workbook',
    'form-c22',
    'deed-plan',
  ];

  const submissionResults: Record<string, { bytes: number; path: string }> = {};

  for (const docId of docTypes) {
    try {
      console.log(`Generating ${docId}...`);
      const result = await generateDocument({
        projectId,
        documentId: docId,
        surveyType: 'cadastral',
        userId: project.user_id,
      });
      const key = new URL(result.fileUrl, 'http://localhost').searchParams.get('path')!;
      const filePath = path.join(process.env.STORAGE_ROOT!, key);
      const buffer = await readFile(filePath);
      submissionResults[docId] = { bytes: buffer.length, path: filePath };
      console.log(`  -> SUCCESS: ${docId} (${buffer.length} bytes) at ${filePath}`);
    } catch (err: any) {
      console.error(`  -> FAILED: ${docId}:`, err.message);
      submissionResults[docId] = { bytes: 0, path: `ERROR: ${err.message}` };
    }
  }

  console.log('\n=== AUDIT SUMMARY ===');
  console.log(JSON.stringify({
    projectId,
    coordinates: evidence.points.map((p: any) => ({ name: p.name, E: p.easting, N: p.northing, Z: p.elevation ?? null })),
    areaM2: evidence.area?.squareMeters,
    areaHa: evidence.area?.hectares,
    perimeterM: evidence.area?.perimeter,
    submissionDocuments: submissionResults,
  }, null, 2));
}

audit().then(() => process.exit(0)).catch((err) => {
  console.error('AUDIT ERROR:', err);
  process.exit(1);
});
