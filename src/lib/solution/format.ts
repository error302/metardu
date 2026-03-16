import { bearingToString } from '@/lib/engine/angles'

export function formatDistanceMeters(m: number): string {
  return `${m.toFixed(2)} m`
}

export function formatDeltaMeters(m: number): string {
  return `${m.toFixed(4)} m`
}

export function formatCoordMeters(m: number): string {
  return `${m.toFixed(4)} m`
}

export function formatElevationMeters(m: number): string {
  return `${m.toFixed(3)} m`
}

export function formatBearingWcbDms(bearingDeg: number): string {
  return bearingToString(bearingDeg)
}

export function formatAreaSqm(a: number): string {
  return `${a.toFixed(4)} m²`
}

export function formatAreaHa(a: number): string {
  return `${a.toFixed(6)} ha`
}

export function formatAreaAcres(a: number): string {
  return `${a.toFixed(4)} acres`
}

export function formatPrecisionRatio(totalDistance: number, linearError: number): string {
  const denom = Math.max(1, Math.round(totalDistance / Math.max(1e-12, linearError)))
  return `1 : ${denom.toLocaleString()}`
}

export function fullNumber(n: number): string {
  // Use JS default string to preserve full float representation (no deliberate rounding).
  return String(n)
}

