import type { ParsedSurveyData } from '../droneTypes'

const MAX_UPLOAD_BYTES = 32 * 1024 * 1024

/** Parse LAS/LAZ through the authenticated compute worker. */
export async function parseLidar(file: File): Promise<ParsedSurveyData> {
  if (!/\.(las|laz)$/i.test(file.name)) {
    throw new Error('Choose a LAS or LAZ point-cloud file.')
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('LAS/LAZ uploads are limited to 32 MiB in the web point-cloud tool.')
  }

  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch('/api/compute/parse-lidar', {
    method: 'POST',
    body: formData,
    cache: 'no-store',
  })

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error(`Point-cloud service returned an invalid response (HTTP ${response.status}).`)
  }

  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : `Point-cloud processing failed (HTTP ${response.status}).`
    throw new Error(message)
  }

  return payload as ParsedSurveyData
}

/** Backwards-compatible parser exports. */
export function parseLas(file: File): Promise<ParsedSurveyData> {
  return parseLidar(file)
}

export function parseLaz(file: File): Promise<ParsedSurveyData> {
  return parseLidar(file)
}
