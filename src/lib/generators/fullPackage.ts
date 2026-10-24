import JSZip from 'jszip';
import db from '@/lib/db';
import { logger } from '@/lib/logger';
import { computeDeedPlanGeometry } from './deedPlanGeometry';
import { downloadFile } from '@/lib/storage';
import { requireSubmissionAdmission } from '@/lib/submission/submissionAdmission';

interface DocRow {
  document_id: string;
  file_url: string;
}

interface ProjectMetaRow {
  name: string | null;
  survey_type: string | null;
  lr_number: string | null;
  parcel_number: string | null;
  county: string | null;
}

/**
 * Generates the complete 1-click submission package.
 * If individual documents have not been generated yet, it automatically
 * generates the essential statutory dossier items on the fly:
 *   1. 9-Sheet Statutory Computation Workbook (Excel)
 *   2. Deed Plan / Form No. 4 (PDF)
 *   3. Traverse Computation Sheet (PDF)
 *   4. Area Computation Sheet (PDF)
 *   5. Field Book Observations (Excel)
 *   6. Beacon Coordinate Schedule (CSV)
 *   7. Submission Dossier Summary (TXT)
 */
export type DocumentGeneratorFn = (input: {
  projectId: string;
  documentId: string;
  surveyType: string;
  userId?: string;
}) => Promise<{ fileUrl: string }>;

export async function generateFullPackage(
  projectId: string,
  userId?: string,
  customGenerator?: DocumentGeneratorFn
): Promise<Buffer> {
  await requireSubmissionAdmission(projectId, 'full-package');
  const projRes = await db.query<ProjectMetaRow>(
    'SELECT name, survey_type, lr_number, plot_parcel_number AS parcel_number, county FROM projects WHERE id = $1',
    [projectId]
  );
  const project = projRes.rows[0];
  if (!project) throw new Error('Project not found');
  const surveyType = project?.survey_type || 'cadastral';

  // 1. Fetch existing ready documents
  const readyDocsRes = await db.query<DocRow>(
    "SELECT document_id, file_url FROM submission_documents WHERE project_id = $1 AND status = 'ready' AND document_id != 'full-package'",
    [projectId]
  );
  const readyDocs = readyDocsRes.rows;

  // Core statutory documents to ensure are present in a 1-click full submission
  const coreDocIds = surveyType === 'cadastral'
    ? ['statutory-workbook', 'deed-plan', 'traverse-computation-sheet', 'area-computation', 'field-book']
    : ['statutory-workbook', 'traverse-report', 'area-computation', 'field-book'];

  // Check which core docs are missing
  const existingIds = new Set(readyDocs.map(d => d.document_id));
  const missingCoreIds = coreDocIds.filter(id => !existingIds.has(id));

  // Auto-generate missing core documents on the fly
  if (missingCoreIds.length > 0) {
    const generator = customGenerator;
    if (!generator) {
      throw new Error(`Cannot create complete package: ${missingCoreIds.join(', ')} require an explicit document generator.`);
    }
    for (const docId of missingCoreIds) {
      try {
        const result = await generator({
          projectId,
          documentId: docId,
          surveyType,
          userId,
        });

        await db.query<never>(
          `INSERT INTO submission_documents (project_id, document_id, document_type, status, file_url, error_message, generated_at)
           VALUES ($1, $2::text, $2::text, 'ready', $3, null, $4)
           ON CONFLICT (project_id, document_id)
           DO UPDATE SET status = 'ready', file_url = $3, error_message = null, generated_at = $4`,
          [projectId, docId, result.fileUrl, new Date().toISOString()]
        );

        readyDocs.push({ document_id: docId, file_url: result.fileUrl });
      } catch (genErr) {
        logger.warn(`[generateFullPackage] Auto-generation for ${docId} failed:`, { error: genErr });
        throw new Error(`Cannot create complete package: ${docId} could not be generated.`);
      }
    }
  }

  const zip = new JSZip();
  const folder = zip.folder('submission_dossier') ?? zip;

  // 2. Fetch and add each document file
  const includedFiles: string[] = [];
  for (const doc of readyDocs) {
    if (!doc.file_url) throw new Error(`Cannot create complete package: ${doc.document_id} has no file.`);
    try {
      const url = new URL(doc.file_url, 'http://storage.local');
      const localPath = url.pathname === '/api/storage' ? url.searchParams.get('path') : null;
      let blob: Buffer | ArrayBuffer;
      if (localPath) {
        if (!localPath.startsWith(`submissions/${projectId}/`) || localPath.split('/').some(part => part === '..' || part === '.') || localPath.includes('\\')) {
          throw new Error('Document storage path does not belong to this project');
        }
        blob = await downloadFile(localPath);
      } else {
        const res = await fetch(doc.file_url, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        blob = await res.arrayBuffer();
      }
      if (blob.byteLength === 0) throw new Error('Empty document');
      const ext = (localPath || url.pathname).split('.').pop() ?? 'bin';
      const name = `${doc.document_id}.${ext}`;
      folder.file(name, blob);
      includedFiles.push(name);
    } catch {
      throw new Error(`Cannot create complete package: ${doc.document_id} could not be downloaded. Regenerate it and retry.`);
    }
  }

  // 3. Add Beacon Coordinates CSV directly to the package
  try {
    const preAdjusted = await computeDeedPlanGeometry(projectId);
    if (preAdjusted?.stations && preAdjusted.stations.length > 0) {
      const csvLines = [
        'Beacon_ID,Easting,Northing,Elevation,Beacon_Type,Status',
        ...preAdjusted.stations.map((st) =>
          `"${st.station.replace(/"/g, '""')}",${st.easting.toFixed(3)},${st.northing.toFixed(3)},${typeof st.elevation === 'number' && Number.isFinite(st.elevation) ? st.elevation.toFixed(3) : ''},"${(st.monument || '').replace(/"/g, '""')}","${(st.markStatus || '').replace(/"/g, '""')}"`
        ),
      ];
      folder.file('06_Beacon_Coordinates.csv', csvLines.join('\r\n'));
      includedFiles.push('06_Beacon_Coordinates.csv');
    }
  } catch (csvErr) {
    logger.warn('[generateFullPackage] Failed to add beacon CSV:', { error: csvErr });
    throw new Error('Cannot create complete package: beacon coordinates could not be exported.');
  }

  // 4. Dossier README Manifest
  folder.file('README_STATUTORY_DOSSIER.txt', [
    '====================================================================',
    'METARDU STATUTORY SURVEY SUBMISSION DOSSIER',
    'Document package for professional review',
    '====================================================================',
    '',
    `Project: ${project?.name || 'Cadastral Survey'}`,
    `LR / Parcel: ${project?.lr_number || 'N/A'} / ${project?.parcel_number || 'N/A'}`,
    `County / Locality: ${project?.county || 'N/A'}`,
    `Survey Type: ${surveyType.toUpperCase()}`,
    `Generated At: ${new Date().toISOString()}`,
    `Total Dossier Files Included (excluding this manifest): ${includedFiles.length}`,
    '',
    'DOSSIER INVENTORY:',
    ...includedFiles.map((name) => `  [x] ${name}`),
    '',
    'REVIEW STATUS:',
    'Packaging verifies file availability only. It does not authenticate the survey',
    'or certify regulatory compliance. Review the source observations, coordinate',
    'reference system and individual QA reports before signing or submitting.',
    '',
    'Platform: https://metardu.space',
    '====================================================================',
  ].join('\n'));

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return Buffer.from(buffer);
}
