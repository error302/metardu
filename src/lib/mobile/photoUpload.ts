type StorageUploadResponse = {
  data?: { path?: unknown }
  error?: unknown
}

/** Upload a field photo through the authenticated, owner-scoped storage API. */
export async function uploadFieldPhoto(
  id: string,
  base64Data: string,
  projectId: string,
  contentType = 'image/jpeg',
  fileName = `${id}.jpg`,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const comma = base64Data.indexOf(',')
  const encoded = comma >= 0 ? base64Data.slice(comma + 1) : base64Data
  const dataUrlType = comma >= 0 ? base64Data.slice(5, base64Data.indexOf(';')) : ''
  if (!encoded) throw new Error('Photo data is empty')
  const uploadType = (dataUrlType || contentType).toLowerCase()
  if (!['image/jpeg', 'image/png', 'image/heic', 'image/heif'].includes(uploadType)) {
    throw new Error('Field photos must be JPEG, PNG, HEIC, or HEIF images')
  }

  let binary: string
  try {
    binary = atob(encoded)
  } catch {
    throw new Error('Photo data is not valid base64')
  }

  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  const form = new FormData()
  form.set('bucket', 'survey-photos')
  form.set('projectId', projectId)
  form.set('clientId', id)
  form.set('file', new Blob([bytes], { type: uploadType }), fileName || `${id}`)

  const response = await fetcher('/api/storage', { method: 'POST', body: form })
  const result = await response.json().catch(() => ({})) as StorageUploadResponse
  const path = result.data?.path
  if (!response.ok || typeof path !== 'string' || !path) {
    const message = typeof result.error === 'string' ? result.error : 'Photo upload failed'
    throw new Error(message)
  }
  return path
}

/** Remove a just-uploaded file if the corresponding field-photo row cannot be saved. */
export async function removeFieldPhoto(path: string, fetcher: typeof fetch = fetch): Promise<void> {
  const response = await fetcher(`/api/storage?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
  if (!response.ok) throw new Error('Could not remove the unlinked field photo')
}
