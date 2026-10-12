import { config } from 'dotenv';
import { writeFile } from 'fs/promises';
config({ path: '.env', quiet: true } as any);
process.env.DATABASE_URL = `postgresql://${encodeURIComponent(process.env.POSTGRES_USER || 'metardu')}:${encodeURIComponent(process.env.POSTGRES_PASSWORD || '')}@127.0.0.1:5432/${process.env.POSTGRES_DB || 'metardu'}`;

async function testRenderer() {
  const { db } = await import('../src/lib/db');
  const { resolveDocumentEvidence } = await import('../src/lib/reports/documentEvidence');
  const { SurveyPlanRenderer } = await import('../src/lib/reports/surveyPlan/renderer');
  const { shoelaceArea, shoelacePerimeter, bearingFromDelta, distance, formatBearingDegMinSec } = await import('../src/lib/reports/surveyPlan/geometry');

  const projectId = '0e7f1a12-2e1f-4b33-91ba-27dca290426c';
  const projRes = await db.query('SELECT * FROM projects WHERE id = $1', [projectId]);
  const project = projRes.rows[0];
  const ptsRes = await db.query('SELECT * FROM survey_points WHERE project_id = $1 ORDER BY created_at', [projectId]);
  const evidence = resolveDocumentEvidence(project, ptsRes.rows);

  const boundaryPts = evidence.boundaryPoints;
  const bearingSchedule = boundaryPts.map((pt: any, i: number) => {
    const next = boundaryPts[(i + 1) % boundaryPts.length];
    const dE = next.easting - pt.easting;
    const dN = next.northing - pt.northing;
    return {
      from: pt.name,
      to: next.name,
      bearing: formatBearingDegMinSec(bearingFromDelta(dE, dN)),
      distance: distance(pt.easting, pt.northing, next.easting, next.northing),
    };
  });

  const planData = {
    project: {
      name: project.name,
      location: project.location || '',
      utm_zone: project.utm_zone || 37,
      hemisphere: (project.hemisphere || 'S') as 'N' | 'S',
      datum: project.datum as 'ARC1960' | 'WGS84',
      client_name: project.client_name || undefined,
      drawing_no: 'MD-TEST',
      plan_title: 'DRAFT Boundary Identification Plan',
      notes: 'DRAFT — independent review required. Monument types and control accuracy have not been verified.',
      northRotationDeg: 0,
      bearingSchedule,
      revisions: [],
      iskRegNo: '',
    },
    parcel: {
      boundaryPoints: boundaryPts,
      area_sqm: shoelaceArea(boundaryPts),
      perimeter_m: shoelacePerimeter(boundaryPts),
    },
    controlPoints: [],
    fenceOffsets: [],
    adjacentLots: [],
  };

  const renderer = new SurveyPlanRenderer(planData as any);
  const svg = await renderer.render();
  await writeFile('live-test-results/audit-documents/survey-plan.svg', svg);
  console.log('Successfully rendered survey plan SVG! Length:', svg.length);
  console.log('Contains A1, A2, A10, A3:', svg.includes('A1') && svg.includes('A2') && svg.includes('A10') && svg.includes('A3'));
  console.log('Contains 8,000 m² or 0.8 ha:', svg.includes('0.800') || svg.includes('8000') || svg.includes('8,000'));
  console.log('Contains ARC1960:', svg.includes('ARC1960'));
  console.log('Contains DRAFT:', svg.includes('DRAFT'));
}

testRenderer().catch(console.error);
