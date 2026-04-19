import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

export interface TraverseObservation {
  station: string;
  bs: string;
  fs: string;
  hclDeg: string;
  hclMin: string;
  hclSec: string;
  hcrDeg: string;
  hcrMin: string;
  hcrSec: string;
  slopeDist: string;
  vaDeg: string;
  vaMin: string;
  vaSec: string;
  ih: string;
  th: string;
  remarks?: string;
}

export interface LevellingObservation {
  station: string;
  bs?: number;
  is?: number;
  fs?: number;
  distance?: number;
  remarks?: string;
}

export interface ProjectMetadata {
  parcelNumber: string;
  county: string;
  iskNumber: string;
  clientName: string;
  areaType: string;
}

export interface ParsedExcelData {
  projectMetadata: ProjectMetadata;
  traverseObservations: TraverseObservation[];
  levellingObservations: LevellingObservation[];
  areaData?: {
    coordinates?: Array<{ easting: number; northing: number }>;
    expectedArea?: number;
  };
}

export function parseSurveyExcel(filePath: string): ParsedExcelData {
  try {
    const workbook = XLSX.readFile(filePath);
    const result: ParsedExcelData = {
      projectMetadata: {
        parcelNumber: '',
        county: '',
        iskNumber: '',
        clientName: '',
        areaType: ''
      },
      traverseObservations: [],
      levellingObservations: []
    };

    // Parse each sheet
    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (sheetName.toLowerCase().includes('project') || sheetName.toLowerCase().includes('metadata')) {
        parseProjectSheet(data, result.projectMetadata);
      } else if (sheetName.toLowerCase().includes('traverse') || sheetName.toLowerCase().includes('field')) {
        parseTraverseSheet(data, result.traverseObservations);
      } else if (sheetName.toLowerCase().includes('level') || sheetName.toLowerCase().includes('levelling')) {
        parseLevellingSheet(data, result.levellingObservations);
      } else if (sheetName.toLowerCase().includes('area') || sheetName.toLowerCase().includes('coordinate')) {
        parseAreaSheet(data, result);
      }
    });

    console.log('✅ Excel parsing completed successfully');
    console.log(`📊 Found ${result.traverseObservations.length} traverse observations`);
    console.log(`📏 Found ${result.levellingObservations.length} levelling observations`);
    console.log(`📋 Project: ${result.projectMetadata.parcelNumber} - ${result.projectMetadata.county}`);

    return result;
  } catch (error) {
    console.error('❌ Error parsing Excel file:', error);
    throw error;
  }
}

function parseProjectSheet(data: any[], metadata: ProjectMetadata) {
  data.forEach((row: any) => {
    if (Array.isArray(row) && row.length >= 2) {
      const key = String(row[0] || '').toLowerCase();
      const value = String(row[1] || '');
      
      if (key.includes('parcel') || key.includes('number')) {
        metadata.parcelNumber = value;
      } else if (key.includes('county')) {
        metadata.county = value;
      } else if (key.includes('isk')) {
        metadata.iskNumber = value;
      } else if (key.includes('client')) {
        metadata.clientName = value;
      } else if (key.includes('area') && key.includes('type')) {
        metadata.areaType = value;
      }
    }
  });
}

function parseTraverseSheet(data: any[], observations: TraverseObservation[]) {
  // Skip header rows and find data start
  let dataStart = 0;
  for (let i = 0; i < data.length; i++) {
    const row = data[i] as string[];
    if (row && row.some(cell => String(cell || '').toLowerCase().includes('station'))) {
      dataStart = i + 1;
      break;
    }
  }

  for (let i = dataStart; i < data.length; i++) {
    const row = data[i] as string[];
    if (!row || row.length < 5) continue;

    const observation: TraverseObservation = {
      station: String(row[0] || '').trim(),
      bs: String(row[1] || '').trim(),
      fs: String(row[2] || '').trim(),
      hclDeg: String(row[3] || '0'),
      hclMin: String(row[4] || '0'),
      hclSec: String(row[5] || '0'),
      hcrDeg: String(row[6] || '0'),
      hcrMin: String(row[7] || '0'),
      hcrSec: String(row[8] || '0'),
      slopeDist: String(row[9] || '0'),
      vaDeg: String(row[10] || '0'),
      vaMin: String(row[11] || '0'),
      vaSec: String(row[12] || '0'),
      ih: String(row[13] || '0'),
      th: String(row[14] || '0'),
      remarks: String(row[15] || '').trim()
    };

    if (observation.station && observation.slopeDist && observation.slopeDist !== '0') {
      observations.push(observation);
    }
  }
}

function parseLevellingSheet(data: any[], observations: LevellingObservation[]) {
  // Skip header rows and find data start
  let dataStart = 0;
  for (let i = 0; i < data.length; i++) {
    const row = data[i] as string[];
    if (row && row.some(cell => String(cell || '').toLowerCase().includes('station'))) {
      dataStart = i + 1;
      break;
    }
  }

  for (let i = dataStart; i < data.length; i++) {
    const row = data[i] as string[];
    if (!row || row.length < 3) continue;

    const observation: LevellingObservation = {
      station: String(row[0] || '').trim(),
      bs: parseFloat(String(row[1] || '0')) || undefined,
      is: parseFloat(String(row[2] || '0')) || undefined,
      fs: parseFloat(String(row[3] || '0')) || undefined,
      distance: parseFloat(String(row[4] || '0')) || undefined,
      remarks: String(row[5] || '').trim()
    };

    if (observation.station) {
      observations.push(observation);
    }
  }
}

function parseAreaSheet(data: any[], result: ParsedExcelData) {
  // Initialize area data if not present
  if (!result.areaData) {
    result.areaData = {};
  }

  // Look for coordinate data
  const coordinates: Array<{ easting: number; northing: number }> = [];
  let dataStart = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i] as string[];
    if (row && row.some(cell => String(cell || '').toLowerCase().includes('easting') || String(cell || '').toLowerCase().includes('x'))) {
      dataStart = i + 1;
      break;
    }
  }

  for (let i = dataStart; i < data.length; i++) {
    const row = data[i] as string[];
    if (!row || row.length < 2) continue;

    const easting = parseFloat(String(row[0] || '0'));
    const northing = parseFloat(String(row[1] || '0'));

    if (!isNaN(easting) && !isNaN(northing)) {
      coordinates.push({ easting, northing });
    }
  }

  if (coordinates.length > 0) {
    result.areaData.coordinates = coordinates;
  }

  // Look for expected area value
  data.forEach((row: any) => {
    if (Array.isArray(row) && row.length >= 2) {
      const key = String(row[0] || '').toLowerCase();
      const value = parseFloat(String(row[1] || '0'));
      
      if ((key.includes('area') || key.includes('size')) && !isNaN(value)) {
        result.areaData!.expectedArea = value;
      }
    }
  });
}

// Function to validate parsed data
export function validateParsedData(data: ParsedExcelData): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.projectMetadata.parcelNumber) {
    errors.push('Missing parcel number in project metadata');
  }

  if (!data.projectMetadata.county) {
    errors.push('Missing county in project metadata');
  }

  if (!data.projectMetadata.iskNumber) {
    errors.push('Missing ISK number in project metadata');
  }

  if (data.traverseObservations.length === 0) {
    errors.push('No traverse observations found');
  }

  if (data.levellingObservations.length === 0) {
    errors.push('No levelling observations found');
  }

  // Validate traverse observations
  data.traverseObservations.forEach((obs, index) => {
    if (!obs.station) {
      errors.push(`Traverse observation ${index + 1}: Missing station`);
    }
    if (!obs.slopeDist || parseFloat(obs.slopeDist) <= 0) {
      errors.push(`Traverse observation ${index + 1}: Invalid slope distance`);
    }
  });

  // Validate levelling observations
  let hasBS = false;
  data.levellingObservations.forEach((obs, index) => {
    if (obs.bs !== undefined) hasBS = true;
    if (!obs.station) {
      errors.push(`Levelling observation ${index + 1}: Missing station`);
    }
  });

  if (!hasBS) {
    errors.push('Levelling data must include at least one backsight (BS)');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
