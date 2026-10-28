export interface CameraSensor {
  id: string;
  name: string;
  sensorWidth: number; // mm
  sensorHeight: number; // mm
  pixelWidth: number;
  pixelHeight: number;
  focalLength: number; // mm
}

export const CAMERA_PRESETS: CameraSensor[] = [
  {
    id: 'm3e',
    name: 'DJI Mavic 3 Enterprise',
    sensorWidth: 17.3,
    sensorHeight: 13.0,
    pixelWidth: 5280,
    pixelHeight: 3956,
    focalLength: 12.3,
  },
  {
    id: 'p1',
    name: 'DJI Zenmuse P1 (35mm)',
    sensorWidth: 35.9,
    sensorHeight: 24.0,
    pixelWidth: 8192,
    pixelHeight: 5460,
    focalLength: 35.0,
  },
  {
    id: 'p4rtk',
    name: 'DJI Phantom 4 RTK',
    sensorWidth: 13.2,
    sensorHeight: 8.8,
    pixelWidth: 5472,
    pixelHeight: 3648,
    focalLength: 8.8,
  },
  {
    id: 'evo2',
    name: 'Autel EVO II Pro',
    sensorWidth: 13.2,
    sensorHeight: 8.8,
    pixelWidth: 5472,
    pixelHeight: 3648,
    focalLength: 9.3,
  },
];

export interface FlightParameters {
  cameraId: string;
  targetGsd: number; // cm/px
  flightAltitude: number; // m
  forwardOverlap: number; // 0-1
  sideOverlap: number; // 0-1
  flightSpeed: number; // m/s
  flightAngle: number | 'auto'; // degrees
}

export interface PolygonNode {
  x: number; // Longitude or Easting
  y: number; // Latitude or Northing
}

export interface Waypoint {
  x: number;
  y: number;
  isTrigger: boolean;
}

export interface FlightPlan {
  waypoints: Waypoint[];
  altitude: number; // m
  gsd: number; // cm/px
  totalDistance: number; // km
  flightTimeMinutes: number;
  photoCount: number;
  batteriesNeeded: number;
  areaHectares: number;
  linesCount: number;
}

export function computeFlightPlan(
  polygon: PolygonNode[],
  params: FlightParameters
): FlightPlan {
  const camera = CAMERA_PRESETS.find((c) => c.id === params.cameraId) || CAMERA_PRESETS[0];

  const pixelSizeX = camera.sensorWidth / camera.pixelWidth; // mm
  const pixelSizeY = camera.sensorHeight / camera.pixelHeight; // mm
  const pixelSize = Math.max(pixelSizeX, pixelSizeY); // Using max to be conservative

  const altitude = params.flightAltitude;
  let gsd = params.targetGsd;

  // Recalculate GSD from altitude or Altitude from GSD depending on input, 
  // we'll just calculate GSD for the given altitude, as we allow overriding.
  // GSD = H * pixel_size / focal_length (with units: H in m, pixel_size in mm, focal_length in mm -> GSD in m -> multiply by 100 for cm)
  gsd = (altitude * pixelSize * 100) / camera.focalLength;

  // Footprints on the ground (meters)
  const footprintWidth = (altitude * camera.sensorWidth) / camera.focalLength;
  const footprintHeight = (altitude * camera.sensorHeight) / camera.focalLength;

  const lineSpacing = footprintWidth * (1 - params.sideOverlap);
  const triggerSpacing = footprintHeight * (1 - params.forwardOverlap);

  if (polygon.length < 3) {
    return {
      waypoints: [],
      altitude,
      gsd,
      totalDistance: 0,
      flightTimeMinutes: 0,
      photoCount: 0,
      batteriesNeeded: 0,
      areaHectares: 0,
      linesCount: 0,
    };
  }

  // 1. Calculate Bounding Box
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  polygon.forEach((p) => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });

  // Calculate polygon area (Shoelace)
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }
  area = Math.abs(area) / 2;
  const areaHectares = area / 10000;

  // 2. Flight Angle
  let angle = 0;
  if (params.flightAngle === 'auto') {
    // Find longest edge
    let maxDistSq = 0;
    for (let i = 0; i < polygon.length; i++) {
      const j = (i + 1) % polygon.length;
      const dx = polygon[j].x - polygon[i].x;
      const dy = polygon[j].y - polygon[i].y;
      const distSq = dx * dx + dy * dy;
      if (distSq > maxDistSq) {
        maxDistSq = distSq;
        angle = Math.atan2(dy, dx) * (180 / Math.PI);
      }
    }
  } else {
    angle = params.flightAngle;
  }

  // 3. Generate Flight Lines (simplified, just parallel lines through bounding box, rotated back)
  // For simplicity, generate lines in an unrotated bounding box, then rotate
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const rotatePoint = (x: number, y: number, reverse = false) => {
    if (reverse) {
      return { x: x * cos + y * sin, y: -x * sin + y * cos };
    }
    return { x: x * cos - y * sin, y: x * sin + y * cos };
  };

  const rotatedPoly = polygon.map((p) => rotatePoint(p.x, p.y, true));
  let rMinX = Infinity,
    rMaxX = -Infinity,
    rMinY = Infinity,
    rMaxY = -Infinity;
  rotatedPoly.forEach((p) => {
    if (p.x < rMinX) rMinX = p.x;
    if (p.x > rMaxX) rMaxX = p.x;
    if (p.y < rMinY) rMinY = p.y;
    if (p.y > rMaxY) rMaxY = p.y;
  });

  const waypoints: Waypoint[] = [];
  let totalDistance = 0;
  let photoCount = 0;
  let linesCount = 0;
  
  const buffer = 10;
  rMinX -= buffer; rMaxX += buffer;
  rMinY -= buffer; rMaxY += buffer;

  let y = rMinY;
  let leftToRight = true;
  let lastWp: Waypoint | null = null;

  while (y <= rMaxY) {
    linesCount++;
    const startX = leftToRight ? rMinX : rMaxX;
    const endX = leftToRight ? rMaxX : rMinX;
    const step = leftToRight ? triggerSpacing : -triggerSpacing;

    let x = startX;
    while ((leftToRight && x <= endX) || (!leftToRight && x >= endX)) {
      const isInside = pointInPolygon({ x, y }, rotatedPoly) || true; // Simplification: just cover bounding box + buffer for now, real app does proper clipping
      if (isInside) {
        const unrotated = rotatePoint(x, y, false);
        const wp = { x: unrotated.x, y: unrotated.y, isTrigger: true };
        waypoints.push(wp);
        photoCount++;

        if (lastWp) {
          const dx = wp.x - lastWp.x;
          const dy = wp.y - lastWp.y;
          totalDistance += Math.sqrt(dx * dx + dy * dy);
        }
        lastWp = wp;
      }
      x += step;
    }

    leftToRight = !leftToRight;
    y += lineSpacing;
  }

  const flightTimeMinutes = (totalDistance / params.flightSpeed) / 60;
  const batteriesNeeded = Math.ceil(flightTimeMinutes / 25);

  return {
    waypoints,
    altitude,
    gsd,
    totalDistance: totalDistance / 1000,
    flightTimeMinutes,
    photoCount,
    batteriesNeeded,
    areaHectares,
    linesCount,
  };
}

function pointInPolygon(point: PolygonNode, vs: PolygonNode[]) {
  const x = point.x,
    y = point.y;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x,
      yi = vs[i].y;
    const xj = vs[j].x,
      yj = vs[j].y;
    const intersect =
      yi > y != yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function exportToKML(plan: FlightPlan): string {
  const coords = plan.waypoints.map(w => `${w.x},${w.y},${plan.altitude}`).join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Drone Flight Plan</name>
    <Placemark>
      <name>Flight Path</name>
      <LineString>
        <extrude>1</extrude>
        <tessellate>1</tessellate>
        <altitudeMode>relativeToGround</altitudeMode>
        <coordinates>
          ${coords}
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
}

export function exportToWPML(plan: FlightPlan): string {
  // Simplified WPML template for DJI Pilot 2
  const placemarks = plan.waypoints.map((w, i) => `
      <Placemark>
        <Point>
          <coordinates>${w.x},${w.y}</coordinates>
        </Point>
        <wpml:index>${i}</wpml:index>
        <wpml:executeHeight>${plan.altitude}</wpml:executeHeight>
        <wpml:waypointSpeed>10</wpml:waypointSpeed>
      </Placemark>`).join('');
      
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2">
  <Document>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>goHome</wpml:finishAction>
      <wpml:exitOnRCLost>goHome</wpml:exitOnRCLost>
      <wpml:executeRTHAltitude>100</wpml:executeRTHAltitude>
      <wpml:takeOffSecurityHeight>20</wpml:takeOffSecurityHeight>
    </wpml:missionConfig>
    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>WGS84</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      ${placemarks}
    </Folder>
  </Document>
</kml>`;
}
