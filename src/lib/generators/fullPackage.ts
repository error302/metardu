import JSZip from 'jszip';
import db from '@/lib/db';
import { logger } from '@/lib/logger';
import { computeDeedPlanGeometry } from './deedPlanGeometry';
import { downloadFile, downloadFileBounded } from '@/lib/storage';
import { requireSubmissionAdmission } from '@/lib/submission/submissionAdmission';
import { fetchSurveyorProfile } from '@/lib/survey/fetchSurveyorProfile';
import type { ResolvedLogo, WatermarkStrategy } from '@/lib/documents/resolve-logo';
import {
  buildPhotoIndexCsv,
  buildSha256Manifest,
  hashPackageFile,
  renderClientCoverPdf,
  safePackagePhotoName,
  type ClientPackageFile,
  type ClientPackagePhoto,
} from './clientPackageExtras';

interface DocRow {
  document_id: string;
  file_url: string;
}

interface ProjectMetaRow {
  name: string | null;
  client_name: string | null;
  survey_type: string | null;
  lr_number: string | null;
  parcel_number: string | null;
  county: string | null;
  locality: string | null;
}

interface PhotoRow {
  file_name: string | null;
  file_url: string | null;
  description: string | null;
  taken_at: string | Date | null;
}

export interface FullPackageOptions {
  logo?: ResolvedLogo | null;
  brandingStrategy?: WatermarkStrategy;
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

const MAX_PACKAGE_PHOTO_BYTES = 25 * 1024 * 1024;

async function loadPackagePhoto(projectId: string, fileUrl: string): Promise<Buffer> {
  const url = new URL(fileUrl, 'http://storage.local');
  const localPath = url.pathname === '/api/storage'
    ? url.searchParams.get('path')
    : fileUrl.startsWith('survey_photos/')
      ? fileUrl
      : null;

  if (localPath) {
    if (!localPath.startsWith(`survey_photos/${projectId}/`) || localPath.split('/').some(part => part === '..' || part === '.') || localPath.includes('\\')) {
      throw new Error('Photo storage path does not belong to this project');
    }
    return downloadFileBounded(localPath, MAX_PACKAGE_PHOTO_BYTES);
  }

  if (!/^https?:\/\//i.test(fileUrl)) {
    throw new Error('Photo location is not readable');
  }
  const response = await fetch(fileUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Photo download returned HTTP ${response.status}`);
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > MAX_PACKAGE_PHOTO_BYTES) throw new Error('Photo exceeds the package size limit');
  const data = Buffer.from(await response.arrayBuffer());
  if (data.byteLength > MAX_PACKAGE_PHOTO_BYTES) throw new Error('Photo exceeds the package size limit');
  return data;
}

export async function generateFullPackage(
  projectId: string,
  userId?: string,
  customGenerator?: DocumentGeneratorFn,
  options: FullPackageOptions = {}
): Promise<Buffer> {
  await requireSubmissionAdmission(projectId, 'full-package');
  const projRes = await db.query<ProjectMetaRow>(
    'SELECT name, client_name, survey_type, lr_number, plot_parcel_number AS parcel_number, county, locality FROM projects WHERE id = $1',
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
  const packageFiles: ClientPackageFile[] = [];
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
      const data = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
      folder.file(name, data);
      includedFiles.push(name);
      packageFiles.push(hashPackageFile(name, data));
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
      const csvData = Buffer.from(csvLines.join('\r\n'));
      folder.file('06_Beacon_Coordinates.csv', csvData);
      includedFiles.push('06_Beacon_Coordinates.csv');
      packageFiles.push(hashPackageFile('06_Beacon_Coordinates.csv', csvData));
    }
  } catch (csvErr) {
    logger.warn('[generateFullPackage] Failed to add beacon CSV:', { error: csvErr });
    throw new Error('Cannot create complete package: beacon coordinates could not be exported.');
  }

  // 4. Add the recorded field photographs. A photo that cannot be retrieved
  // is named in the index instead of disappearing from the deliverable.
  const photoEntries: ClientPackagePhoto[] = [];
  try {
    const photosRes = await db.query<PhotoRow>(
      'SELECT file_name, file_url, description, taken_at FROM survey_photos WHERE project_id = $1 ORDER BY created_at ASC LIMIT 100',
      [projectId]
    );
    const usedPhotoNames = new Set<string>();
    for (const photo of photosRes.rows) {
      const originalName = photo.file_name || photo.file_url?.split('/').at(-1) || 'field-photo.jpg';
      const takenAt = photo.taken_at instanceof Date ? photo.taken_at.toISOString() : photo.taken_at;
      if (!photo.file_url) {
        photoEntries.push({ originalName, description: photo.description, takenAt, included: false, reason: 'No readable photo location is recorded.' });
        continue;
      }
      try {
        const data = await loadPackagePhoto(projectId, photo.file_url);
        if (data.byteLength === 0) throw new Error('Photo file is empty');
        const packageName = safePackagePhotoName(originalName, usedPhotoNames);
        const packagePath = `photos/${packageName}`;
        folder.file(packagePath, data);
        includedFiles.push(packagePath);
        packageFiles.push(hashPackageFile(packagePath, data));
        photoEntries.push({ originalName, packageName, description: photo.description, takenAt, included: true });
      } catch (photoError) {
        logger.warn('[generateFullPackage] A recorded field photo could not be added:', { error: photoError });
        photoEntries.push({
          originalName,
          description: photo.description,
          takenAt,
          included: false,
          reason: 'The photo file could not be retrieved from storage.',
        });
      }
    }
    if (photosRes.rows.length > 0) {
      const indexData = Buffer.from(buildPhotoIndexCsv(photoEntries));
      folder.file('photos/00_Photo_Index.csv', indexData);
      includedFiles.push('photos/00_Photo_Index.csv');
      packageFiles.push(hashPackageFile('photos/00_Photo_Index.csv', indexData));
    }
  } catch (photoRegisterError) {
    logger.warn('[generateFullPackage] The field photo register could not be read:', { error: photoRegisterError });
    photoEntries.push({
      originalName: 'Survey photo register',
      included: false,
      reason: 'The recorded photo register could not be read.',
    });
  }

  // 5. Client cover sheet and checksums. The cover makes the ZIP readable
  // without opening every statutory file, while the checksums let a recipient
  // prove the listed files are the ones that were generated.
  const surveyorProfile = await fetchSurveyorProfile(projectId).catch(() => null);
  const generatedAt = new Date().toISOString();
  const coverData = renderClientCoverPdf({
    projectName: project?.name || 'Cadastral Survey',
    clientName: project?.client_name,
    lrNumber: project?.lr_number,
    parcelNumber: project?.parcel_number,
    county: project?.county,
    locality: project?.locality,
    surveyType,
    surveyorName: surveyorProfile?.surveyorName,
    firmName: surveyorProfile?.firmName,
    iskNumber: surveyorProfile?.iskNumber || surveyorProfile?.licenseNumber,
    generatedAt,
    files: packageFiles,
    photos: photoEntries,
    brandingStrategy: options.brandingStrategy ?? (options.logo ? 'company_logo' : 'metardu'),
  }, options.logo);
  folder.file('00_Client_Cover_Sheet.pdf', coverData);
  includedFiles.push('00_Client_Cover_Sheet.pdf');
  packageFiles.push(hashPackageFile('00_Client_Cover_Sheet.pdf', coverData));
  folder.file('99_SHA256SUMS.txt', buildSha256Manifest(packageFiles));
  includedFiles.push('99_SHA256SUMS.txt');

  // 6. Dossier README Manifest
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
    `Generated At: ${generatedAt}`,
    `Total Dossier Files Included (excluding this manifest): ${includedFiles.length}`,
    '',
    'CLIENT DELIVERY:',
    'Open 00_Client_Cover_Sheet.pdf first for the project summary, preparer and',
    'file inventory. Use 99_SHA256SUMS.txt to verify that the listed files have',
    'not changed after generation. Recorded field photographs are under photos/,',
    'with photos/00_Photo_Index.csv naming any recorded photo that could not be',
    'retrieved.',
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
