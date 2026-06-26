import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local', override: true });

import { checkSurveyDataQA } from '../src/lib/ai/nvidiaService';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('Running Live Tests for Every Survey Type...');
  
  if (!process.env.NVIDIA_API_KEY) {
    console.error('NVIDIA_API_KEY is not set.');
    process.exit(1);
  }

  const tests = [
    {
      type: 'Cadastral Survey',
      data: {
        surveyType: 'Cadastral Boundary Relocation',
        area: 2.5,
        distances: [
          { from: 'BM1', to: 'BM2', distance: 50.00, bearing: '0°0\'0"' },
          { from: 'BM2', to: 'BM3', distance: 100.00, bearing: '90°0\'0"' },
          { from: 'BM3', to: 'BM4', distance: 49.95, bearing: '180°0\'0"' },
          { from: 'BM4', to: 'BM1', distance: 100.05, bearing: '270°0\'0"' }
        ]
      }
    },
    {
      type: 'Engineering Survey (Set-out)',
      data: {
        surveyType: 'Engineering Set-out',
        coordinates: [
          { point: 'COL1', easting: 1000.010, northing: 5000.000, elevation: 15.000 },
          { point: 'COL2', easting: 1005.000, northing: 5000.000, elevation: 15.000 },
          { point: 'COL3', easting: 1000.000, northing: 4995.000, elevation: 15.000 }
        ]
      }
    },
    {
      type: 'Sectional Property Survey',
      data: {
        surveyType: 'Sectional Property Condominium',
        area: 0.0150,
        distances: [
          { from: 'FLR1_WALL1', to: 'FLR1_WALL2', distance: 12.5 },
          { from: 'FLR1_WALL2', to: 'FLR1_WALL3', distance: 12.0 },
          { from: 'FLR1_WALL3', to: 'FLR1_WALL4', distance: 12.5 },
          { from: 'FLR1_WALL4', to: 'FLR1_WALL1', distance: 12.0 }
        ]
      }
    }
  ];

  let artifactMarkdown = '# NVIDIA AI Live Testing Results\n\nThis artifact contains the live, unedited output from the NVIDIA NIM API (Llama-3.1-70b-instruct) for different survey data profiles.\n\n';

  for (const test of tests) {
    console.log(`Testing ${test.type}...`);
    try {
      const result = await checkSurveyDataQA(test.data);
      artifactMarkdown += `## ${test.type}\n\n`;
      artifactMarkdown += `> [!NOTE]\n> **Input Data**:\n> \`\`\`json\n> ${JSON.stringify(test.data, null, 2).replace(/\n/g, '\n> ')}\n> \`\`\`\n\n`;
      artifactMarkdown += `### AI Output \n\n${result}\n\n---\n\n`;
    } catch (err) {
      console.error(`Error testing ${test.type}:`, err);
      artifactMarkdown += `## ${test.type}\n\n**Error:** ${err}\n\n`;
    }
  }

  const artifactsDir = process.env.APPDATA_DIR ? path.join(process.env.APPDATA_DIR, 'artifacts') : './artifacts';
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  const outPath = path.join(artifactsDir, 'ai_live_testing_results.md');
  fs.writeFileSync(outPath, artifactMarkdown);
  console.log(`Artifact written to ${outPath}`);
}

main();
