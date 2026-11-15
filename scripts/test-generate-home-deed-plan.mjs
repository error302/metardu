throw new Error('Disabled: this helper embedded a production credential and fabricated sessions. Use normal sign-in or isolated synthetic test fixtures.');
import { encode } from 'next-auth/jwt';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/user/.gemini/antigravity/brain/2b3769fe-fdf5-47b8-bbca-353ab182bab3/home-survey-audit';
const BASE_URL = 'http://127.0.0.1:3000';
const NEXTAUTH_SECRET = 'REMOVED_EXPOSED_SIGNING_SECRET';

async function testGenerateHomeDeedPlan() {
  const jwt = await encode({
    token: {
      id: '5a278317-81db-4db9-b9b6-d5f8ca10ec38',
      email: 'mohameddosho20@gmail.com',
      name: 'Mohamed Dosho',
      role: 'admin',
      provider: 'google',
      sessionVersion: 1,
      sub: '5a278317-81db-4db9-b9b6-d5f8ca10ec38',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    },
    secret: NEXTAUTH_SECRET,
  });

  const homeDeedPlanInput = {
    surveyNumber: 'SURV/2026/0412',
    drawingNumber: 'DP/NRB/2026/0412',
    parcelNumber: 'LR No. 209/18426',
    locality: 'Kileleshwa, Westlands, Nairobi',
    registrationSection: 'Nairobi / Block 112',
    county: 'Nairobi',
    utmZone: 37,
    hemisphere: 'S',
    scale: 1000,
    datum: 'ARC1960',
    projectionType: 'UTM',
    boundaryPoints: [
      { id: 'MB1', easting: 254380.0, northing: 9857460.0, markType: 'CONCRETE_BEACON', markStatus: 'SET', description: 'NW Beacon' },
      { id: 'MB2', easting: 254420.0, northing: 9857460.0, markType: 'CONCRETE_BEACON', markStatus: 'SET', description: 'NE Beacon' },
      { id: 'MB3', easting: 254420.0, northing: 9857435.0, markType: 'CONCRETE_BEACON', markStatus: 'SET', description: 'SE Beacon' },
      { id: 'MB4', easting: 254380.0, northing: 9857435.0, markType: 'CONCRETE_BEACON', markStatus: 'SET', description: 'SW Beacon' },
    ],
    abuttalNorth: 'Access Road Reserve (15m wide)',
    abuttalSouth: 'LR No. 209/18427',
    abuttalEast: 'LR No. 209/18428',
    abuttalWest: 'LR No. 209/18425',
    surveyorName: 'Mohamed Dosho',
    iskNumber: 'ISK-1048',
    firmName: 'METARDU Survey Consultants Ltd',
    firmAddress: 'P.O. Box 42100-00100 Nairobi',
    surveyDate: '2026-10-20',
    signatureDate: '2026-10-20',
    clientName: 'Client Homestead',
    titleDeedNumber: 'NAIROBI/BLOCK 112/482',
    drawnBy: 'MD',
    checkedBy: 'METARDU QA',
  };

  console.log('Sending POST to /api/deed-plan/generate with session cookies...');
  const res = await fetch(`${BASE_URL}/api/deed-plan/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `next-auth.session-token=${jwt}; __Secure-next-auth.session-token=${jwt}`,
    },
    body: JSON.stringify(homeDeedPlanInput),
  });

  console.log('HTTP Status:', res.status, res.statusText);
  const data = await res.json();

  if (!res.ok) {
    console.error('API Error Response:', data);
    return;
  }

  console.log('\n--- SUCCESS: Deed Plan Generated ---');
  console.log('Computed Area (m²):', data.area);
  console.log('Computed Area (ha):', data.areaHectares);
  console.log('Perimeter (m):', data.perimeter);
  console.log('Boundary Legs:', data.boundaryLegs?.length);
  if (data.boundaryLegs) {
    data.boundaryLegs.forEach((leg, i) => {
      console.log(`  Leg ${i + 1}: ${leg.fromPoint} -> ${leg.toPoint} | Bearing: ${leg.bearingDMS} | Distance: ${leg.distance.toFixed(3)} m`);
    });
  }

  // Save the SVG
  if (data.svg) {
    const svgPath = path.join(ARTIFACT_DIR, 'LR_209_18426_DEED_PLAN.svg');
    fs.writeFileSync(svgPath, data.svg, 'utf8');
    console.log(`Saved Deed Plan SVG to: ${svgPath} (${data.svg.length} bytes)`);
  }
}

testGenerateHomeDeedPlan().catch(console.error);
