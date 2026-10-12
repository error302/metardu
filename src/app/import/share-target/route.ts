/**
 * /import/share-target — Web Share Target receiver
 *
 * Triggered when a user shares a CSV/GeoJSON/KML/XLSX file from another
 * Android/iOS app to METARDU (installed as PWA). The manifest declares this
 * as the share_target action. We persist the file via METARDU's storage
 * service and
 * redirect the user to the import page with the file preloaded.
 *
 * This is a POST endpoint (multipart/form-data per the manifest).
 */

import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { deleteFile, uploadFile } from '@/lib/storage'
const MAX_FILE_SIZE = 50 * 1024 * 1024

export const dynamic = 'force-dynamic'

export const POST = apiHandler(
  { auth: true, rawBody: true, rateLimit: { max: 10, windowMs: 60_000 } },
  async (request: NextRequest, ctx) => {
    const userId = ctx.userId
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }

    const file = formData.get('file') as File | null
    const title = (formData.get('title') as string | null) ?? ''
    const text = (formData.get('text') as string | null) ?? ''
    const url = (formData.get('url') as string | null) ?? ''

    // If a URL was shared instead of a file, redirect to import with the URL
    if (!file && url) {
      const importUrl = `/import?source=share&url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`
      return NextResponse.redirect(new URL(importUrl, request.url), 303)
    }

    if (!file) {
      return NextResponse.json({ error: 'No file received' }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 413 })
    }

    // Route storage through the shared backend so user uploads do not become
    // build-time assets or trigger a recursive Next.js file-tracing glob.
    const safeName = (file.name || 'shared-file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 240)
    const buffer = Buffer.from(await file.arrayBuffer())
    const storagePath = await uploadFile(buffer, safeName, file.type || 'application/octet-stream', 'shared')
    try {
      await db.query<never>(
        `INSERT INTO file_uploads (user_id, upload_purpose, storage_path, filename, mime_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, 'share-target', storagePath, (file.name || safeName).slice(0, 500), file.type || null, file.size],
      )
    } catch (error) {
      await deleteFile(storagePath).catch(() => {})
      throw error
    }

    // Redirect to /import page with the stored path so the UI can pick it up
    const params = new URLSearchParams({
      source: 'share',
      path: storagePath,
      name: file.name,
      type: file.type,
    })
    if (title) params.set('title', title)
    if (text) params.set('description', text)

    return NextResponse.redirect(new URL(`/import?${params.toString()}`, request.url), 303)
  },
)
