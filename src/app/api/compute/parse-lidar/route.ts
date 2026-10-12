import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { callPythonCompute } from '@/lib/compute/pythonService'
import { getClientIdentifier, rateLimit } from '@/lib/security/rateLimit'
import type { ParsedSurveyData } from '@/lib/importers/droneTypes'

const MAX_UPLOAD_BYTES = 32 * 1024 * 1024
const MAX_RETURNED_POINTS = 100_000

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = (session?.user as { id?: string } | undefined)?.id
  const identity = userId || getClientIdentifier(request)
  const limit = await rateLimit(`parse-lidar:${identity}`, 5, 60_000)
  if (!limit.allowed) {
    return json({ error: 'Too many point-cloud imports. Please wait a minute and try again.' }, 429)
  }

  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES + 64 * 1024) {
    return json({ error: 'LAS/LAZ uploads are limited to 32 MiB.' }, 413)
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return json({ error: 'Upload a valid multipart LAS/LAZ file.' }, 400)
  }

  const file = formData.get('file')
  if (!(file instanceof File)) return json({ error: 'No LAS/LAZ file was uploaded.' }, 400)
  if (!/\.(las|laz)$/i.test(file.name)) {
    return json({ error: 'Choose a .las or .laz point-cloud file.' }, 415)
  }
  if (file.size === 0) return json({ error: 'The uploaded point-cloud file is empty.' }, 400)
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: 'LAS/LAZ uploads are limited to 32 MiB.' }, 413)

  try {
    const dataBase64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    const result = await callPythonCompute<ParsedSurveyData>('parse_lidar', {
      filename: file.name,
      dataBase64,
      maxPoints: MAX_RETURNED_POINTS,
    }, { timeoutMs: 90_000 })

    if (!result.ok) {
      return json({ error: result.error, code: result.status === 503 ? 'WORKER_UNAVAILABLE' : 'LIDAR_PARSE_FAILED' }, result.status)
    }
    return json(result.value)
  } catch (err) {
    return json({
      error: err instanceof Error ? err.message : 'Point-cloud processing failed.',
      code: 'LIDAR_PARSE_FAILED',
    }, 500)
  }
}
