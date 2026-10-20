import { computeBearingAndDistance } from '@/lib/survey/cogo/engine';
import { normalizeBearing } from '@/lib/engine/angles';

/**
 * Input for generating a metes and bounds legal description.
 */
export interface LegalDescriptionInput {
  landReference: string;
  registrationSection: string;
  locality: string;
  beacons: Array<{
    id: string;
    easting: number;
    northing: number;
    monumentType: 'unknown' | 'concrete' | 'iron_pin' | 'peg' | 'tree' | 'natural' | 'pillar';
  }>;
  datum: string;
  surveyorName: string;
  surveyorLicense: string;
  surveyDate: string;
  closingBearing?: boolean;
}

/**
 * Formats a bearing into a quadrant notation string.
 * Example: "North 45°30'15\" East"
 * 
 * @param bearing - The whole circle bearing in decimal degrees
 * @returns Formatted quadrant bearing string
 */
function formatQuadrantBearing(bearing: number): string {
  const normalized = normalizeBearing(bearing);
  
  let quadrantFull = '';
  let directionFull = '';
  let angle = 0;

  if (normalized >= 0 && normalized < 90) {
    quadrantFull = 'North';
    directionFull = 'East';
    angle = normalized;
  } else if (normalized >= 90 && normalized < 180) {
    quadrantFull = 'South';
    directionFull = 'East';
    angle = 180 - normalized;
  } else if (normalized >= 180 && normalized < 270) {
    quadrantFull = 'South';
    directionFull = 'West';
    angle = normalized - 180;
  } else {
    quadrantFull = 'North';
    directionFull = 'West';
    angle = 360 - normalized;
  }
  
  const roundedSeconds = Math.round(angle * 3600);
  const degrees = Math.floor(roundedSeconds / 3600);
  const min = String(Math.floor((roundedSeconds % 3600) / 60)).padStart(2, '0');
  const sec = String(roundedSeconds % 60).padStart(2, '0');
  
  return `${quadrantFull} ${degrees}°${min}'${sec}" ${directionFull}`;
}

/**
 * Formats the monument type into formal prose.
 */
function formatMonument(type: string, id: string): string {
  switch (type) {
    case 'concrete': return `a concrete beacon marked ${id}`;
    case 'iron_pin': return `an iron pin marked ${id}`;
    case 'peg': return `a wooden peg marked ${id}`;
    case 'tree': return `a marked tree ${id}`;
    case 'natural': return `a natural feature marked ${id}`;
    case 'pillar': return `a boundary pillar marked ${id}`;
    default: return `boundary vertex ${id} (marker evidence not provided)`;
  }
}

/**
 * Calculates the area of a polygon using the Shoelace formula (cross-multiply method).
 * @param beacons - Array of beacon coordinates
 * @returns Area in square meters
 */
function calculateArea(beacons: LegalDescriptionInput['beacons']): number {
  if (beacons.length < 3) return 0;
  let area = 0;
  const n = beacons.length;
  const origin = beacons[0];
  for (let i = 0; i < n; i++) {
    const p1 = beacons[i];
    const p2 = beacons[(i + 1) % n];
    area += (p1.easting - origin.easting) * (p2.northing - origin.northing) - (p2.easting - origin.easting) * (p1.northing - origin.northing);
  }
  return Math.abs(area) / 2;
}

function formatNumber(num: number, decimals: number): string {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Generates a planar boundary-description draft for professional review.
 * The caller must declare a metre-based coordinate reference; this is not certification.
 * 
 * @param input - The survey project and boundary details
 * @returns A formatted prose string
 */
export function generateLegalDescription(input: LegalDescriptionInput): string {
  const { beacons } = input;
  if (beacons.length < 3) {
    throw new Error('At least 3 beacons are required to generate a legal description.');
  }
  if (!input.datum.trim()) throw new Error('Declare the metre-based coordinate reference before generating a draft.');
  if (beacons.some(b => !b.id.trim() || !Number.isFinite(b.easting) || !Number.isFinite(b.northing))) throw new Error('Every boundary vertex needs an ID and finite coordinates.');
  if (beacons.some(b => !['unknown', 'concrete', 'iron_pin', 'peg', 'tree', 'natural', 'pillar'].includes(b.monumentType))) throw new Error('Marker type must be recorded or explicitly unknown.');
  if (new Set(beacons.map(b => b.id.trim())).size !== beacons.length) throw new Error('Boundary vertex IDs must be unique.');
  if (beacons.some((b, i) => b.easting === beacons[(i + 1) % beacons.length].easting && b.northing === beacons[(i + 1) % beacons.length].northing)) throw new Error('Consecutive boundary vertices must be distinct.');

  const areaSqm = calculateArea(beacons);
  if (!Number.isFinite(areaSqm) || areaSqm <= 0) throw new Error('A finite nonzero planar boundary area is required.');
  const areaHectares = areaSqm / 10000;
  const areaAcres = areaHectares * 2.47105;

  let description = `DRAFT BOUNDARY DESCRIPTION — UNVERIFIED
For professional review; not a certified survey, title determination or official form.
Land Reference: ${input.landReference}
Registration Section: ${input.registrationSection}
Locality: ${input.locality}

All that piece or parcel of land situate in ${input.registrationSection}, Registration Section,
containing ${formatNumber(areaHectares, 4)} hectares (${formatNumber(areaAcres, 4)} acres) and bounded as follows:

Commencing at ${formatMonument(beacons[0].monumentType, beacons[0].id)} at coordinates
Easting ${formatNumber(beacons[0].easting, 3)} metres, Northing ${formatNumber(beacons[0].northing, 3)} metres;
`;

  const legs = input.closingBearing ? beacons.length : beacons.length - 1;
  
  for (let i = 0; i < legs; i++) {
    const from = beacons[i];
    const to = beacons[(i + 1) % beacons.length];
    const { bearing, distance } = computeBearingAndDistance(
      { easting: from.easting, northing: from.northing },
      { easting: to.easting, northing: to.northing }
    );
    
    const bearingStr = formatQuadrantBearing(bearing);
    const distStr = formatNumber(distance, 3);
    const isLast = (i === beacons.length - 1);
    
    if (isLast) {
      description += `thence on a bearing of ${bearingStr} for a distance of
${distStr} metres back to the point of commencement at beacon ${to.id}.\n`;
    } else {
      description += `thence on a bearing of ${bearingStr} for a distance of
${distStr} metres to ${formatMonument(to.monumentType, to.id)};\n`;
    }
  }

  description += `
Plan reference: Not independently verified.
Entered survey date: ${input.surveyDate || 'Not provided'}
Entered reviewer/surveyor: ${input.surveyorName || 'Not provided'}
Entered licence reference: ${input.surveyorLicense || 'Not provided'} (not verified).

Datum: ${input.datum}
Bearings above are quadrant bearings relative to coordinate grid north.
Distances and area are planar coordinate values in the declared metre-based grid;
no grid-to-ground, datum, elevation or True North correction has been established.`;

  return description;
}
