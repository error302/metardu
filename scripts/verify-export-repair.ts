import { config } from 'dotenv';
import { randomUUID } from 'crypto';
import { readFile, mkdir, writeFile } from 'fs/promises';
import path from 'path';
const dotenvOptions = { path: '.env', quiet: true };
config(dotenvOptions);
process.env.DATABASE_URL = `postgresql://${encodeURIComponent(process.env.POSTGRES_USER || 'metardu')}:${encodeURIComponent(process.env.POSTGRES_PASSWORD || '')}@127.0.0.1:5432/${process.env.POSTGRES_DB || 'metardu'}`;
const storageRoot = path.resolve('live-test-results/export-storage');
process.env.STORAGE_ROOT = storageRoot;

async function main() {
  const { db } = await import('../src/lib/db');
  const { generateDocument } = await import('../src/lib/submission/assembleDocument');
  const { generateFullPackage } = await import('../src/lib/generators/fullPackage');
  const projectId = randomUUID();
  const user = await db.query<{id: string}>('SELECT id FROM users ORDER BY created_at LIMIT 1');
  if (!user.rows[0]) throw new Error('A local account is required for export verification');
  const userId = user.rows[0].id;
  try {
    await db.query(`INSERT INTO projects(id,user_id,name,survey_type,boundary_data,utm_zone,hemisphere,datum,surveyor_name,surveyor_license)
      VALUES ($1,$2,'Automated export verification','cadastral',$3,37,'S','WGS84','TEST FIXTURE - NOT FOR SUBMISSION','TEST-ONLY')`,
      [projectId,userId,JSON.stringify({startE:500000,startN:9900000})]);
    for (const [i, station] of ['A1','A2','A10','A3'].entries()) {
      await db.query('INSERT INTO project_fieldbook_entries(project_id,row_index,station,raw_data) VALUES ($1,$2,$3,$4)',
        [projectId,i,station,JSON.stringify({station,bearing:i*90,distance:100})]);
    }
    const results = [];
    for (const documentId of ['statutory-workbook','deed-plan','traverse-computation-sheet','area-computation','field-book','form-c22']) {
      const result = await generateDocument({projectId,documentId,surveyType:'cadastral',userId});
      const key = new URL(result.fileUrl,'http://localhost').searchParams.get('path');
      if (!key) throw new Error(`${documentId} has no storage path`);
      const buffer = await readFile(path.join(storageRoot,key));
      if (!buffer.length) throw new Error(`${documentId} empty`);
      results.push({documentId,bytes:buffer.length});
      console.log(`Verified ${documentId}: ${buffer.length} bytes`);
      await db.query(`INSERT INTO submission_documents(project_id,document_id,document_type,status,file_url)
        VALUES($1,$2::text,$2::text,'ready',$3)`,[projectId,documentId,result.fileUrl]);
    }
    const zip = await generateFullPackage(projectId,userId,generateDocument);
    await mkdir('live-test-results',{recursive:true});
    await writeFile('live-test-results/verified-survey-package.zip',zip);
    console.log(JSON.stringify({success:true,documents:results,packageBytes:zip.length}));
  } finally {
    await db.query('DELETE FROM file_uploads WHERE project_id=$1',[projectId]);
    await db.query('DELETE FROM projects WHERE id=$1 AND name=$2',[projectId,'Automated export verification']);
  }
}
main().then(()=>process.exit(0)).catch((error: unknown)=>{ console.error(error instanceof Error ? error.message : String(error));process.exit(1); });
