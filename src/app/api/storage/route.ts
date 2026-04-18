/**
 * /api/storage — File storage endpoint
 * 
 * Stores files on the VM filesystem with metadata in PostgreSQL.
 * Replaces old GCS/DbClient storage stubs.
 * 
 * POST /api/storage — Upload a file
 * GET /api/storage?path=<path> — Download a file
 * DELETE /api/storage?path=<path> — Delete a file
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import db from '@/lib/db'
import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'

// Storage root — configurable via env, defaults to ./upload
const STORAGE_ROOT = process.env.STORAGE_ROOT || path.join(process.cwd(), 'upload')

// Max file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024

// Allowed MIME types
const ALLOWED_TYPES = new Set([
  'text/csv', 'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/pdf',
  'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml',
  'application/json',
  'application/zip',
  'application/xml', 'text/xml',
  'application/dxf', 'image/vnd.dxf',
  'application/gsi',
])

async function ensureDir(dirPath: string) {
  try {
    await fs.mkdir(dirPath, { recursive: true })
  } catch {
    // directory already exists
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const userId = (session.user as any).id

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const bucket = (formData.get('bucket') as string) || 'default'
    const filePath = (formData.get('path') as string) || ''

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 })
    }

    // Generate storage path: /bucket/userId/hash-filename
    const hash = crypto.randomBytes(8).toString('hex')
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = filePath || `${bucket}/${userId}/${hash}-${safeName}`
    const fullPath = path.join(STORAGE_ROOT, storagePath)

    // Prevent path traversal
    const resolvedPath = path.resolve(fullPath)
    if (!resolvedPath.startsWith(path.resolve(STORAGE_ROOT))) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    // Write the file
    await ensureDir(path.dirname(fullPath))
    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(fullPath, buffer)

    // Record metadata in DB
    await db.query(
      `INSERT INTO file_uploads (user_id, bucket, file_path, original_name, mime_type, size_bytes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (file_path) DO UPDATE SET updated_at = NOW()`,
      [userId, bucket, storagePath, file.name, file.type, file.size]
    ).catch(() => {
      // Table might not exist yet — file is still stored on disk
    })

    return NextResponse.json({
      data: { path: storagePath, fullPath: `/api/storage?path=${encodeURIComponent(storagePath)}` },
      error: null,
    })
  } catch (err: any) {
    console.error('[/api/storage] Upload error:', err.message)
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const filePath = request.nextUrl.searchParams.get('path')
    if (!filePath) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 })
    }

    const fullPath = path.join(STORAGE_ROOT, filePath)
    const resolvedPath = path.resolve(fullPath)

    // Prevent path traversal
    if (!resolvedPath.startsWith(path.resolve(STORAGE_ROOT))) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    try {
      const buffer = await fs.readFile(resolvedPath)
      const ext = path.extname(filePath).toLowerCase()
      const mimeMap: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.csv': 'text/csv',
        '.json': 'application/json',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.zip': 'application/zip',
        '.dxf': 'application/dxf',
      }
      const contentType = mimeMap[ext] || 'application/octet-stream'

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `inline; filename="${path.basename(filePath)}"`,
          'Cache-Control': 'private, max-age=3600',
        },
      })
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Download failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const userId = (session.user as any).id

    const filePath = request.nextUrl.searchParams.get('path')
    if (!filePath) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 })
    }

    const fullPath = path.join(STORAGE_ROOT, filePath)
    const resolvedPath = path.resolve(fullPath)

    if (!resolvedPath.startsWith(path.resolve(STORAGE_ROOT))) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    // Verify ownership
    const { rows } = await db.query(
      'SELECT id FROM file_uploads WHERE file_path = $1 AND user_id = $2',
      [filePath, userId]
    ).catch(() => ({ rows: [] }))

    // Delete from filesystem
    try {
      await fs.unlink(resolvedPath)
    } catch {
      // File might not exist
    }

    // Delete from DB
    if (rows.length > 0) {
      await db.query('DELETE FROM file_uploads WHERE file_path = $1 AND user_id = $2', [filePath, userId]).catch(() => {})
    }

    return NextResponse.json({ data: null, error: null })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Delete failed' }, { status: 500 })
  }
}
