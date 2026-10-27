export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { z } from 'zod'
import { generateFullPackage } from '@/lib/generators/fullPackage'
import { generateDocument } from '@/lib/submission/assembleDocument'
import { uploadFile, getSignedUrl } from '@/lib/storage'
import { db } from '@/lib/db'

const PackageRequestSchema = z.object({
  projectId: z.string().guid('Valid project ID is required'),
})

export const POST = apiHandler(
  {
    auth: true,
    schema: PackageRequestSchema,
    audit: 'submission_package_generated',
    rateLimit: { max: 30, windowMs: 60000 },
  },
  async (req, ctx) => {
    const { projectId } = ctx.body as z.infer<typeof PackageRequestSchema>

    // 1. Verify project ownership
    const { rows } = await db.query<{ id: string; name: string }>(
      'SELECT id, name FROM projects WHERE id = $1 AND user_id = $2 LIMIT 1',
      [projectId, ctx.userId]
    )

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // 2. Generate full submission package buffer
    const zipBuffer = await generateFullPackage(projectId, ctx.userId, generateDocument)
    const filename = `submission-dossier-${projectId.slice(0, 8)}.zip`
    const storagePath = await uploadFile(zipBuffer, filename, 'application/zip', `submissions/${projectId}`)
    await db.query<never>(
      `INSERT INTO file_uploads (user_id, storage_path, filename, mime_type, size_bytes, project_id, upload_purpose)
       VALUES ($1, $2, $3, 'application/zip', $4, $5, 'submission')`,
      [ctx.userId, storagePath, filename, zipBuffer.length, projectId]
    )
    const downloadUrl = await getSignedUrl(storagePath, 60 * 60 * 24 * 7)

    // 3. Record in submission_documents
    await db.query<never>(
      `INSERT INTO submission_documents (project_id, document_id, document_type, status, file_url, error_message, generated_at)
       VALUES ($1, 'full-package', 'full-package', 'ready', $2, null, $3)
       ON CONFLICT (project_id, document_id)
       DO UPDATE SET status = 'ready', file_url = $2, error_message = null, generated_at = $3`,
      [projectId, downloadUrl, new Date().toISOString()]
    )

    return NextResponse.json({
      success: true,
      downloadUrl,
      fileUrl: downloadUrl,
    })
  }
)
