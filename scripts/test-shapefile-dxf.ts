import { config } from 'dotenv';
import { writeFile, mkdir } from 'fs/promises';
import JSZip from 'jszip';
config({ path: '.env', quiet: true } as any);
process.env.DATABASE_URL = `postgresql://${encodeURIComponent(process.env.POSTGRES_USER || 'metardu')}:${encodeURIComponent(process.env.POSTGRES_PASSWORD || '')}@127.0.0.1:5432/${process.env.POSTGRES_DB || 'metardu'}`;

async function testShapefileAndDxf() {
  const { generateBoundaryShapefile } = await import('../src/lib/generators/boundaryShapefile');
  const { generateSettingOutDxf } = await import('../src/lib/generators/settingOutDxf');

  const projectId = '0e7f1a12-2e1f-4b33-91ba-27dca290426c';
  await mkdir('live-test-results/audit-documents', { recursive: true });

  console.log('Testing Boundary Shapefile generation...');
  const shapefileZipBuffer = await generateBoundaryShapefile(projectId);
  await writeFile('live-test-results/audit-documents/boundary-shapefile.zip', shapefileZipBuffer);
  console.log('Shapefile zip written, bytes:', shapefileZipBuffer.length);

  // Inspect zip contents
  const zip = await JSZip.loadAsync(shapefileZipBuffer);
  console.log('Shapefile files in zip:', Object.keys(zip.files));
  const prj = await zip.file('Boundary.prj')?.async('string');
  console.log('Boundary.prj:', prj);

  console.log('\nTesting Setting Out DXF generation...');
  const dxfBuffer = await generateSettingOutDxf(projectId);
  const dxfContent = dxfBuffer.toString('utf-8');
  await writeFile('live-test-results/audit-documents/setting-out.dxf', dxfBuffer);
  console.log('Setting Out DXF written, bytes:', dxfBuffer.length);

  // Verify coordinates in DXF
  const hasA1 = dxfContent.includes('A1');
  const hasA2 = dxfContent.includes('A2');
  const hasA10 = dxfContent.includes('A10');
  const hasA3 = dxfContent.includes('A3');
  const has500000 = dxfContent.includes('500000');
  const has500100 = dxfContent.includes('500100');
  const has9900000 = dxfContent.includes('9900000');
  const has9900080 = dxfContent.includes('9900080');

  console.log('DXF coordinate checks:', {
    hasA1, hasA2, hasA10, hasA3,
    has500000, has500100, has9900000, has9900080,
  });

  if (!hasA1 || !hasA2 || !hasA10 || !hasA3 || !has500000 || !has500100 || !has9900000 || !has9900080) {
    throw new Error('DXF missing expected stations or coordinates!');
  }
}

testShapefileAndDxf().catch(console.error);
