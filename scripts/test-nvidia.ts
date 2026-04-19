import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local', override: true });

import { checkSurveyDataQA, validateSurveyResults } from '../src/lib/ai/nvidiaService';

async function main() {
  console.log('Testing NVIDIA NIM API...');
  
  if (!process.env.NVIDIA_API_KEY) {
    console.error('NVIDIA_API_KEY is not set in environment.');
    process.exit(1);
  }

  const sampleSurveyData = {
    surveyType: 'Topographical Survey',
    coordinates: [
      { point: 'STN1', easting: 257123.456, northing: 9876543.210, elevation: 1560.55 },
      { point: 'STN2', easting: 257124.678, northing: 9876590.120, elevation: 1561.20 },
      { point: 'STN3', easting: 257150.999, northing: 9876590.450, elevation: 1562.30 }
    ],
    distances: [
      { from: 'STN1', to: 'STN2', distance: 46.925 },
      { from: 'STN2', to: 'STN3', distance: 26.323 }
    ]
  };

  try {
    console.log('\n--- 1. Testing checkSurveyDataQA ---');
    const qaResponse = await checkSurveyDataQA(sampleSurveyData);
    console.log(qaResponse);

    console.log('\n--- 2. Testing validateSurveyResults ---');
    const validationResponse = await validateSurveyResults({
      surveyType: 'Cadastral Boundary',
      measured: { area: 2.502, boundaryLength: 450.5 },
      expected: { area: 2.500, boundaryLength: 450.0 },
      tolerances: { area: 0.01, boundaryLength: 1.0 }
    });
    console.log(JSON.stringify(validationResponse, null, 2));

  } catch (err) {
    console.error('Error during testing:', err);
  }
}

main();
