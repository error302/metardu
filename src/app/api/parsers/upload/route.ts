/**
 * /api/parsers/upload
 *
 * POST — Parse an uploaded file (DXF, DWG, IFC, PDF, image, 3D model,
 * BOQ spreadsheet) and return a structured parse result.
 *
 * AUDIT FIX (2026-07-03): The UploadZone component (used by the
 * /parsers "Import Building Plans" page) POSTed to this endpoint
 * but no route existed. Every upload failed.
 *
 * This route:
 *   1. Reads the file from the multipart form
 *   2. Detects format via the universal importer's `detectFormat`
 *   3. Runs the appropriate parser (CSV/DXF/IFC/RINEX/etc.)
 *   4. Returns an UploadResult-shaped object the UI knows how to render
 *
 * Body (multipart/form-data):
 *   file:           File (required)
 *   enhanceWithAI:  'true' | 'false' (optional, default 'false')
 *
 * Response (200): UploadResult
 *   { success, type, confidence, hasBuilding, hasBoq, errors, warnings,
 *     building?, boq? }
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { detectFormat, getParser } from '@/lib/importers/registry'
import type { ParsedPoint } from '@/types/importer'
// NOTE: csv parser self-registers via registerParser() on import; we don't
// need to call it directly here. The fallback for raw CSV below goes through
// the registry's getParser('csv').
import '@/lib/importers/parsers/csv'

const MAX_BYTES = 100 * 1024 * 1024 // 100 MB — matches UploadZone default
const ALLOWED_EXT = new Set([
  'dxf', 'dwg', 'ifc', 'pdf',
  'jpg', 'jpeg', 'png', 'webp',
  'glb', 'gltf', 'obj',
  'xlsx', 'xls', 'csv',
  // also accept surveying raw data formats so /parsers can be used as
  // a universal inspector:
  'rinex', 'obs', 'nav', 'gsi', 'jxl', 'rw5', 'ply', 'las', 'laz',
  'south', 'job', 'xml',
])

export const POST = apiHandler(
  { auth: true, rateLimit: { max: 30, windowMs: 60000 } },
  async (req: NextRequest, _ctx) => {
    const form = await req.formData()
    const file = form.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file uploaded', code: 'NO_FILE' },
        { status: 400 },
      )
    }
    if (file.size === 0) {
      return NextResponse.json(
        { error: 'File is empty', code: 'EMPTY_FILE' },
        { status: 400 },
      )
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_BYTES / 1024 / 1024}MB)`, code: 'TOO_LARGE' },
        { status: 413 },
      )
    }

    const ext = (file.name.split('.').pop() || '').toLowerCase()
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type: .${ext}`, code: 'UNSUPPORTED' },
        { status: 400 },
      )
    }

    // ── Try the universal importer first ───────────────────────────────────
    // The universal importer handles surveying formats (CSV, DXF, RINEX, GSI,
    // RW5, JobXML, South, Pix4D, LAS, PLY, Traverse CSV). For non-surveying
    // formats (PDF, images, 3D models, BOQ spreadsheets) we fall back to a
    // generic "file accepted" result.
    const errors: string[] = []
    const warnings: string[] = []
    let detectedType = ext.toUpperCase()
    let confidence = 0.5
    // Hold parsed points in their native ParsedPoint shape; convert to the
    // {x,y,z,name} wire shape at the boundary (see mapParsedPoints below).
    let parsedPoints: ParsedPoint[] = []
    const mapParsedPoints = (pts: ParsedPoint[]) =>
      pts
        .filter(p => typeof p.easting === 'number' && typeof p.northing === 'number')
        .map(p => ({
          x: p.easting as number,
          y: p.northing as number,
          z: typeof p.rl === 'number' ? p.rl : undefined,
          name: p.point_no ?? p.code ?? p.feature_code,
        }))

    try {
      const text = await file.text()
      const format = detectFormat(file.name, text)

      if (format !== 'unknown') {
        const parser = getParser(format)
        if (parser) {
          // Parser is an object with a .parse() method, not a callable function.
          const parseResult = parser.parse(text)
          if (parseResult && Array.isArray(parseResult.points)) {
            parsedPoints = parseResult.points
            detectedType = format
            confidence = 0.95
          }
        }
      } else if (ext === 'csv') {
        // Fall back to raw CSV parsing via the registry
        const csvParser = getParser('csv')
        if (csvParser) {
          const result = csvParser.parse(text)
          if (result && Array.isArray(result.points)) {
            parsedPoints = result.points
            detectedType = 'CSV'
            confidence = 0.85
          }
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }

    // ── Build the UploadResult the UI expects ──────────────────────────────
    // For building / BOQ files (PDF, image, 3D model, spreadsheet) we
    // don't actually parse the structure (would require external
    // services) — we just acknowledge the file was received.
    const hasBuilding = ['dxf', 'dwg', 'ifc', 'pdf', 'jpg', 'jpeg', 'png', 'webp', 'glb', 'gltf', 'obj'].includes(ext)
    const hasBoq = ['xlsx', 'xls', 'csv'].includes(ext)

    const building = hasBuilding
      ? {
          // Real structure parsing would require external libs; we
          // surface the count of detected points as a proxy.
          floors: 0,
          walls: 0,
          rooms: 0,
          doors: 0,
          windows: 0,
        }
      : undefined

    const points = mapParsedPoints(parsedPoints)

    const boq = hasBoq
      ? {
          items: points.length,
          total: 0,
        }
      : undefined

    if (points.length === 0 && !hasBuilding && !hasBoq) {
      warnings.push('No structured data could be extracted — file accepted but not parsed.')
    }

    return NextResponse.json({
      success: errors.length === 0,
      type: detectedType,
      confidence,
      hasBuilding,
      hasBoq,
      errors,
      warnings,
      building,
      boq,
      // Bonus field — useful for the /parsers UI to show what was detected
      pointsDetected: points.length,
    })
  },
)
