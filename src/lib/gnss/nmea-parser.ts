/**
 * NMEA 0183 Sentence Parser
 * Parses standard GPS/GNSS sentences from receivers
 * Supports: GGA, RMC, GLL, VTG
 */
import { logger } from '@/lib/logger'

export interface NMEAPosition {
  latitude: number;
  longitude: number;
  /** Ellipsoidal height only when both GGA MSL height and geoid separation exist. */
  altitude: number | null;
  hdop: number;
  satellites: number;
  fixType: 'none' | 'gps' | 'dgps' | 'pps' | 'rtk' | 'float';
  timestamp: Date;
  speed?: number;
  course?: number;
  age?: number;
  stationId?: number;
  quality: number;
}

export interface NMEAValidation {
  valid: boolean;
  checksum: string;
  expected: string;
}

export function validateChecksum(sentence: string): NMEAValidation {
  const asterisk = sentence.indexOf('*');
  if (asterisk === -1) {
    return { valid: false, checksum: '', expected: '' };
  }

  const data = sentence.substring(1, asterisk);
  const checksum = sentence.substring(asterisk + 1);
  
  let calculated = 0;
  for (let i = 0; i < data.length; i++) {
    calculated ^= data.charCodeAt(i);
  }
  
  const expected = calculated.toString(16).toUpperCase().padStart(2, '0');
  
  return {
    valid: checksum === expected,
    checksum,
    expected,
  };
}

function parseNMEACoordinate(value: string, hemisphere: string): number | null {
  const degreeDigits = hemisphere === 'N' || hemisphere === 'S' ? 2
    : hemisphere === 'E' || hemisphere === 'W' ? 3
      : 0
  if (!degreeDigits || !/^\d+(?:\.\d+)?$/.test(value)) return null

  const degrees = Number(value.slice(0, degreeDigits))
  const minutes = Number(value.slice(degreeDigits))
  const maximum = degreeDigits === 2 ? 90 : 180
  if (!Number.isFinite(degrees) || !Number.isFinite(minutes)
    || minutes < 0 || minutes >= 60 || degrees > maximum
    || degrees === maximum && minutes !== 0) return null

  const coordinate = degrees + minutes / 60
  return hemisphere === 'S' || hemisphere === 'W' ? -coordinate : coordinate
}

function parseNMEATime(timeStr: string): { hours: number; minutes: number; seconds: number } {
  if (!timeStr || timeStr.length < 6) {
    return { hours: 0, minutes: 0, seconds: 0 };
  }
  
  return {
    hours: parseInt(timeStr.substring(0, 2), 10) || 0,
    minutes: parseInt(timeStr.substring(2, 4), 10) || 0,
    seconds: parseFloat(timeStr.substring(4)) || 0,
  };
}

function parseNMEADate(dateStr: string): { day: number; month: number; year: number } {
  if (!dateStr || dateStr.length !== 6) {
    return { day: 1, month: 1, year: 2000 };
  }
  
  return {
    day: parseInt(dateStr.substring(0, 2), 10) || 1,
    month: parseInt(dateStr.substring(2, 4), 10) || 1,
    year: 2000 + (parseInt(dateStr.substring(4, 6), 10) || 0),
  };
}

function getFixType(quality: number): NMEAPosition['fixType'] {
  switch (quality) {
    case 0: return 'none';
    case 1: return 'gps';
    case 2: return 'dgps';
    case 3: return 'pps';
    case 4: return 'rtk';
    case 5: return 'float';
    default: return 'gps';
  }
}

export function parseGGA(sentence: string): NMEAPosition | null {
  const validation = validateChecksum(sentence);
  if (!validation.valid) {
    logger.warn('Invalid checksum for GGA:', { error: validation });
    return null;
  }
  
  const fields = sentence.split(',');
  
  const timeStr = fields[1];
  const lat = parseNMEACoordinate(fields[2], fields[3]);
  const lon = parseNMEACoordinate(fields[4], fields[5]);
  if (lat === null || lon === null) return null
  const quality = parseInt(fields[6], 10) || 0;
  const satellites = parseInt(fields[7], 10) || 0;
  const hdop = parseFloat(fields[8]) || 0;
  const altitudeMsl = fields[9]?.trim() ? Number(fields[9]) : Number.NaN;
  const geoidSep = fields[11]?.trim() ? Number(fields[11]) : Number.NaN;
  const ellipsoidalHeight = Number.isFinite(altitudeMsl) && Number.isFinite(geoidSep)
    ? altitudeMsl + geoidSep
    : null;
  const age = fields[13] ? parseFloat(fields[13]) : undefined;
  const stationId = fields[14] ? parseInt(fields[14], 10) : undefined;
  
  const time = parseNMEATime(timeStr);
  const timestamp = new Date();
  timestamp.setHours(time.hours, time.minutes, time.seconds, 0);
  
  return {
    latitude: lat,
    longitude: lon,
    altitude: ellipsoidalHeight,
    hdop,
    satellites,
    fixType: getFixType(quality),
    timestamp,
    age,
    stationId,
    quality,
  };
}

export function parseRMC(sentence: string): NMEAPosition | null {
  const validation = validateChecksum(sentence);
  if (!validation.valid) {
    logger.warn('Invalid checksum for RMC:', { error: validation });
    return null;
  }
  
  const fields = sentence.split(',');
  
  const timeStr = fields[1];
  const status = fields[2];
  const lat = parseNMEACoordinate(fields[3], fields[4]);
  const lon = parseNMEACoordinate(fields[5], fields[6]);
  const speed = parseFloat(fields[7]) || 0;
  const course = parseFloat(fields[8]) || 0;
  const dateStr = fields[9];
  
  if (status !== 'A' || lat === null || lon === null) {
    return null;
  }
  
  const time = parseNMEATime(timeStr);
  const date = parseNMEADate(dateStr);
  const timestamp = new Date(date.year, date.month - 1, date.day, time.hours, time.minutes, time.seconds);
  
  return {
    latitude: lat,
    longitude: lon,
    altitude: null,
    hdop: 0,
    satellites: 0,
    fixType: 'gps',
    timestamp,
    speed,
    course,
    quality: 1,
  };
}

export function parseGLL(sentence: string): NMEAPosition | null {
  const validation = validateChecksum(sentence);
  if (!validation.valid) {
    return null;
  }
  
  const fields = sentence.split(',');
  
  const lat = parseNMEACoordinate(fields[1], fields[2]);
  const lon = parseNMEACoordinate(fields[3], fields[4]);
  const timeStr = fields[5];
  const status = fields[6];
  
  if (status !== 'A' || lat === null || lon === null) {
    return null;
  }
  
  const time = parseNMEATime(timeStr);
  const timestamp = new Date();
  timestamp.setHours(time.hours, time.minutes, time.seconds, 0);
  
  return {
    latitude: lat,
    longitude: lon,
    altitude: null,
    hdop: 0,
    satellites: 0,
    fixType: 'gps',
    timestamp,
    quality: 1,
  };
}

export function parseNMEA(sentence: string): NMEAPosition | null {
  if (!sentence.startsWith('$')) {
    return null;
  }
  
  const sentenceType = sentence.substring(1, 6);
  
  switch (sentenceType) {
    case 'GPGGA':
    case 'GNGGA':
    case 'GLGGA':
      return parseGGA(sentence);
    case 'GPRMC':
    case 'GNRMC':
    case 'GLRMC':
      return parseRMC(sentence);
    case 'GPGLL':
    case 'GNGLL':
      return parseGLL(sentence);
    default:
      return null;
  }
}

export function parseNMEABatch(sentences: string[]): NMEAPosition[] {
  const positions: NMEAPosition[] = [];
  
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.startsWith('$')) {
      const position = parseNMEA(trimmed);
      if (position) {
        positions.push(position);
      }
    }
  }
  
  return positions;
}
