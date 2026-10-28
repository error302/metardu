import type { DocumentProject } from '../src/lib/reports/documentEvidence'
import { config } from 'dotenv';
config({ path: '.env' });
process.env.DATABASE_URL = `postgresql://${encodeURIComponent(process.env.POSTGRES_USER || 'metardu')}:${encodeURIComponent(process.env.POSTGRES_PASSWORD || '')}@127.0.0.1:5432/${process.env.POSTGRES_DB || 'metardu'}`;

async function testInvalidationAndRecompute() {
  const projectId = '0e7f1a12-2e1f-4b33-91ba-27dca290426c';
  const { db } = await import('../src/lib/db');
  const { resolveDocumentEvidence } = await import('../src/lib/reports/documentEvidence');
  const { prepareCadastralInput } = await import('../src/lib/survey/cadastralInput');
  const { fieldToFinish } = await import('../src/lib/survey/field-to-finish');
  const { generateSettingOutDxf } = await import('../src/lib/generators/settingOutDxf');

  console.log('=== TEST OBSERVATION INVALIDATION AND RECOMPUTATION ===');

  // 1. Fetch current project & entries backup
  const projOriginal = (await db.query<DocumentProject & Record<string, unknown>>('SELECT * FROM projects WHERE id = $1', [projectId])).rows[0];
  const entriesOriginal = (await db.query<{ raw_data: Record<string, unknown> }>('SELECT * FROM project_fieldbook_entries WHERE project_id = $1 AND deleted_at IS NULL ORDER BY row_index ASC', [projectId])).rows;

  console.log(`Original state: Area = ${projOriginal.area_sqm} m2, Perimeter = ${projOriginal.boundary_data?.perimeter_m} m`);

  try {
    // 2. Modify one observation: A2 -> A10 distance 100 -> 120, and A3 -> A1 distance 100 -> 120
    console.log('\nStep 1: Modifying observations to 120m width (A2->A10 120m, A3->A1 120m)...');
    const modifiedRows = entriesOriginal.map(e => ({ ...e.raw_data }));
    modifiedRows[1].distance = '120';
    modifiedRows[3].distance = '120';

    // Simulate PUT /api/project/[id]/fieldbook
    await db.transaction(async client => {
      for (const [index, row] of modifiedRows.entries()) {
        await client.query(
          `UPDATE project_fieldbook_entries SET raw_data = $1, updated_at = NOW()
           WHERE project_id = $2 AND row_index = $3`,
          [JSON.stringify(row), projectId, index]
        );
      }
      // Invalidation query exactly from route.ts:
      await client.query(
        `UPDATE projects SET area_sqm = NULL, area_ha = NULL,
         boundary_data = (COALESCE(boundary_data, '{}'::jsonb) - ARRAY['adjustedStations','stations','computation','precision_ratio','linear_misclosure','closing_error_e','closing_error_n','perimeter_m']),
         updated_at = NOW() WHERE id = $1`,
        [projectId]
      );
    });

    // 3. Verify invalidation: check DB and resolveDocumentEvidence
    console.log('\nStep 2: Checking invalidation state...');
    const projInvalidated = (await db.query<DocumentProject & Record<string, unknown>>('SELECT * FROM projects WHERE id = $1', [projectId])).rows[0];
    console.log('projInvalidated.area_sqm:', projInvalidated.area_sqm);
    console.log('projInvalidated.boundary_data.adjustedStations:', projInvalidated.boundary_data?.adjustedStations);
    console.log('projInvalidated.boundary_data.computation:', projInvalidated.boundary_data?.computation);

    const evidenceInvalidated = resolveDocumentEvidence(projInvalidated, []);
    console.log('evidenceInvalidated boundaryPoints count:', evidenceInvalidated.boundaryPoints.length);
    console.log('evidenceInvalidated area:', evidenceInvalidated.area);

    if (projInvalidated.area_sqm !== null) throw new Error('Area should be null after observation edit');
    if (projInvalidated.boundary_data?.adjustedStations) throw new Error('adjustedStations should be cleared');
    if (evidenceInvalidated.boundaryPoints.length !== 0) throw new Error('boundaryPoints should be empty');
    if (evidenceInvalidated.area !== undefined) throw new Error('area should be undefined');
    console.log('-> Invalidation verified successfully: documents cannot use stale computation.');

    // 4. Recompute with modified observations
    console.log('\nStep 3: Recomputing with modified observations...');
    const currentEntries = (await db.query('SELECT * FROM project_fieldbook_entries WHERE project_id = $1 AND deleted_at IS NULL ORDER BY row_index ASC', [projectId])).rows;
    const input = prepareCadastralInput(projInvalidated, currentEntries, []);
    const pipelineResult = await fieldToFinish(input);

    console.log('Recomputed Area:', pipelineResult.area.squareMetres, 'm2');
    console.log('Recomputed Perimeter:', pipelineResult.instantFeedback.perimeter, 'm');
    console.log('Recomputed Points:', pipelineResult.adjustedPoints.slice(0, -1).map(p => ({ name: p.name, E: p.easting, N: p.northing })));

    if (Math.abs(pipelineResult.area.squareMetres - 9600) > 0.001) throw new Error(`Expected 9600 m2, got ${pipelineResult.area.squareMetres}`);
    if (Math.abs(pipelineResult.instantFeedback.perimeter - 400) > 0.001) throw new Error(`Expected 400 m, got ${pipelineResult.instantFeedback.perimeter}`);

    // Save recomputed boundary back
    const updatedBoundary = {
      ...projInvalidated.boundary_data,
      adjustedStations: pipelineResult.adjustedPoints.slice(0, -1).map(c => ({
        pointName: c.name,
        adjustedEasting: c.easting,
        adjustedNorthing: c.northing,
      })),
      stations: pipelineResult.adjustedPoints.slice(0, -1).map(c => ({
        pointName: c.name,
        adjustedEasting: c.easting,
        adjustedNorthing: c.northing,
      })),
      computation: {
        source: 'field-observations',
        distanceType: 'grid',
        computedAt: new Date().toISOString(),
        passes: pipelineResult.instantFeedback.passes,
      },
      precision_ratio: pipelineResult.instantFeedback.precisionFormatted,
      linear_misclosure: pipelineResult.instantFeedback.linearMisclosure,
      closing_error_e: pipelineResult.instantFeedback.closingErrorE,
      closing_error_n: pipelineResult.instantFeedback.closingErrorN,
      perimeter_m: pipelineResult.closureCheck.perimeter,
    };

    await db.query(
      `UPDATE projects SET area_sqm = $1, area_ha = $2, boundary_data = $3, updated_at = NOW() WHERE id = $4`,
      [pipelineResult.area.squareMetres, pipelineResult.area.hectares, JSON.stringify(updatedBoundary), projectId]
    );

    // Verify DXF export uses the new 9600 m2 / 500120 coordinates
    const dxfNew = (await generateSettingOutDxf(projectId)).toString('utf-8');
    if (!dxfNew.includes('500120')) throw new Error('DXF did not reflect modified 500120 easting coordinate');
    console.log('-> DXF verified reflecting new coordinates (500120).');

  } finally {
    // 5. Restore original observations and recompute
    console.log('\nStep 4: Restoring original observations (100m width)...');
    await db.transaction(async client => {
      for (const [index, row] of entriesOriginal.entries()) {
        await client.query(
          `UPDATE project_fieldbook_entries SET raw_data = $1, updated_at = NOW()
           WHERE project_id = $2 AND row_index = $3`,
          [JSON.stringify(row.raw_data), projectId, index]
        );
      }
      await client.query(
        `UPDATE projects SET area_sqm = $1, area_ha = $2, boundary_data = $3, updated_at = NOW() WHERE id = $4`,
        [projOriginal.area_sqm, projOriginal.area_ha, JSON.stringify(projOriginal.boundary_data), projectId]
      );
    });

    const restoredProj = (await db.query<DocumentProject & Record<string, unknown>>('SELECT * FROM projects WHERE id = $1', [projectId])).rows[0];
    console.log(`Restored state: Area = ${restoredProj.area_sqm} m2, Perimeter = ${restoredProj.boundary_data?.perimeter_m} m`);
    const dxfRestored = (await generateSettingOutDxf(projectId)).toString('utf-8');
    if (!dxfRestored.includes('500100') || dxfRestored.includes('500120')) {
      throw new Error('DXF did not restore to 500100 easting coordinate');
    }
    console.log('-> Original state restored and verified successfully.');
  }
}

testInvalidationAndRecompute().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
