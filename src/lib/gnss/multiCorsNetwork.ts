/**
 * @file multiCorsNetwork.ts
 * @description Multi-CORS Network Selector engine for METARDU
 * GNSS reference network management and baseline calculations based on Survey of Kenya and IGS standards.
 */

export interface CORSNetwork {
  id: string;
  name: string;
  address: string;
  port: number;
  type: 'regional' | 'global' | 'scientific';
}

export interface CORSStation {
  id: string;
  name: string;
  networkId: string;
  mountpoint: string;
  lat: number;
  lon: number;
  format: string;
  constellations: string[];
}

export interface NearestCORSResult {
  station: CORSStation;
  distanceKm: number;
  bearingDeg: number;
  baselineStatus: 'OPTIMAL' | 'ACCEPTABLE' | 'DEGRADED' | 'WARNING_LONG_BASELINE';
}

export const NETWORKS: CORSNetwork[] = [
  { id: 'kencors', name: 'KENCORS', address: 'ntrip.kenyacors.go.ke', port: 2101, type: 'regional' },
  { id: 'trimble', name: 'Trimble VRS Now', address: 'vrsnow.trimble.com', port: 2101, type: 'global' },
  { id: 'leica', name: 'Leica SmartNet', address: 'smartnet.leica-geosystems.com', port: 2101, type: 'global' },
  { id: 'topcon', name: 'Topcon TopNET live', address: 'topnetlive.com', port: 2101, type: 'global' },
  { id: 'unavco', name: 'UNAVCO / EarthScope', address: 'rtcors.unavco.org', port: 2101, type: 'scientific' },
  { id: 'igs', name: 'IGS-IP (International GNSS Service)', address: 'igs-ip.net', port: 2101, type: 'scientific' },
  { id: 'tanzacors', name: 'TANZACORS', address: 'ntrip.tanzacors.go.tz', port: 2101, type: 'regional' },
  { id: 'ugandacors', name: 'Uganda CORS', address: 'ntrip.cors.go.ug', port: 2101, type: 'regional' }
];

export const STATIONS: CORSStation[] = [
  { id: 'NRBI', name: 'Nairobi University', networkId: 'kencors', mountpoint: 'NRBI_RTCM32', lat: -1.279, lon: 36.817, format: 'RTCM 3.2 MSM5', constellations: ['GPS', 'GLONASS', 'Galileo', 'BeiDou'] },
  { id: 'MMBS', name: 'Mombasa', networkId: 'kencors', mountpoint: 'MMBS_RTCM32', lat: -4.043, lon: 39.668, format: 'RTCM 3.2 MSM5', constellations: ['GPS', 'GLONASS', 'Galileo', 'BeiDou'] },
  { id: 'KISM', name: 'Kisumu', networkId: 'kencors', mountpoint: 'KISM_RTCM32', lat: -0.102, lon: 34.757, format: 'RTCM 3.2 MSM5', constellations: ['GPS', 'GLONASS'] },
  { id: 'NKRU', name: 'Nakuru', networkId: 'kencors', mountpoint: 'NKRU_RTCM32', lat: -0.303, lon: 36.080, format: 'RTCM 3.2 MSM5', constellations: ['GPS', 'GLONASS', 'Galileo', 'BeiDou'] },
  { id: 'ELDT', name: 'Eldoret', networkId: 'kencors', mountpoint: 'ELDT_RTCM32', lat: 0.514, lon: 35.269, format: 'RTCM 3.2 MSM5', constellations: ['GPS', 'GLONASS', 'Galileo', 'BeiDou'] },
  { id: 'MLDI', name: 'Malindi', networkId: 'kencors', mountpoint: 'MLDI_RTCM32', lat: -3.209, lon: 40.116, format: 'RTCM 3.2 MSM5', constellations: ['GPS', 'GLONASS'] },
  { id: 'GRIS', name: 'Garissa', networkId: 'kencors', mountpoint: 'GRIS_RTCM32', lat: -0.453, lon: 39.465, format: 'RTCM 3.2 MSM5', constellations: ['GPS', 'GLONASS'] },
  { id: 'NYRI', name: 'Nyeri', networkId: 'kencors', mountpoint: 'NYRI_RTCM32', lat: -0.416, lon: 36.951, format: 'RTCM 3.2 MSM5', constellations: ['GPS', 'GLONASS', 'Galileo'] },
  { id: 'NANY', name: 'Nanyuki', networkId: 'kencors', mountpoint: 'NANY_RTCM32', lat: 0.012, lon: 37.075, format: 'RTCM 3.2 MSM5', constellations: ['GPS', 'GLONASS', 'Galileo'] },
  { id: 'MCHA', name: 'Machakos', networkId: 'kencors', mountpoint: 'MCHA_RTCM32', lat: -1.518, lon: 37.262, format: 'RTCM 3.2 MSM5', constellations: ['GPS', 'GLONASS'] },
  { id: 'KAKM', name: 'Kakamega', networkId: 'kencors', mountpoint: 'KAKM_RTCM32', lat: 0.282, lon: 34.751, format: 'RTCM 3.2 MSM5', constellations: ['GPS', 'GLONASS', 'Galileo', 'BeiDou'] },
  { id: 'KTAL', name: 'Kitale', networkId: 'kencors', mountpoint: 'KTAL_RTCM32', lat: 1.019, lon: 35.002, format: 'RTCM 3.2 MSM5', constellations: ['GPS', 'GLONASS'] },
  { id: 'LODW', name: 'Lodwar', networkId: 'kencors', mountpoint: 'LODW_RTCM32', lat: 3.118, lon: 35.597, format: 'RTCM 3.2 MSM5', constellations: ['GPS', 'GLONASS'] },
  { id: 'NARC', name: 'Narok', networkId: 'kencors', mountpoint: 'NARC_RTCM32', lat: -1.085, lon: 35.875, format: 'RTCM 3.2 MSM5', constellations: ['GPS', 'GLONASS'] },
  { id: 'VOII', name: 'Voi', networkId: 'kencors', mountpoint: 'VOII_RTCM32', lat: -3.385, lon: 38.556, format: 'RTCM 3.2 MSM5', constellations: ['GPS', 'GLONASS'] },
  { id: 'KADO', name: 'Kajiado', networkId: 'kencors', mountpoint: 'KADO_RTCM32', lat: -1.851, lon: 36.776, format: 'RTCM 3.2 MSM5', constellations: ['GPS', 'GLONASS'] },
  { id: 'DSLM', name: 'Dar es Salaam', networkId: 'tanzacors', mountpoint: 'DSLM_RTCM32', lat: -6.792, lon: 39.208, format: 'RTCM 3.2 MSM5', constellations: ['GPS', 'GLONASS', 'Galileo', 'BeiDou'] },
  { id: 'ARSH', name: 'Arusha', networkId: 'tanzacors', mountpoint: 'ARSH_RTCM32', lat: -3.386, lon: 36.682, format: 'RTCM 3.2 MSM5', constellations: ['GPS', 'GLONASS', 'Galileo'] },
  { id: 'KMPL', name: 'Kampala', networkId: 'ugandacors', mountpoint: 'KMPL_RTCM32', lat: 0.347, lon: 32.582, format: 'RTCM 3.2 MSM5', constellations: ['GPS', 'GLONASS', 'Galileo', 'BeiDou'] },
  { id: 'ENTE', name: 'Entebbe', networkId: 'ugandacors', mountpoint: 'ENTE_RTCM32', lat: 0.051, lon: 32.463, format: 'RTCM 3.2 MSM5', constellations: ['GPS', 'GLONASS'] },
  { id: 'MALI', name: 'Malindi IGS', networkId: 'igs', mountpoint: 'MAL200KEN0', lat: -2.996, lon: 40.194, format: 'RTCM 3.2 MSM5', constellations: ['GPS', 'GLONASS', 'Galileo', 'BeiDou'] }
];

function toRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

function toDegrees(radians: number): number {
  return radians * 180 / Math.PI;
}

export function findNearestCORSStation(roverLat: number, roverLon: number, networkId?: string): NearestCORSResult[] {
  const R = 6371; // Earth radius in km
  
  let candidates = STATIONS;
  if (networkId && networkId !== 'all') {
    candidates = STATIONS.filter(s => s.networkId === networkId);
  }

  const results: NearestCORSResult[] = candidates.map(station => {
    const dLat = toRadians(station.lat - roverLat);
    const dLon = toRadians(station.lon - roverLon);
    
    const lat1 = toRadians(roverLat);
    const lat2 = toRadians(station.lat);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = R * c;

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    let bearingDeg = toDegrees(Math.atan2(y, x));
    bearingDeg = (bearingDeg + 360) % 360;

    let baselineStatus: NearestCORSResult['baselineStatus'];
    if (distanceKm < 20) {
      baselineStatus = 'OPTIMAL';
    } else if (distanceKm < 35) {
      baselineStatus = 'ACCEPTABLE';
    } else if (distanceKm < 50) {
      baselineStatus = 'DEGRADED';
    } else {
      baselineStatus = 'WARNING_LONG_BASELINE';
    }

    return {
      station,
      distanceKm,
      bearingDeg,
      baselineStatus
    };
  });

  return results.sort((a, b) => a.distanceKm - b.distanceKm);
}

export interface SourcetableEntry {
  mountpoint: string;
  identifier: string;
  format: string;
  formatDetails: string;
  carrier: string;
  navSystem: string;
  network: string;
  country: string;
  lat: number;
  lon: number;
}

export function parseSourcetable(rawText: string): SourcetableEntry[] {
  const lines = rawText.split('\n');
  const entries: SourcetableEntry[] = [];

  for (const line of lines) {
    const trim = line.trim();
    if (trim.startsWith('STR;')) {
      const parts = trim.split(';');
      if (parts.length >= 11) {
        entries.push({
          mountpoint: parts[1],
          identifier: parts[2],
          format: parts[3],
          formatDetails: parts[4],
          carrier: parts[5],
          navSystem: parts[6],
          network: parts[7],
          country: parts[8],
          lat: parseFloat(parts[9]),
          lon: parseFloat(parts[10]),
        });
      }
    }
  }

  return entries;
}
