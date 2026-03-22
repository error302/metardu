import { spawn } from 'child_process'

export interface ConvertedCoordinate {
  id?: string
  easting: number
  northing: number
  datum: string
  epsg: number
}

export interface ConversionResult {
  success: boolean
  coordinates: ConvertedCoordinate[]
  error?: string
}

export async function convertToArc1960(
  coordinates: Array<{ id?: string; easting: number; northing: number }>
): Promise<ConversionResult> {
  return new Promise(resolve => {
    const script = `
import sys
import json
from pyproj import Transformer

# WGS84 UTM Zone 37N -> ARC1960 UTM Zone 37S
transformer = Transformer.from_crs('EPSG:32637', 'EPSG:21037', always_xy=True)

coords_json = json.dumps(${JSON.stringify(coordinates)})
coords = json.loads(coords_json)

results = []
for c in coords:
    e_in = c.get('easting', 0)
    n_in = c.get('northing', 0)
    cid = c.get('id', '')
    # WGS84 UTM Zone 37N coordinates
    e_out, n_out = transformer.transform(e_in, n_in)
    results.append({
        'id': cid,
        'easting': round(e_out, 3),
        'northing': round(n_out, 3),
        'datum': 'ARC1960',
        'epsg': 21037
    })

print(json.dumps(results))
`
    const proc = spawn('python3', ['-c', script], { timeout: 15000 })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    proc.on('close', code => {
      if (code === 0 && stdout.trim()) {
        try {
          const coords = JSON.parse(stdout.trim())
          resolve({ success: true, coordinates: coords })
        } catch {
          resolve({ success: false, coordinates: [], error: 'Failed to parse output' })
        }
      } else {
        resolve({ success: false, coordinates: [], error: stderr || 'Conversion failed' })
      }
    })

    proc.on('error', () => {
      resolve({ success: false, coordinates: [], error: 'Python not available' })
    })
  })
}

export async function convertFromArc1960(
  coordinates: Array<{ id?: string; easting: number; northing: number }>
): Promise<ConversionResult> {
  return new Promise(resolve => {
    const script = `
import sys
import json
from pyproj import Transformer

# ARC1960 UTM Zone 37S -> WGS84 UTM Zone 37N
transformer = Transformer.from_crs('EPSG:21037', 'EPSG:32637', always_xy=True)

coords_json = json.dumps(${JSON.stringify(coordinates)})
coords = json.loads(coords_json)

results = []
for c in coords:
    e_in = c.get('easting', 0)
    n_in = c.get('northing', 0)
    cid = c.get('id', '')
    e_out, n_out = transformer.transform(e_in, n_in)
    results.append({
        'id': cid,
        'easting': round(e_out, 3),
        'northing': round(n_out, 3),
        'datum': 'WGS84',
        'epsg': 32637
    })

print(json.dumps(results))
`
    const proc = spawn('python3', ['-c', script], { timeout: 15000 })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    proc.on('close', code => {
      if (code === 0 && stdout.trim()) {
        try {
          const coords = JSON.parse(stdout.trim())
          resolve({ success: true, coordinates: coords })
        } catch {
          resolve({ success: false, coordinates: [], error: 'Failed to parse output' })
        }
      } else {
        resolve({ success: false, coordinates: [], error: stderr || 'Conversion failed' })
      }
    })

    proc.on('error', () => {
      resolve({ success: false, coordinates: [], error: 'Python not available' })
    })
  })
}

export function isArc1960Easting(easting: number): boolean {
  return easting >= 166000 && easting <= 850000
}

export function isArc1960Northing(northing: number): boolean {
  return northing >= 9500000 || (northing >= 0 && northing < 500000)
}

export function isWgs84UtmEasting(easting: number): boolean {
  return easting >= 166000 && easting <= 850000
}

export function isWgs84UtmNorthing(northing: number): boolean {
  return (northing >= 0 && northing < 1100000) || (northing > 10000000)
}
